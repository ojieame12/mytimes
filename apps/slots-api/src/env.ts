export type Env = {
  port: number;
  databaseURL: string | undefined;
  webOrigins: string[];
  publicAppURL: string;
  tokenPepper: string;
  authSecret: string;
  authBaseURL: string;
  dbPoolMax: number;
  dbConnectionTimeoutMs: number;
  dbIdleTimeoutMs: number;
  dbQueryTimeoutMs: number;
  dbStatementTimeoutMs: number;
  gracefulShutdownMs: number;
  emailProvider: "console" | "resend" | "postmark";
  senderEmail: string;
  resendApiKey: string | undefined;
  resendWebhookSecret: string | undefined;
  postmarkServerToken: string | undefined;
  postmarkMessageStream: string;
  emailWebhookSecret: string | undefined;
  opsSecret: string | undefined;
  retentionEnabled: boolean;
  retentionArchiveAfterDays: number;
  retentionDeleteArchivedAfterDays: number;
  retentionPiiScrubAfterDays: number;
  retentionRateLimitAfterDays: number;
  retentionIdempotencyAfterDays: number;
  stripeSecretKey: string | undefined;
  stripeWebhookSecret: string | undefined;
  stripeEventPassPriceId: string | undefined;
  stripeCompanyStandbyPriceId: string | undefined;
  stripeCompanyStandbyAnnualPriceId: string | undefined;
  billingCurrency: string;
  eventPassAmount: number;
  companyStandbyAmount: number;
  companyStandbyAnnualAmount: number;
  customDomainCnameTarget: string;
  sentryDsn: string | undefined;
  sentryEnvironment: string;
  sentryRelease: string | undefined;
};

export type EmailReadiness = {
  provider: Env["emailProvider"];
  senderEmail: string;
  deliveryConfigured: boolean;
  webhookConfigured: boolean;
  bounceTrackingConfigured?: boolean | undefined;
  productionReady: boolean;
  requiredVariables: string[];
  optionalVariables: string[];
  webhookPath: string;
  issues: string[];
};

export type BillingReadiness = {
  provider: "stripe";
  checkoutConfigured: boolean;
  webhookConfigured: boolean;
  productionReady: boolean;
  currency: string;
  products: {
    eventPass: {
      amount: number;
      displayPrice: string;
      priceId?: string | undefined;
    };
    companyStandby: {
      amount: number;
      displayPrice: string;
      interval: "month";
      priceId?: string | undefined;
    };
    companyStandbyAnnual: {
      amount: number;
      displayPrice: string;
      interval: "year";
      priceId?: string | undefined;
    };
  };
  requiredVariables: string[];
  optionalVariables: string[];
  webhookPath: string;
  issues: string[];
};

export type CustomDomainReadiness = {
  cnameTarget: string;
  requestAndVerifyConfigured: boolean;
  activationMode: "ops_manual";
  selfServeActivation: boolean;
  publicAppURL: string;
  issues: string[];
};

export type ObservabilityReadiness = {
  provider: "sentry";
  errorTrackingConfigured: boolean;
  productionReady: boolean;
  requiredVariables: string[];
  optionalVariables: string[];
  issues: string[];
};

export function loadEnv(): Env {
  const webOrigins = listEnv("SLOTBOARD_WEB_ORIGINS", [
    "http://127.0.0.1:5174",
    "http://localhost:5174",
  ]);
  const tokenPepper = env("SLOTBOARD_TOKEN_PEPPER", "dev-token-pepper-replace-before-production");
  const authSecret =
    optionalEnv("SLOTBOARD_AUTH_SECRET") ??
    optionalEnv("BETTER_AUTH_SECRET") ??
    "dev-better-auth-secret-replace-before-production";
  const port = numberEnv("PORT", 3014);
  const publicAppURL = env("SLOTBOARD_PUBLIC_APP_URL", webOrigins[0] ?? "http://127.0.0.1:5174");

  const config: Env = {
    port,
    databaseURL: optionalEnv("SLOTBOARD_DATABASE_URL") ?? optionalEnv("DATABASE_URL"),
    webOrigins,
    publicAppURL,
    tokenPepper,
    authSecret,
    authBaseURL: env("SLOTBOARD_AUTH_BASE_URL", `http://127.0.0.1:${port}`),
    dbPoolMax: numberEnv("SLOTBOARD_DB_POOL_MAX", 10),
    dbConnectionTimeoutMs: numberEnv("SLOTBOARD_DB_CONNECTION_TIMEOUT_MS", 5000),
    dbIdleTimeoutMs: numberEnv("SLOTBOARD_DB_IDLE_TIMEOUT_MS", 30000),
    dbQueryTimeoutMs: numberEnv("SLOTBOARD_DB_QUERY_TIMEOUT_MS", 10000),
    dbStatementTimeoutMs: numberEnv("SLOTBOARD_DB_STATEMENT_TIMEOUT_MS", 10000),
    gracefulShutdownMs: numberEnv("SLOTBOARD_GRACEFUL_SHUTDOWN_MS", 10000),
    emailProvider: emailProviderEnv("SLOTBOARD_EMAIL_PROVIDER", "console"),
    senderEmail: env("SLOTBOARD_SENDER_EMAIL", "mytimes <bookings@example.com>"),
    resendApiKey: optionalEnv("RESEND_API_KEY") ?? optionalEnv("SLOTBOARD_RESEND_API_KEY"),
    resendWebhookSecret: optionalEnv("RESEND_WEBHOOK_SECRET") ?? optionalEnv("SLOTBOARD_RESEND_WEBHOOK_SECRET"),
    postmarkServerToken: optionalEnv("POSTMARK_SERVER_TOKEN") ?? optionalEnv("SLOTBOARD_POSTMARK_SERVER_TOKEN"),
    postmarkMessageStream: env("SLOTBOARD_POSTMARK_MESSAGE_STREAM", "outbound"),
    emailWebhookSecret: optionalEnv("SLOTBOARD_EMAIL_WEBHOOK_SECRET"),
    opsSecret: optionalEnv("SLOTBOARD_OPS_SECRET"),
    retentionEnabled: booleanEnv("SLOTBOARD_RETENTION_ENABLED", true),
    retentionArchiveAfterDays: numberEnv("SLOTBOARD_RETENTION_ARCHIVE_AFTER_DAYS", 30, { min: 0 }),
    retentionDeleteArchivedAfterDays: numberEnv("SLOTBOARD_RETENTION_DELETE_ARCHIVED_AFTER_DAYS", 365, { min: 0 }),
    retentionPiiScrubAfterDays: numberEnv("SLOTBOARD_RETENTION_PII_SCRUB_AFTER_DAYS", 30, { min: 0 }),
    retentionRateLimitAfterDays: numberEnv("SLOTBOARD_RETENTION_RATE_LIMIT_AFTER_DAYS", 7, { min: 0 }),
    retentionIdempotencyAfterDays: numberEnv("SLOTBOARD_RETENTION_IDEMPOTENCY_AFTER_DAYS", 7, { min: 0 }),
    stripeSecretKey: optionalEnv("STRIPE_SECRET_KEY") ?? optionalEnv("SLOTBOARD_STRIPE_SECRET_KEY"),
    stripeWebhookSecret: optionalEnv("STRIPE_WEBHOOK_SECRET") ?? optionalEnv("SLOTBOARD_STRIPE_WEBHOOK_SECRET"),
    stripeEventPassPriceId: optionalEnv("SLOTBOARD_STRIPE_EVENT_PASS_PRICE_ID"),
    stripeCompanyStandbyPriceId: optionalEnv("SLOTBOARD_STRIPE_COMPANY_STANDBY_PRICE_ID"),
    stripeCompanyStandbyAnnualPriceId: optionalEnv("SLOTBOARD_STRIPE_COMPANY_STANDBY_ANNUAL_PRICE_ID"),
    billingCurrency: env("SLOTBOARD_BILLING_CURRENCY", "usd").toLowerCase(),
    eventPassAmount: numberEnv("SLOTBOARD_EVENT_PASS_AMOUNT", 1900, { min: 100 }),
    companyStandbyAmount: numberEnv("SLOTBOARD_COMPANY_STANDBY_AMOUNT", 4900, { min: 100 }),
    companyStandbyAnnualAmount: numberEnv("SLOTBOARD_COMPANY_STANDBY_ANNUAL_AMOUNT", 48000, { min: 100 }),
    customDomainCnameTarget: env("SLOTBOARD_CUSTOM_DOMAIN_CNAME_TARGET", hostnameFromURL(publicAppURL)),
    sentryDsn: optionalEnv("SENTRY_DSN") ?? optionalEnv("SLOTBOARD_SENTRY_DSN"),
    sentryEnvironment: env("SENTRY_ENVIRONMENT", process.env.NODE_ENV || "development"),
    sentryRelease: optionalEnv("SENTRY_RELEASE") ?? optionalEnv("RAILWAY_GIT_COMMIT_SHA"),
  };

  validateProductionConfig(config);
  return config;
}

export function emailReadiness(env: Env = loadEnv()): EmailReadiness {
  const webhookPath = "/api/slotboard/webhooks/email-provider";
  if (env.emailProvider === "console") {
    return {
      provider: env.emailProvider,
      senderEmail: env.senderEmail,
      deliveryConfigured: false,
      webhookConfigured: Boolean(env.emailWebhookSecret),
      productionReady: false,
      requiredVariables: [
        "SLOTBOARD_EMAIL_PROVIDER=resend",
        "SLOTBOARD_RESEND_API_KEY",
        "SLOTBOARD_SENDER_EMAIL",
      ],
      optionalVariables: [
        "SLOTBOARD_RESEND_WEBHOOK_SECRET",
        "SLOTBOARD_EMAIL_WEBHOOK_SECRET",
      ],
      webhookPath,
      issues: [
        "SLOTBOARD_EMAIL_PROVIDER is console, so emails are logged but not delivered.",
      ],
    };
  }

  if (env.emailProvider === "resend") {
    const deliveryConfigured = Boolean(env.resendApiKey);
    const webhookConfigured = Boolean(env.resendWebhookSecret);
    return {
      provider: env.emailProvider,
      senderEmail: env.senderEmail,
      deliveryConfigured,
      webhookConfigured,
      bounceTrackingConfigured: webhookConfigured,
      productionReady: deliveryConfigured,
      requiredVariables: [
        "SLOTBOARD_EMAIL_PROVIDER=resend",
        "SLOTBOARD_RESEND_API_KEY",
        "SLOTBOARD_SENDER_EMAIL",
      ],
      optionalVariables: [
        "SLOTBOARD_RESEND_WEBHOOK_SECRET",
        "SLOTBOARD_EMAIL_WEBHOOK_SECRET",
      ],
      webhookPath,
      issues: [
        ...(deliveryConfigured ? [] : ["SLOTBOARD_RESEND_API_KEY or RESEND_API_KEY is required for Resend delivery."]),
        ...(webhookConfigured ? [] : ["Set SLOTBOARD_RESEND_WEBHOOK_SECRET for signed Resend bounce/failure webhooks. Delivery can work without it, but bounce tracking will not be production-ready."]),
      ],
    };
  }

  const deliveryConfigured = Boolean(env.postmarkServerToken);
  const webhookConfigured = Boolean(env.emailWebhookSecret);
  return {
    provider: env.emailProvider,
    senderEmail: env.senderEmail,
    deliveryConfigured,
    webhookConfigured,
    bounceTrackingConfigured: webhookConfigured,
    productionReady: deliveryConfigured && webhookConfigured,
    requiredVariables: [
      "SLOTBOARD_EMAIL_PROVIDER=postmark",
      "SLOTBOARD_POSTMARK_SERVER_TOKEN",
      "SLOTBOARD_SENDER_EMAIL",
      "SLOTBOARD_EMAIL_WEBHOOK_SECRET",
    ],
    optionalVariables: [
      "SLOTBOARD_POSTMARK_MESSAGE_STREAM",
    ],
    webhookPath,
    issues: [
      ...(deliveryConfigured ? [] : ["SLOTBOARD_POSTMARK_SERVER_TOKEN or POSTMARK_SERVER_TOKEN is required for Postmark delivery."]),
      ...(webhookConfigured ? [] : ["SLOTBOARD_EMAIL_WEBHOOK_SECRET is required for Postmark webhooks."]),
    ],
  };
}

export function billingReadiness(env: Env = loadEnv()): BillingReadiness {
  const checkoutConfigured = Boolean(env.stripeSecretKey);
  const webhookConfigured = Boolean(env.stripeWebhookSecret);
  const webhookPath = "/api/slotboard/webhooks/stripe";
  return {
    provider: "stripe",
    checkoutConfigured,
    webhookConfigured,
    productionReady: checkoutConfigured && webhookConfigured,
    currency: env.billingCurrency,
    products: {
      eventPass: {
        amount: env.eventPassAmount,
        displayPrice: formatMoney(env.eventPassAmount, env.billingCurrency),
        priceId: env.stripeEventPassPriceId,
      },
      companyStandby: {
        amount: env.companyStandbyAmount,
        displayPrice: formatMoney(env.companyStandbyAmount, env.billingCurrency),
        interval: "month",
        priceId: env.stripeCompanyStandbyPriceId,
      },
      companyStandbyAnnual: {
        amount: env.companyStandbyAnnualAmount,
        displayPrice: formatMoney(env.companyStandbyAnnualAmount, env.billingCurrency),
        interval: "year",
        priceId: env.stripeCompanyStandbyAnnualPriceId,
      },
    },
    requiredVariables: [
      "STRIPE_SECRET_KEY or SLOTBOARD_STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET or SLOTBOARD_STRIPE_WEBHOOK_SECRET",
    ],
    optionalVariables: [
      "SLOTBOARD_BILLING_CURRENCY",
      "SLOTBOARD_EVENT_PASS_AMOUNT",
      "SLOTBOARD_COMPANY_STANDBY_AMOUNT",
      "SLOTBOARD_COMPANY_STANDBY_ANNUAL_AMOUNT",
      "SLOTBOARD_STRIPE_EVENT_PASS_PRICE_ID",
      "SLOTBOARD_STRIPE_COMPANY_STANDBY_PRICE_ID",
      "SLOTBOARD_STRIPE_COMPANY_STANDBY_ANNUAL_PRICE_ID",
    ],
    webhookPath,
    issues: [
      ...(checkoutConfigured ? [] : ["STRIPE_SECRET_KEY or SLOTBOARD_STRIPE_SECRET_KEY is required for Checkout."]),
      ...(webhookConfigured ? [] : ["STRIPE_WEBHOOK_SECRET or SLOTBOARD_STRIPE_WEBHOOK_SECRET is required to fulfill payments safely."]),
    ],
  };
}

export function customDomainReadiness(env: Env = loadEnv()): CustomDomainReadiness {
  const issues = [
    ...(env.customDomainCnameTarget
      ? []
      : ["SLOTBOARD_CUSTOM_DOMAIN_CNAME_TARGET is required for customer DNS instructions."]),
    ...(env.opsSecret
      ? []
      : ["SLOTBOARD_OPS_SECRET is required to activate verified custom domains."]),
  ];

  return {
    cnameTarget: env.customDomainCnameTarget,
    requestAndVerifyConfigured: Boolean(env.customDomainCnameTarget),
    activationMode: "ops_manual",
    selfServeActivation: false,
    publicAppURL: env.publicAppURL,
    issues,
  };
}

export function observabilityReadiness(env: Env = loadEnv()): ObservabilityReadiness {
  const errorTrackingConfigured = Boolean(env.sentryDsn);
  return {
    provider: "sentry",
    errorTrackingConfigured,
    productionReady: errorTrackingConfigured,
    requiredVariables: ["SENTRY_DSN"],
    optionalVariables: ["SENTRY_ENVIRONMENT", "SENTRY_RELEASE"],
    issues: errorTrackingConfigured ? [] : ["Set SENTRY_DSN on the API service to enable production error tracking."],
  };
}

function optionalEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function env(key: string, fallback: string): string {
  return optionalEnv(key) ?? fallback;
}

function listEnv(key: string, fallback: string[]): string[] {
  const value = optionalEnv(key);
  if (!value) {
    return fallback;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function booleanEnv(key: string, fallback: boolean): boolean {
  const raw = optionalEnv(key);
  if (!raw) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(raw.toLowerCase())) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(raw.toLowerCase())) {
    return false;
  }
  return fallback;
}

function numberEnv(key: string, fallback: number, options: { min?: number } = {}): number {
  const raw = optionalEnv(key);
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  const min = options.min ?? 1;
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function emailProviderEnv(key: string, fallback: Env["emailProvider"]): Env["emailProvider"] {
  const raw = optionalEnv(key);
  if (raw === "console" || raw === "resend" || raw === "postmark") {
    return raw;
  }
  return fallback;
}

function validateProductionConfig(env: Env): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  if (!env.databaseURL) {
    throw new Error("SLOTBOARD_DATABASE_URL or DATABASE_URL is required in production");
  }
  assertProductionHttpsURL("SLOTBOARD_AUTH_BASE_URL", env.authBaseURL);
  assertProductionHttpsURL("SLOTBOARD_PUBLIC_APP_URL", env.publicAppURL);
  for (const origin of env.webOrigins) {
    assertProductionHttpsURL("SLOTBOARD_WEB_ORIGINS", origin);
  }

  if (env.tokenPepper === "dev-token-pepper-replace-before-production" || env.tokenPepper.length < 32) {
    throw new Error("SLOTBOARD_TOKEN_PEPPER must be a production-grade secret at least 32 characters long");
  }
  if (env.authSecret === "dev-better-auth-secret-replace-before-production" || env.authSecret.length < 32) {
    throw new Error("SLOTBOARD_AUTH_SECRET or BETTER_AUTH_SECRET must be a production-grade secret at least 32 characters long");
  }

  const provider = env.emailProvider;
  if (provider === "resend" && !(optionalEnv("RESEND_API_KEY") ?? optionalEnv("SLOTBOARD_RESEND_API_KEY"))) {
    throw new Error("RESEND_API_KEY or SLOTBOARD_RESEND_API_KEY is required when SLOTBOARD_EMAIL_PROVIDER=resend");
  }
  if (provider === "postmark" && !(optionalEnv("POSTMARK_SERVER_TOKEN") ?? optionalEnv("SLOTBOARD_POSTMARK_SERVER_TOKEN"))) {
    throw new Error("POSTMARK_SERVER_TOKEN or SLOTBOARD_POSTMARK_SERVER_TOKEN is required when SLOTBOARD_EMAIL_PROVIDER=postmark");
  }
  if (provider === "postmark" && !optionalEnv("SLOTBOARD_EMAIL_WEBHOOK_SECRET")) {
    throw new Error("SLOTBOARD_EMAIL_WEBHOOK_SECRET is required when SLOTBOARD_EMAIL_PROVIDER=postmark");
  }
}

function assertProductionHttpsURL(name: string, value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL in production`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${name} must use https:// in production`);
  }
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 100 === 0 ? 0 : 2,
    }).format(amount / 100);
  } catch {
    return `${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`;
  }
}

function hostnameFromURL(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  }
}
