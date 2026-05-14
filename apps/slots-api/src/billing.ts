import Stripe from "stripe";
import type pg from "pg";
import { tokenHash } from "./auth.js";
import { clearActiveCustomDomainCache } from "./customDomains.js";
import { getPool, withTransaction } from "./db.js";
import {
  COMPANY_STANDBY_BOOKING_LIMIT,
  COMPANY_STANDBY_SLOT_LIMIT,
  EVENT_PASS_BOOKING_LIMIT,
  EVENT_PASS_RETENTION_DAYS,
  EVENT_PASS_SLOT_LIMIT,
  FREE_BOOKING_LIMIT,
  FREE_RETENTION_DAYS,
  FREE_SLOT_LIMIT,
} from "./entitlements.js";
import { billingReadiness, loadEnv } from "./env.js";
import { ApiError } from "./errors.js";
import { logInfo } from "./logger.js";

type CheckoutLineItem = NonNullable<
  NonNullable<Parameters<Stripe["checkout"]["sessions"]["create"]>[0]>["line_items"]
>[number];

type CompanyBillingInterval = "month" | "year";

export type CheckoutResponse = {
  checkoutSessionId: string;
  url: string;
  mode: "payment" | "subscription";
  productKey: "event_pass" | "company_standby";
};

export type AccountBillingResponse = {
  customer: {
    provider: "stripe";
    exists: boolean;
  };
  subscription?: {
    planKey: "company_standby";
    status: string;
    active: boolean;
    currentPeriodStart?: string | undefined;
    currentPeriodEnd?: string | undefined;
    cancelAtPeriodEnd: boolean;
  } | undefined;
  canOpenPortal: boolean;
};

export type CustomerPortalResponse = {
  url: string;
};

export type StripeCatalogSetupResponse = {
  products: {
    eventPass: {
      id: string;
      livemode: boolean;
    };
    companyStandby: {
      id: string;
      livemode: boolean;
    };
  };
  prices: {
    eventPass: {
      id: string;
      lookupKey: string | null;
      amount: number | null;
      currency: string;
      livemode: boolean;
    };
    companyStandby: {
      id: string;
      lookupKey: string | null;
      amount: number | null;
      currency: string;
      interval: "month";
      livemode: boolean;
    };
    companyStandbyAnnual: {
      id: string;
      lookupKey: string | null;
      amount: number | null;
      currency: string;
      interval: "year";
      livemode: boolean;
    };
  };
  webhookEndpoint: {
    id: string;
    url: string;
    status: string;
    livemode: boolean;
    secret: string | null;
  };
};

export function readBillingReadiness() {
  return billingReadiness(loadEnv());
}

export async function setupStripeCatalog(input: {
  webhookURL: string;
}): Promise<StripeCatalogSetupResponse> {
  const env = loadEnv();
  const stripe = stripeClient();
  const modeLabel = env.stripeSecretKey?.startsWith("sk_live_") ? "live" : "test";

  const eventPassProduct = await findOrCreateStripeProduct(stripe, {
    id: "prod_mytimes_event_pass",
    name: "mytimes Board Unlock",
    description: "One-board unlock for a larger interview round.",
    productKey: "event_pass",
    modeLabel,
  });
  const companyStandbyProduct = await findOrCreateStripeProduct(stripe, {
    id: "prod_mytimes_company_standby",
    name: "mytimes Company",
    description: "Always-on company workspace for interview booking rounds.",
    productKey: "company_standby",
    modeLabel,
  });
  const eventPassPrice = await findOrCreateStripePrice(stripe, {
    productId: eventPassProduct.id,
    lookupKey: `mytimes_event_pass_${env.billingCurrency}_${env.eventPassAmount}`,
    nickname: `Board Unlock ${env.billingCurrency.toUpperCase()} ${formatAmountLabel(env.eventPassAmount)}`,
    productKey: "event_pass",
    currency: env.billingCurrency,
    unitAmount: env.eventPassAmount,
    modeLabel,
  });
  const companyStandbyPrice = await findOrCreateStripePrice(stripe, {
    productId: companyStandbyProduct.id,
    lookupKey: `mytimes_company_standby_${env.billingCurrency}_${env.companyStandbyAmount}_monthly`,
    nickname: `Company ${env.billingCurrency.toUpperCase()} ${formatAmountLabel(env.companyStandbyAmount)} monthly`,
    productKey: "company_standby",
    currency: env.billingCurrency,
    unitAmount: env.companyStandbyAmount,
    recurringInterval: "month",
    modeLabel,
  });
  const companyStandbyAnnualPrice = await findOrCreateStripePrice(stripe, {
    productId: companyStandbyProduct.id,
    lookupKey: `mytimes_company_standby_${env.billingCurrency}_${env.companyStandbyAnnualAmount}_annual`,
    nickname: `Company ${env.billingCurrency.toUpperCase()} ${formatAmountLabel(env.companyStandbyAnnualAmount)} annual`,
    productKey: "company_standby",
    currency: env.billingCurrency,
    unitAmount: env.companyStandbyAnnualAmount,
    recurringInterval: "year",
    modeLabel,
  });
  const webhookEndpoint = env.stripeWebhookSecret
    ? {
        id: "configured",
        url: input.webhookURL,
        status: "configured",
        livemode: modeLabel === "live",
        secret: null,
      }
    : await stripe.webhookEndpoints.create({
        url: input.webhookURL,
        description: `mytimes billing webhook (${modeLabel})`,
        enabled_events: [
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
          "checkout.session.async_payment_failed",
          "customer.subscription.created",
          "customer.subscription.updated",
          "customer.subscription.deleted",
        ],
        metadata: {
          app: "mytimes",
          environment: modeLabel,
        },
      });

  return {
    products: {
      eventPass: {
        id: eventPassProduct.id,
        livemode: eventPassProduct.livemode,
      },
      companyStandby: {
        id: companyStandbyProduct.id,
        livemode: companyStandbyProduct.livemode,
      },
    },
    prices: {
      eventPass: {
        id: eventPassPrice.id,
        lookupKey: eventPassPrice.lookup_key,
        amount: eventPassPrice.unit_amount,
        currency: eventPassPrice.currency,
        livemode: eventPassPrice.livemode,
      },
      companyStandby: {
        id: companyStandbyPrice.id,
        lookupKey: companyStandbyPrice.lookup_key,
        amount: companyStandbyPrice.unit_amount,
        currency: companyStandbyPrice.currency,
        interval: "month",
        livemode: companyStandbyPrice.livemode,
      },
      companyStandbyAnnual: {
        id: companyStandbyAnnualPrice.id,
        lookupKey: companyStandbyAnnualPrice.lookup_key,
        amount: companyStandbyAnnualPrice.unit_amount,
        currency: companyStandbyAnnualPrice.currency,
        interval: "year",
        livemode: companyStandbyAnnualPrice.livemode,
      },
    },
    webhookEndpoint: {
      id: webhookEndpoint.id,
      url: webhookEndpoint.url,
      status: webhookEndpoint.status,
      livemode: webhookEndpoint.livemode,
      secret: webhookEndpoint.secret ?? null,
    },
  };
}

export async function createEventPassCheckout(rawAdminToken: string): Promise<CheckoutResponse> {
  const env = loadEnv();
  assertCheckoutFulfillmentConfigured(env);
  const stripe = stripeClient();
  const event = await readEventByAdminToken(rawAdminToken);
  return createEventPassCheckoutForEvent({
    env,
    stripe,
    event,
    successPath: `/a/${rawAdminToken}?checkout=event_pass&session_id={CHECKOUT_SESSION_ID}`,
    cancelPath: `/a/${rawAdminToken}?checkout=cancelled`,
  });
}

export async function createOrganizerEventPassCheckout(input: {
  ownerUserId: string;
  eventId: string;
}): Promise<CheckoutResponse> {
  const env = loadEnv();
  assertCheckoutFulfillmentConfigured(env);
  const stripe = stripeClient();
  const event = await readEventByOwner(input.ownerUserId, input.eventId);
  return createEventPassCheckoutForEvent({
    env,
    stripe,
    event,
    successPath: `/account/events/${input.eventId}?checkout=event_pass&session_id={CHECKOUT_SESSION_ID}`,
    cancelPath: `/account/events/${input.eventId}?checkout=cancelled`,
  });
}

async function createEventPassCheckoutForEvent(input: {
  env: ReturnType<typeof loadEnv>;
  stripe: Stripe;
  event: EventBillingRow;
  successPath: string;
  cancelPath: string;
}): Promise<CheckoutResponse> {
  const { env, stripe, event } = input;
  if (event.payment_status === "paid" || event.plan_key === "company_standby") {
    throw new ApiError(409, "event_already_paid", "This board is already unlocked");
  }
  if (event.status !== "active") {
    throw new ApiError(409, "event_not_active", "Only active boards can be upgraded");
  }

  const successURL = buildAppURL(input.successPath, env.publicAppURL);
  const cancelURL = buildAppURL(input.cancelPath, env.publicAppURL);
  const metadata = {
    productKey: "event_pass",
    eventId: event.id,
    organizerEmail: event.organizer_email,
  };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: event.organizer_email,
    client_reference_id: event.id,
    success_url: successURL,
    cancel_url: cancelURL,
    metadata,
    payment_intent_data: {
      metadata,
    },
    line_items: [
      eventPassLineItem(env),
    ],
  });

  if (!session.url) {
    throw new ApiError(502, "checkout_session_missing_url", "Stripe did not return a Checkout URL");
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        update slotboard.booking_events
        set payment_status = 'pending',
            stripe_checkout_session_id = $2
        where id = $1
      `,
      [event.id, session.id],
    );
    await client.query(
      `
        insert into slotboard.event_purchases (
          event_id,
          owner_email,
          provider_checkout_session_id,
          product_key,
          amount,
          currency,
          status
        )
        values ($1, $2, $3, 'event_pass', $4, $5, 'pending')
        on conflict (provider_checkout_session_id) do update
        set status = excluded.status,
            amount = excluded.amount,
            currency = excluded.currency
      `,
      [event.id, event.organizer_email, session.id, env.eventPassAmount, env.billingCurrency],
    );
  });

  return {
    checkoutSessionId: session.id,
    url: session.url,
    mode: "payment",
    productKey: "event_pass",
  };
}

export async function createCompanyStandbyCheckout(input: {
  ownerUserId: string;
  ownerEmail: string;
  billingInterval?: CompanyBillingInterval | undefined;
}): Promise<CheckoutResponse> {
  const env = loadEnv();
  assertCheckoutFulfillmentConfigured(env);
  const stripe = stripeClient();
  const billingInterval = input.billingInterval ?? "month";
  const metadata = {
    productKey: "company_standby",
    ownerUserId: input.ownerUserId,
    ownerEmail: input.ownerEmail,
    billingInterval,
  };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: input.ownerEmail,
    client_reference_id: input.ownerUserId,
    success_url: buildAppURL(
      "/account?checkout=company_standby&session_id={CHECKOUT_SESSION_ID}",
      env.publicAppURL,
    ),
    cancel_url: buildAppURL("/account?checkout=cancelled", env.publicAppURL),
    metadata,
    subscription_data: {
      metadata,
    },
    line_items: [
      companyStandbyLineItem(env, billingInterval),
    ],
  });

  if (!session.url) {
    throw new ApiError(502, "checkout_session_missing_url", "Stripe did not return a Checkout URL");
  }

  return {
    checkoutSessionId: session.id,
    url: session.url,
    mode: "subscription",
    productKey: "company_standby",
  };
}

export async function readOrganizerBilling(input: {
  ownerUserId: string;
  ownerEmail: string;
}): Promise<AccountBillingResponse> {
  const [customerId, subscription] = await Promise.all([
    readBillingCustomerId(input),
    readLatestSubscription(input),
  ]);
  const hasCustomer = Boolean(customerId ?? subscription?.provider_customer_id);
  return {
    customer: {
      provider: "stripe",
      exists: hasCustomer,
    },
    subscription: subscription ? {
      planKey: subscription.plan_key,
      status: subscription.status,
      active: isActiveStoredSubscription(subscription),
      currentPeriodStart: subscription.current_period_start?.toISOString(),
      currentPeriodEnd: subscription.current_period_end?.toISOString(),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    } : undefined,
    canOpenPortal: hasCustomer && readBillingReadiness().productionReady,
  };
}

export async function createCustomerPortalSession(input: {
  ownerUserId: string;
  ownerEmail: string;
}): Promise<CustomerPortalResponse> {
  const env = loadEnv();
  assertCheckoutFulfillmentConfigured(env);
  const customerId = await readBillingCustomerId(input);
  if (!customerId) {
    throw new ApiError(
      404,
      "billing_customer_not_found",
      "No Stripe billing customer exists for this account yet.",
    );
  }

  const session = await stripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: buildAppURL("/account?billing=portal_return", env.publicAppURL),
  });

  return { url: session.url };
}

export async function handleStripeWebhook(input: {
  rawBody: string;
  signature: string | undefined;
}): Promise<{ ok: true; eventType: string; duplicate?: boolean }> {
  const env = loadEnv();
  if (!env.stripeWebhookSecret) {
    throw new ApiError(500, "stripe_webhook_not_configured", "Stripe webhook secret is not configured");
  }
  if (!input.signature) {
    throw new ApiError(400, "stripe_signature_missing", "Stripe-Signature header is required");
  }

  const event = stripeClient().webhooks.constructEvent(
    input.rawBody,
    input.signature,
    env.stripeWebhookSecret,
  );

  const claimed = await claimStripeWebhookEvent(event);
  if (!claimed) {
    logInfo("slotboard_stripe_webhook_duplicate", {
      eventType: event.type,
      stripeEventId: event.id,
    });
    return { ok: true, eventType: event.type, duplicate: true };
  }

  try {
    await processStripeWebhookEvent(event);
    await markStripeWebhookEventProcessed(event);
  } catch (error) {
    await releaseStripeWebhookEventClaim(event);
    throw error;
  }

  logInfo("slotboard_stripe_webhook_processed", {
    eventType: event.type,
    stripeEventId: event.id,
  });

  return { ok: true, eventType: event.type };
}

async function processStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    await fulfillCheckoutSession(event.data.object as Stripe.Checkout.Session);
  } else if (event.type === "checkout.session.async_payment_failed") {
    await failCheckoutSession(event.data.object as Stripe.Checkout.Session);
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await upsertSubscription(event.data.object as Stripe.Subscription);
  }
}

async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const productKey = session.metadata?.productKey;
  if (productKey === "event_pass") {
    await fulfillEventPass(session);
    return;
  }
  if (productKey === "company_standby") {
    await upsertSubscriptionFromCheckoutSession(session);
  }
}

async function fulfillEventPass(session: Stripe.Checkout.Session): Promise<void> {
  const eventId = session.metadata?.eventId;
  if (!eventId) {
    throw new ApiError(400, "stripe_event_metadata_missing", "Board unlock session is missing event metadata");
  }
  if (session.mode === "payment" && session.payment_status !== "paid") {
    logInfo("slotboard_event_pass_checkout_waiting_for_payment", {
      eventId,
      checkoutSessionId: session.id,
      paymentStatus: session.payment_status,
    });
    return;
  }

  const customerId = stringId(session.customer);
  const paymentIntentId = stringId(session.payment_intent);

  await withTransaction(async (client) => {
    const event = await client.query<BillingEventRow>(
      `
        update slotboard.booking_events
        set plan_key = case
              when plan_key = 'company_standby' then 'company_standby'
              else 'event_pass'
            end,
            payment_status = 'paid',
            paid_at = coalesce(paid_at, now()),
            expires_at = case
              when plan_key = 'company_standby' then expires_at
              else greatest(coalesce(expires_at, now()), now() + ($4::int * interval '1 day'))
            end,
            booking_limit = case
              when plan_key = 'company_standby' then booking_limit
              else $5
            end,
            slot_limit = case
              when plan_key = 'company_standby' then slot_limit
              else $6
            end,
            stripe_checkout_session_id = $2,
            stripe_customer_id = $3
        where id = $1
          and deleted_at is null
        returning id, organizer_email, owner_user_id
      `,
      [
        eventId,
        session.id,
        customerId,
        EVENT_PASS_RETENTION_DAYS,
        EVENT_PASS_BOOKING_LIMIT,
        EVENT_PASS_SLOT_LIMIT,
      ],
    );
    const row = event.rows[0];
    if (!row) {
      throw new ApiError(404, "event_not_found", "Paid event not found");
    }
    await upsertBillingCustomer(client, {
      ownerEmail: row.organizer_email,
      ownerUserId: row.owner_user_id,
      customerId,
    });
    await client.query(
      `
        insert into slotboard.event_purchases (
          event_id,
          owner_email,
          provider_checkout_session_id,
          provider_payment_intent_id,
          provider_customer_id,
          product_key,
          amount,
          currency,
          status
        )
        values ($1, $2, $3, $4, $5, 'event_pass', $6, $7, 'paid')
        on conflict (provider_checkout_session_id) do update
        set provider_payment_intent_id = excluded.provider_payment_intent_id,
            provider_customer_id = excluded.provider_customer_id,
            status = 'paid'
      `,
      [
        eventId,
        row.organizer_email,
        session.id,
        paymentIntentId,
        customerId,
        session.amount_total ?? 0,
        session.currency ?? "usd",
      ],
    );
  });
}

async function failCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.productKey !== "event_pass") {
    return;
  }
  const eventId = session.metadata.eventId;
  if (!eventId) {
    throw new ApiError(400, "stripe_event_metadata_missing", "Board unlock session is missing event metadata");
  }
  const paymentIntentId = stringId(session.payment_intent);
  const customerId = stringId(session.customer);

  await withTransaction(async (client) => {
    const updated = await client.query<BillingEventRow>(
      `
        update slotboard.booking_events
        set plan_key = 'free',
            payment_status = 'failed',
            stripe_checkout_session_id = null,
            stripe_customer_id = coalesce(stripe_customer_id, $3)
        where id = $1
          and stripe_checkout_session_id = $2
          and payment_status = 'pending'
          and deleted_at is null
        returning id, organizer_email, owner_user_id
      `,
      [eventId, session.id, customerId],
    );
    const row = updated.rows[0];
    if (!row) {
      return;
    }
    await upsertBillingCustomer(client, {
      ownerEmail: row.organizer_email,
      ownerUserId: row.owner_user_id,
      customerId,
    });
    await client.query(
      `
        insert into slotboard.event_purchases (
          event_id,
          owner_email,
          provider_checkout_session_id,
          provider_payment_intent_id,
          provider_customer_id,
          product_key,
          amount,
          currency,
          status
        )
        values ($1, $2, $3, $4, $5, 'event_pass', $6, $7, 'failed')
        on conflict (provider_checkout_session_id) do update
        set provider_payment_intent_id = excluded.provider_payment_intent_id,
            provider_customer_id = excluded.provider_customer_id,
            status = 'failed'
      `,
      [
        eventId,
        row.organizer_email,
        session.id,
        paymentIntentId,
        customerId,
        session.amount_total ?? 0,
        session.currency ?? "usd",
      ],
    );
  });
}

async function claimStripeWebhookEvent(event: Stripe.Event): Promise<boolean> {
  const result = await getPool().query<{ id: string }>(
    `
      insert into slotboard.stripe_webhook_events (
        provider_event_id,
        event_type
      )
      values ($1, $2)
      on conflict (provider_event_id) do nothing
      returning id
    `,
    [event.id, event.type],
  );
  return Boolean(result.rows[0]);
}

async function markStripeWebhookEventProcessed(event: Stripe.Event): Promise<void> {
  await getPool().query(
    `
      update slotboard.stripe_webhook_events
      set processed_at = now()
      where provider_event_id = $1
    `,
    [event.id],
  );
}

async function releaseStripeWebhookEventClaim(event: Stripe.Event): Promise<void> {
  await getPool().query(
    `
      delete from slotboard.stripe_webhook_events
      where provider_event_id = $1
        and processed_at is null
    `,
    [event.id],
  );
}

async function upsertSubscriptionFromCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const subscriptionId = stringId(session.subscription);
  if (!subscriptionId) {
    throw new ApiError(400, "stripe_subscription_missing", "Company session is missing subscription");
  }
  const subscription = await stripeClient().subscriptions.retrieve(subscriptionId);
  await upsertSubscription(subscription, {
    ownerEmail: session.metadata?.ownerEmail ?? session.customer_details?.email ?? undefined,
    ownerUserId: session.metadata?.ownerUserId,
  });
}

async function upsertSubscription(
  subscription: Stripe.Subscription,
  fallback: { ownerEmail?: string | undefined; ownerUserId?: string | undefined } = {},
): Promise<void> {
  const metadata = subscription.metadata ?? {};
  const ownerEmail = metadata.ownerEmail || fallback.ownerEmail;
  if (!ownerEmail) {
    throw new ApiError(400, "stripe_subscription_owner_missing", "Subscription is missing owner email");
  }
  const ownerUserId = metadata.ownerUserId || fallback.ownerUserId || null;
  const customerId = stringId(subscription.customer);

  await withTransaction(async (client) => {
    await upsertBillingCustomer(client, {
      ownerEmail,
      ownerUserId,
      customerId,
    });
    await client.query(
      `
        insert into slotboard.subscriptions (
          owner_email,
          owner_user_id,
          provider_customer_id,
          provider_subscription_id,
          plan_key,
          status,
          current_period_start,
          current_period_end,
          cancel_at_period_end
        )
        values ($1, $2, $3, $4, 'company_standby', $5, $6, $7, $8)
        on conflict (provider_subscription_id) do update
        set owner_email = excluded.owner_email,
            owner_user_id = excluded.owner_user_id,
            provider_customer_id = excluded.provider_customer_id,
            status = excluded.status,
            current_period_start = excluded.current_period_start,
            current_period_end = excluded.current_period_end,
            cancel_at_period_end = excluded.cancel_at_period_end
      `,
      [
        ownerEmail,
        ownerUserId,
        customerId,
        subscription.id,
        subscription.status,
        stripeTimestamp(subscriptionFieldNumber(subscription, "current_period_start")),
        stripeTimestamp(subscriptionFieldNumber(subscription, "current_period_end")),
        Boolean(subscriptionFieldBoolean(subscription, "cancel_at_period_end")),
      ],
    );
    if (ownerUserId) {
      if (isActiveCompanyStandbySubscription(subscription)) {
        await applyCompanyStandbyToOwnerEvents(client, {
          ownerUserId,
          customerId,
        });
      } else {
        await removeCompanyStandbyFromOwnerEvents(client, ownerUserId);
      }
    }
  });
  clearActiveCustomDomainCache();
}

async function applyCompanyStandbyToOwnerEvents(
  client: pg.PoolClient,
  input: {
    ownerUserId: string;
    customerId: string | null;
  },
): Promise<void> {
  await client.query(
    `
      update slotboard.booking_events
      set plan_key = 'company_standby',
          payment_status = 'paid',
          paid_at = coalesce(paid_at, now()),
          expires_at = null,
          booking_limit = $2,
          slot_limit = $3,
          stripe_customer_id = $4
      where owner_user_id = $1
        and status = 'active'
        and deleted_at is null
    `,
    [input.ownerUserId, COMPANY_STANDBY_BOOKING_LIMIT, COMPANY_STANDBY_SLOT_LIMIT, input.customerId],
  );
}

async function removeCompanyStandbyFromOwnerEvents(
  client: pg.PoolClient,
  ownerUserId: string,
): Promise<void> {
  await client.query(
    `
      with paid_event_passes as (
        select distinct on (event_id)
          event_id,
          updated_at as purchase_paid_at
        from slotboard.event_purchases
        where product_key = 'event_pass'
          and status = 'paid'
        order by event_id, updated_at desc
      )
      update slotboard.booking_events e
      set plan_key = case
            when p.event_id is not null then 'event_pass'
            else 'free'
          end,
          payment_status = case
            when p.event_id is not null then 'paid'
            else 'not_required'
          end,
          paid_at = case
            when p.event_id is not null then coalesce(e.paid_at, p.purchase_paid_at, now())
            else null
          end,
          expires_at = case
            when p.event_id is not null then coalesce(e.paid_at, p.purchase_paid_at, now()) + ($2::int * interval '1 day')
            else coalesce(e.expires_at, e.created_at + ($5::int * interval '1 day'))
          end,
          booking_limit = case
            when p.event_id is not null then $3::int
            else $6::int
          end,
          slot_limit = case
            when p.event_id is not null then $4::int
            else $7::int
          end
      from paid_event_passes p
      where e.owner_user_id = $1
        and e.plan_key = 'company_standby'
        and e.deleted_at is null
        and p.event_id = e.id
    `,
    [
      ownerUserId,
      EVENT_PASS_RETENTION_DAYS,
      EVENT_PASS_BOOKING_LIMIT,
      EVENT_PASS_SLOT_LIMIT,
      FREE_RETENTION_DAYS,
      FREE_BOOKING_LIMIT,
      FREE_SLOT_LIMIT,
    ],
  );

  await client.query(
    `
      update slotboard.booking_events
      set plan_key = 'free',
          payment_status = 'not_required',
          paid_at = null,
          expires_at = coalesce(expires_at, created_at + ($2::int * interval '1 day')),
          booking_limit = $3,
          slot_limit = $4
      where owner_user_id = $1
        and plan_key = 'company_standby'
        and deleted_at is null
    `,
    [ownerUserId, FREE_RETENTION_DAYS, FREE_BOOKING_LIMIT, FREE_SLOT_LIMIT],
  );
}

async function upsertBillingCustomer(
  client: pg.PoolClient,
  input: {
    ownerEmail: string;
    ownerUserId: string | null;
    customerId: string | null;
  },
): Promise<void> {
  if (!input.customerId) {
    return;
  }
  await client.query(
    `
      insert into slotboard.billing_customers (
        owner_email,
        owner_user_id,
        provider_customer_id
      )
      values ($1, $2, $3)
      on conflict (provider_customer_id) do update
      set owner_email = excluded.owner_email,
          owner_user_id = coalesce(excluded.owner_user_id, slotboard.billing_customers.owner_user_id)
    `,
    [input.ownerEmail, input.ownerUserId, input.customerId],
  );
}

async function readEventByAdminToken(rawAdminToken: string): Promise<EventBillingRow> {
  const result = await getPool().query<EventBillingRow>(
    `
      select
        id,
        organizer_email,
        status,
        plan_key,
        payment_status
      from slotboard.booking_events
      where admin_token_hash = $1
        and deleted_at is null
    `,
    [tokenHash(rawAdminToken)],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "event_not_found", "Event not found");
  }
  return row;
}

async function readEventByOwner(ownerUserId: string, eventId: string): Promise<EventBillingRow> {
  const result = await getPool().query<EventBillingRow>(
    `
      select
        id,
        organizer_email,
        status,
        plan_key,
        payment_status
      from slotboard.booking_events
      where id = $1
        and owner_user_id = $2
        and deleted_at is null
    `,
    [eventId, ownerUserId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "event_not_found", "Event not found");
  }
  return row;
}

async function readBillingCustomerId(input: {
  ownerUserId: string;
  ownerEmail: string;
}): Promise<string | null> {
  const result = await getPool().query<{ provider_customer_id: string }>(
    `
      select provider_customer_id
      from slotboard.billing_customers
      where owner_user_id = $1
        or lower(owner_email) = lower($2)
      order by
        case when owner_user_id = $1 then 0 else 1 end,
        updated_at desc
      limit 1
    `,
    [input.ownerUserId, input.ownerEmail],
  );
  return result.rows[0]?.provider_customer_id ?? null;
}

async function readLatestSubscription(input: {
  ownerUserId: string;
  ownerEmail: string;
}): Promise<SubscriptionBillingRow | null> {
  const result = await getPool().query<SubscriptionBillingRow>(
    `
      select
        provider_customer_id,
        plan_key,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end
      from slotboard.subscriptions
      where owner_user_id = $1
        or lower(owner_email) = lower($2)
      order by
        case when status in ('active', 'trialing') then 0 else 1 end,
        case when owner_user_id = $1 then 0 else 1 end,
        current_period_end desc nulls last,
        updated_at desc
      limit 1
    `,
    [input.ownerUserId, input.ownerEmail],
  );
  return result.rows[0] ?? null;
}

function stripeClient(): Stripe {
  const env = loadEnv();
  if (!env.stripeSecretKey) {
    throw new ApiError(409, "billing_not_configured", "Stripe Checkout is not configured");
  }
  return new Stripe(env.stripeSecretKey, {
    apiVersion: Stripe.API_VERSION,
  });
}

async function findOrCreateStripeProduct(
  stripe: Stripe,
  input: {
    id: string;
    name: string;
    description: string;
    productKey: string;
    modeLabel: string;
  },
): Promise<Stripe.Product> {
  try {
    return await stripe.products.retrieve(input.id);
  } catch (error) {
    if (!isStripeMissingResource(error)) {
      throw error;
    }
  }

  return stripe.products.create({
    id: input.id,
    name: input.name,
    description: input.description,
    metadata: {
      app: "mytimes",
      productKey: input.productKey,
      environment: input.modeLabel,
    },
  });
}

async function findOrCreateStripePrice(
  stripe: Stripe,
  input: {
    productId: string;
    lookupKey: string;
    nickname: string;
    productKey: string;
    currency: string;
    unitAmount: number;
    recurringInterval?: CompanyBillingInterval | undefined;
    modeLabel: string;
  },
): Promise<Stripe.Price> {
  const existing = await stripe.prices.list({
    active: true,
    lookup_keys: [input.lookupKey],
    limit: 1,
  });
  const existingPrice = existing.data[0];
  if (existingPrice) {
    return existingPrice;
  }

  const priceParams: Stripe.PriceCreateParams = {
    product: input.productId,
    currency: input.currency,
    unit_amount: input.unitAmount,
    lookup_key: input.lookupKey,
    nickname: input.nickname,
    metadata: {
      app: "mytimes",
      productKey: input.productKey,
      environment: input.modeLabel,
    },
  };
  if (input.recurringInterval) {
    priceParams.recurring = {
      interval: input.recurringInterval,
    };
  }

  return stripe.prices.create(priceParams);
}

function isStripeMissingResource(error: unknown): boolean {
  const stripeError = error as { code?: string; statusCode?: number; type?: string };
  return stripeError.code === "resource_missing" || stripeError.statusCode === 404;
}

function formatAmountLabel(amount: number): string {
  return String(amount / 100).replace(/\.00$/, "");
}

function eventPassLineItem(env: ReturnType<typeof loadEnv>): CheckoutLineItem {
  if (env.stripeEventPassPriceId) {
    return {
      quantity: 1,
      price: env.stripeEventPassPriceId,
    };
  }

  return {
    quantity: 1,
    price_data: {
      currency: env.billingCurrency,
      unit_amount: env.eventPassAmount,
      product_data: {
        name: "mytimes Board Unlock",
        description: "One-board unlock for a larger interview round.",
      },
    },
  };
}

function companyStandbyLineItem(env: ReturnType<typeof loadEnv>, interval: CompanyBillingInterval = "month"): CheckoutLineItem {
  const catalogPriceId = interval === "year"
    ? env.stripeCompanyStandbyAnnualPriceId
    : env.stripeCompanyStandbyPriceId;
  if (catalogPriceId) {
    return {
      quantity: 1,
      price: catalogPriceId,
    };
  }

  const unitAmount = interval === "year" ? env.companyStandbyAnnualAmount : env.companyStandbyAmount;
  return {
    quantity: 1,
    price_data: {
      currency: env.billingCurrency,
      unit_amount: unitAmount,
      recurring: {
        interval,
      },
      product_data: {
        name: "mytimes Company",
        description: "Always-on company workspace for interview booking rounds.",
      },
    },
  };
}

function assertCheckoutFulfillmentConfigured(env: ReturnType<typeof loadEnv>): void {
  if (!env.stripeSecretKey || !env.stripeWebhookSecret) {
    throw new ApiError(
      409,
      "billing_not_configured",
      "Stripe Checkout requires both a Stripe secret key and webhook secret before payments can be accepted",
    );
  }
}

function stringId(value: string | { id: string } | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return typeof value === "string" ? value : value.id;
}

function stripeTimestamp(value: number | undefined): Date | null {
  return value ? new Date(value * 1000) : null;
}

function subscriptionFieldNumber(subscription: Stripe.Subscription, key: string): number | undefined {
  const value = (subscription as unknown as Record<string, unknown>)[key];
  return typeof value === "number" ? value : undefined;
}

function subscriptionFieldBoolean(subscription: Stripe.Subscription, key: string): boolean | undefined {
  const value = (subscription as unknown as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

function isActiveCompanyStandbySubscription(subscription: Stripe.Subscription): boolean {
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    return false;
  }
  const currentPeriodEnd = stripeTimestamp(subscriptionFieldNumber(subscription, "current_period_end"));
  if (!currentPeriodEnd) {
    return true;
  }
  return currentPeriodEnd.getTime() > Date.now();
}

function isActiveStoredSubscription(row: SubscriptionBillingRow): boolean {
  if (row.status !== "active" && row.status !== "trialing") {
    return false;
  }
  if (!row.current_period_end) {
    return true;
  }
  return row.current_period_end.getTime() > Date.now();
}

function buildAppURL(path: string, baseURL: string): string {
  return new URL(path, withTrailingSlash(baseURL)).toString();
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

type EventBillingRow = {
  id: string;
  organizer_email: string;
  status: "active" | "archived" | "deleted";
  plan_key: "free" | "event_pass" | "company_standby";
  payment_status: "not_required" | "pending" | "paid" | "failed" | "refunded";
};

type BillingEventRow = {
  id: string;
  organizer_email: string;
  owner_user_id: string | null;
};

type SubscriptionBillingRow = {
  provider_customer_id: string;
  plan_key: "company_standby";
  status: string;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
};
