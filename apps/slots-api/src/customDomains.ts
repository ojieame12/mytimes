import { randomBytes } from "node:crypto";
import { resolveCname, resolveTxt } from "node:dns/promises";
import { getPool, withTransaction } from "./db.js";
import { hasActiveCompanyStandby } from "./entitlements.js";
import { loadEnv } from "./env.js";
import { ApiError } from "./errors.js";
import { attachRailwayCustomDomain, hasRailwayCustomDomainAutomation } from "./railwayDomains.js";

export type CustomDomainStatus = "pending_dns" | "verified_dns" | "active" | "rejected";

export type CustomDomainDTO = {
  id: string;
  hostname: string;
  status: CustomDomainStatus;
  verification: {
    type: "TXT";
    name: string;
    value: string;
  };
  routing: {
    type: "CNAME";
    name: string;
    value: string;
  };
  requestedAt: string;
  verifiedAt?: string | undefined;
  activatedAt?: string | undefined;
  lastCheckedAt?: string | undefined;
  lastCheckError?: string | undefined;
};

export type CustomDomainSettingsResponse = {
  eligible: boolean;
  reason?: "company_standby_required" | undefined;
  cnameTarget: string;
  activation: {
    mode: "railway_api" | "ops_manual";
    automatic: boolean;
  };
  domain?: CustomDomainDTO | undefined;
};

const ACTIVE_CUSTOM_DOMAIN_CACHE_MS = 60_000;

let activeCustomDomainCache:
  | {
      expiresAt: number;
      hostnames: Set<string>;
    }
  | undefined;

export async function readCustomDomainSettings(input: {
  ownerUserId: string;
  ownerEmail: string;
}): Promise<CustomDomainSettingsResponse> {
  const env = loadEnv();
  const automaticActivation = hasRailwayCustomDomainAutomation(env);
  const [eligible, domain] = await Promise.all([
    hasActiveCompanyStandby(input),
    readCustomDomain(input),
  ]);
  return {
    eligible,
    reason: eligible ? undefined : "company_standby_required",
    cnameTarget: env.customDomainCnameTarget,
    activation: {
      mode: automaticActivation ? "railway_api" : "ops_manual",
      automatic: automaticActivation,
    },
    domain: domain ? toDTO(domain) : undefined,
  };
}

export async function requestCustomDomain(input: {
  ownerUserId: string;
  ownerEmail: string;
  hostname: string;
}): Promise<CustomDomainSettingsResponse> {
  await assertCustomDomainEligible(input);

  const env = loadEnv();
  const token = randomBytes(18).toString("hex");
  const txtRecordName = `_mytimes.${input.hostname}`;
  const txtRecordValue = `mytimes-domain-verification=${token}`;

  await withTransaction(async (client) => {
    const hostnameOwner = await client.query<{ owner_user_id: string | null; owner_email: string }>(
      `
        select owner_user_id, owner_email
        from slotboard.custom_domains
        where lower(hostname) = lower($1)
        limit 1
      `,
      [input.hostname],
    );
    const existingOwner = hostnameOwner.rows[0];
    if (
      existingOwner &&
      existingOwner.owner_user_id !== input.ownerUserId &&
      existingOwner.owner_email.toLowerCase() !== input.ownerEmail.toLowerCase()
    ) {
      throw new ApiError(409, "custom_domain_taken", "This custom domain is already connected to another mytimes account.");
    }

    const current = await client.query<{ id: string }>(
      `
        select id
        from slotboard.custom_domains
        where owner_user_id = $1
        limit 1
      `,
      [input.ownerUserId],
    );

    if (current.rows[0]) {
      await client.query(
        `
          update slotboard.custom_domains
          set owner_email = $2,
              hostname = $3,
              status = 'pending_dns',
              verification_token = $4,
              txt_record_name = $5,
              txt_record_value = $6,
              cname_target = $7,
              requested_at = now(),
              verified_at = null,
              activated_at = null,
              last_checked_at = null,
              last_check_error = null
          where id = $1
        `,
        [
          current.rows[0].id,
          input.ownerEmail,
          input.hostname,
          token,
          txtRecordName,
          txtRecordValue,
          env.customDomainCnameTarget,
        ],
      );
      return;
    }

    await client.query(
      `
        insert into slotboard.custom_domains (
          owner_email,
          owner_user_id,
          hostname,
          status,
          verification_token,
          txt_record_name,
          txt_record_value,
          cname_target
        )
        values ($1, $2, $3, 'pending_dns', $4, $5, $6, $7)
      `,
      [
        input.ownerEmail,
        input.ownerUserId,
        input.hostname,
        token,
        txtRecordName,
        txtRecordValue,
        env.customDomainCnameTarget,
      ],
    );
  });

  clearActiveCustomDomainCache();
  return readCustomDomainSettings(input);
}

export async function verifyCustomDomain(input: {
  ownerUserId: string;
  ownerEmail: string;
}): Promise<CustomDomainSettingsResponse> {
  await assertCustomDomainEligible(input);
  const domain = await readCustomDomain(input);
  if (!domain) {
    throw new ApiError(404, "custom_domain_not_found", "Request a custom domain before checking DNS.");
  }

  const check = await checkDomainDns(domain);
  const status: CustomDomainStatus = check.verified ? "verified_dns" : "pending_dns";
  await getPool().query(
    `
      update slotboard.custom_domains
      set status = case when status = 'active' then status else $2 end,
          verified_at = case
            when $3::boolean and verified_at is null then now()
            when $3::boolean then verified_at
            else null
          end,
          last_checked_at = now(),
          last_check_error = $4
      where id = $1
    `,
    [domain.id, status, check.verified, check.error],
  );

  if (check.verified && domain.status !== "active" && hasRailwayCustomDomainAutomation()) {
    try {
      await attachRailwayCustomDomain({ hostname: domain.hostname });
      await activateCustomDomain({ hostname: domain.hostname });
    } catch (error) {
      await getPool().query(
        `
          update slotboard.custom_domains
          set last_check_error = $2,
              last_checked_at = now()
          where id = $1
        `,
        [domain.id, customDomainActivationErrorMessage(error)],
      );
    }
  }

  return readCustomDomainSettings(input);
}

export async function activateCustomDomain(input: {
  hostname: string;
}): Promise<CustomDomainDTO> {
  const row = await withTransaction(async (client) => {
    const current = await client.query<CustomDomainRow>(
      `
        select
          id,
          owner_email,
          owner_user_id,
          hostname,
          status,
          txt_record_name,
          txt_record_value,
          cname_target,
          requested_at,
          verified_at,
          activated_at,
          last_checked_at,
          last_check_error
        from slotboard.custom_domains
        where lower(hostname) = lower($1)
        limit 1
      `,
      [input.hostname],
    );
    const existing = current.rows[0];
    if (!existing) {
      throw new ApiError(404, "custom_domain_not_found", "No custom domain request exists for this hostname.");
    }
    if (!(await hasActiveCompanyStandby({
      ownerUserId: existing.owner_user_id,
      ownerEmail: existing.owner_email,
    }))) {
      throw new ApiError(
        402,
        "company_standby_required",
        "Custom domains are included with Company.",
      );
    }
    if (existing.status !== "verified_dns" && existing.status !== "active") {
      throw new ApiError(
        409,
        "custom_domain_not_verified",
        "Verify this custom domain's DNS records before activating it.",
      );
    }

    const updated = await client.query<CustomDomainRow>(
      `
        update slotboard.custom_domains
        set status = 'active',
            activated_at = coalesce(activated_at, now()),
            last_check_error = null
        where id = $1
        returning
          id,
          owner_email,
          owner_user_id,
          hostname,
          status,
          txt_record_name,
          txt_record_value,
          cname_target,
          requested_at,
          verified_at,
          activated_at,
          last_checked_at,
          last_check_error
      `,
      [existing.id],
    );
    return updated.rows[0] ?? existing;
  });

  clearActiveCustomDomainCache();
  return toDTO(row);
}

export async function isActiveCustomDomainOrigin(origin: string): Promise<boolean> {
  const hostname = hostnameFromOrigin(origin);
  if (!hostname) {
    return false;
  }
  const hostnames = await readActiveCustomDomainHostnames();
  return hostnames.has(hostname);
}

export async function readActiveCustomDomainBaseURL(input: {
  ownerUserId?: string | null | undefined;
  ownerEmail: string;
}): Promise<string | undefined> {
  const result = await getPool().query<{ hostname: string }>(
    `
      select hostname
      from slotboard.custom_domains d
      where d.status = 'active'
        and exists (
          select 1
          from slotboard.subscriptions s
          where s.plan_key = 'company_standby'
            and s.status in ('active', 'trialing')
            and (
              s.current_period_end is null
              or s.current_period_end > now()
            )
            and (
              (d.owner_user_id is not null and s.owner_user_id = d.owner_user_id)
              or lower(s.owner_email) = lower(d.owner_email)
            )
        )
        and (
          ($1::text is not null and d.owner_user_id = $1)
          or lower(d.owner_email) = lower($2)
        )
      order by
        case when $1::text is not null and d.owner_user_id = $1 then 0 else 1 end,
        d.activated_at desc nulls last,
        d.updated_at desc
      limit 1
    `,
    [input.ownerUserId ?? null, input.ownerEmail],
  );
  const hostname = result.rows[0]?.hostname;
  return hostname ? `https://${hostname}` : undefined;
}

async function assertCustomDomainEligible(input: {
  ownerUserId: string;
  ownerEmail: string;
}): Promise<void> {
  if (!(await hasActiveCompanyStandby(input))) {
    throw new ApiError(
      402,
      "company_standby_required",
      "Custom domains are included with Company.",
    );
  }
}

async function readActiveCustomDomainHostnames(): Promise<Set<string>> {
  if (activeCustomDomainCache && activeCustomDomainCache.expiresAt > Date.now()) {
    return activeCustomDomainCache.hostnames;
  }

  const result = await getPool().query<{ hostname: string }>(
    `
      select lower(hostname) as hostname
      from slotboard.custom_domains d
      where d.status = 'active'
        and exists (
          select 1
          from slotboard.subscriptions s
          where s.plan_key = 'company_standby'
            and s.status in ('active', 'trialing')
            and (
              s.current_period_end is null
              or s.current_period_end > now()
            )
            and (
              (d.owner_user_id is not null and s.owner_user_id = d.owner_user_id)
              or lower(s.owner_email) = lower(d.owner_email)
            )
        )
    `,
  );
  const hostnames = new Set(result.rows.map((row) => row.hostname));
  activeCustomDomainCache = {
    expiresAt: Date.now() + ACTIVE_CUSTOM_DOMAIN_CACHE_MS,
    hostnames,
  };
  return hostnames;
}

export function clearActiveCustomDomainCache(): void {
  activeCustomDomainCache = undefined;
}

function hostnameFromOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") {
      return null;
    }
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function customDomainActivationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `DNS verified, but Railway activation did not complete: ${message}`.slice(0, 1000);
}

async function readCustomDomain(input: {
  ownerUserId: string;
  ownerEmail: string;
}): Promise<CustomDomainRow | null> {
  const result = await getPool().query<CustomDomainRow>(
    `
      select
        id,
        owner_email,
        owner_user_id,
        hostname,
        status,
        txt_record_name,
        txt_record_value,
        cname_target,
        requested_at,
        verified_at,
        activated_at,
        last_checked_at,
        last_check_error
      from slotboard.custom_domains
      where owner_user_id = $1
        or lower(owner_email) = lower($2)
      order by
        case when owner_user_id = $1 then 0 else 1 end,
        updated_at desc
      limit 1
    `,
    [input.ownerUserId, input.ownerEmail],
  );
  return result.rows[0] ?? null;
}

async function checkDomainDns(domain: CustomDomainRow): Promise<{
  verified: boolean;
  error?: string | undefined;
}> {
  const [txt, cname] = await Promise.all([
    hasTxtRecord(domain.txt_record_name, domain.txt_record_value),
    hasCnameRecord(domain.hostname, domain.cname_target),
  ]);

  if (txt && cname) {
    return { verified: true };
  }

  const missing = [
    txt ? undefined : `TXT ${domain.txt_record_name}`,
    cname ? undefined : `CNAME ${domain.hostname} -> ${domain.cname_target}`,
  ].filter(Boolean);
  return {
    verified: false,
    error: `Waiting for DNS: ${missing.join(", ")}`,
  };
}

async function hasTxtRecord(name: string, expectedValue: string): Promise<boolean> {
  try {
    const records = await resolveTxt(name);
    return records.some((parts) => parts.join("") === expectedValue);
  } catch {
    return false;
  }
}

async function hasCnameRecord(name: string, expectedTarget: string): Promise<boolean> {
  try {
    const records = await resolveCname(name);
    const normalizedTarget = normalizeDnsValue(expectedTarget);
    return records.some((record) => normalizeDnsValue(record) === normalizedTarget);
  } catch {
    return false;
  }
}

function normalizeDnsValue(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function toDTO(row: CustomDomainRow): CustomDomainDTO {
  return {
    id: row.id,
    hostname: row.hostname,
    status: row.status,
    verification: {
      type: "TXT",
      name: row.txt_record_name,
      value: row.txt_record_value,
    },
    routing: {
      type: "CNAME",
      name: row.hostname,
      value: row.cname_target,
    },
    requestedAt: row.requested_at.toISOString(),
    verifiedAt: row.verified_at?.toISOString(),
    activatedAt: row.activated_at?.toISOString(),
    lastCheckedAt: row.last_checked_at?.toISOString(),
    lastCheckError: row.last_check_error ?? undefined,
  };
}

type CustomDomainRow = {
  id: string;
  owner_email: string;
  owner_user_id: string | null;
  hostname: string;
  status: CustomDomainStatus;
  txt_record_name: string;
  txt_record_value: string;
  cname_target: string;
  requested_at: Date;
  verified_at: Date | null;
  activated_at: Date | null;
  last_checked_at: Date | null;
  last_check_error: string | null;
};
