# Security Runbook

This runbook covers production hardening for `mytimes.co`. It intentionally avoids storing or printing secret values.

## Current Production Targets

| Surface | URL |
| --- | --- |
| Frontend apex | `https://mytimes.co` |
| Frontend Railway | `https://slots-production-12d4.up.railway.app` |
| API active target | Same-origin under `https://mytimes.co/api/...` |
| API Railway | `https://api-production-067c0.up.railway.app` |
| Optional API domain | `https://api.mytimes.co` |

## Required DNS

The current provider-side DNS records for active public traffic are:

```txt
mytimes.co      Railway/Cloudflare-routed apex for frontend and same-origin API
www.mytimes.co  Railway/Cloudflare-routed frontend alias
```

The optional separate API host, if we decide to use it, requires:

```txt
api.mytimes.co  CNAME  i099f43h.up.railway.app
```

After any DNS or domain-routing change, run:

```sh
npm run security:ready
```

To require the optional branded API DNS in the check:

```sh
SLOTBOARD_REQUIRE_API_CUSTOM_DOMAIN=true npm run security:ready
```

The readiness script validates DNS, live frontend routes, security headers, hidden email-preview files, billing readiness, email readiness, and API CORS.

## Security Headers

Production frontend responses must include:

```txt
Content-Security-Policy
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cache-Control: no-store
```

Hashed frontend assets should use immutable caching.

Production API responses must include:

```txt
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

All `/api/*` responses must include:

```txt
Cache-Control: no-store
```

## Secret Rotation

Rotate these production secrets after any incident, accidental disclosure, staff change, or major launch handoff:

| Secret | Impact |
| --- | --- |
| `SLOTBOARD_DATABASE_URL` / database password | Requires updating API and migration access. Does not invalidate user links by itself. |
| `SLOTBOARD_STRIPE_SECRET_KEY` | Requires creating/restricting a replacement in Stripe and updating Railway. |
| `SLOTBOARD_STRIPE_WEBHOOK_SECRET` | Requires updating the Stripe webhook endpoint signing secret and Railway together. |
| `SLOTBOARD_RESEND_API_KEY` | Requires replacing the Resend key and updating Railway. |
| `SLOTBOARD_RESEND_WEBHOOK_SECRET` / `SLOTBOARD_EMAIL_WEBHOOK_SECRET` | Requires updating webhook signing/shared secret configuration. |
| `SLOTBOARD_OPS_SECRET` | Invalidates existing operational scripts until callers use the new value. |
| `SLOTBOARD_AUTH_SECRET` / `BETTER_AUTH_SECRET` | Invalidates existing auth sessions. Schedule this deliberately. |
| `SLOTBOARD_TOKEN_PEPPER` | Invalidates stored public/admin/manage/my-boards link token hashes. Do not rotate without a migration or deliberate link reset plan. |

Recommended low-disruption order:

1. Rotate provider API keys and webhook secrets first.
2. Rotate `SLOTBOARD_OPS_SECRET`.
3. Rotate database password during a maintenance window.
4. Rotate `SLOTBOARD_AUTH_SECRET` only when session invalidation is acceptable.
5. Rotate `SLOTBOARD_TOKEN_PEPPER` only with an explicit link recovery/reset plan.

After each rotation:

```sh
npm run security:ready
npm run smoke:api
```

## Deployment Checks

Before deployment:

```sh
npm run typecheck
npm run build
npm run test:e2e
npm run test:hardening
npm audit --omit=dev --registry=https://registry.npmjs.org
```

After API deployment:

```sh
curl -sSI https://api-production-067c0.up.railway.app/readyz
curl -sSI https://api-production-067c0.up.railway.app/api/slotboard/billing/readiness
```

After frontend deployment:

```sh
curl -sSI https://mytimes.co
npm run security:ready
```

## Rollback Notes

Railway keeps previous successful deployments. If a deploy breaks production, redeploy the last successful deployment for the affected service from Railway, then rerun:

```sh
npm run security:ready
```

Do not roll back database migrations unless a migration-specific rollback has been written and tested.

## Public Account Hardening

Before actively promoting account signup:

- Enable and test email verification.
- Enable and test password reset.
- Keep auth rate limiting enabled on production.
- Confirm `SLOTBOARD_AUTH_BASE_URL`, `SLOTBOARD_PUBLIC_APP_URL`, and every `SLOTBOARD_WEB_ORIGINS` entry use `https://`.
- Run `npm run security:ready` after any auth-domain change.
