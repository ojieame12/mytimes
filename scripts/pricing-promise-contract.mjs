/**
 * Machine-readable contract for the public mytimes pricing promises.
 *
 * This file intentionally mirrors the public pricing surface instead of the
 * current implementation. The audit script uses it to show where the product
 * already supports a promise and where we still need backend/UI/test work.
 */

export const pricingPromiseContract = {
  version: "2026-05-16",
  sourceOfTruth: "apps/slots/src/views/PricingPage.tsx",
  tiers: [
    {
      key: "free",
      name: "Free",
      publicPrice: "$0 forever",
      audience: "For individuals running small interview rounds.",
      promises: [
        {
          id: "free.active_boards",
          label: "1 active board",
          phase: "Phase 1",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "1 active board" }],
          implementationEvidence: [
            { file: "apps/slots-api/src/entitlements.ts", includes: "FREE_ACTIVE_BOARD_LIMIT = 1" },
            { file: "apps/slots-api/src/events.ts", includes: "assertWithinFreeActiveBoardLimit" },
          ],
          testEvidence: [{ file: "scripts/test-billing-entitlements.mjs", includes: "FREE_ACTIVE_BOARD_LIMIT" }],
        },
        {
          id: "free.bookings_per_board",
          label: "15 bookings per board",
          phase: "Phase 1",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "15 bookings" }],
          implementationEvidence: [{ file: "apps/slots-api/src/entitlements.ts", includes: "FREE_BOOKING_LIMIT = 15" }],
          testEvidence: [{ file: "scripts/test-api-concurrency-privacy.mjs", includes: "booking_limit" }],
        },
        {
          id: "free.published_slots",
          label: "30 published slots",
          phase: "Phase 1",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "30 published slots" }],
          implementationEvidence: [{ file: "apps/slots-api/src/entitlements.ts", includes: "FREE_SLOT_LIMIT = 30" }],
          testEvidence: [{ file: "scripts/test-billing-entitlements.mjs", includes: "slot_limit === 30" }],
        },
        {
          id: "free.active_window",
          label: "3-day active window",
          phase: "Phase 1",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "3-day active window" }],
          implementationEvidence: [
            { file: "apps/slots-api/src/entitlements.ts", includes: "FREE_RETENTION_DAYS = 3" },
            { file: "apps/slots-api/src/retention.ts", includes: "slot_bounds.last_slot_end" },
          ],
          testEvidence: [{ file: "scripts/smoke-retention.mjs", includes: "expected retention to archive" }],
        },
        {
          id: "free.per_board_csv",
          label: "Per-board CSV export",
          phase: "Phase 1",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "Per-board CSV export" }],
          implementationEvidence: [
            { file: "apps/slots-api/src/slotboard.ts", includes: "exportAdminCsv" },
            { file: "apps/slots-api/src/slotboard.ts", includes: "exportOrganizerCsv" },
          ],
          testEvidence: [{ file: "scripts/smoke-api.mjs", includes: "expected free board CSV export" }],
        },
        {
          id: "free.email_confirmations",
          label: "Email confirmations",
          phase: "Phase 1",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "Email confirmations" }],
          implementationEvidence: [
            { file: "apps/slots-api/src/email.ts", includes: "booking_confirmation" },
            { file: "apps/slots-api/src/slotboard.ts", includes: "participantConfirmation" },
          ],
          testEvidence: [{ file: "scripts/test-email-shape.mjs", includes: "participant" }],
        },
        {
          id: "free.admin_link_recovery",
          label: "Admin link recovery",
          phase: "Phase 1",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "Admin link recovery" }],
          implementationEvidence: [
            { file: "apps/slots-api/src/slotboard.ts", includes: "recoverAdminLinks" },
            { file: "apps/slots/src/views/RecoverAdminPage.tsx", includes: "recoverAdminLinks" },
          ],
          testEvidence: [{ file: "scripts/smoke-auth.mjs", includes: "recover" }],
        },
      ],
    },
    {
      key: "board_unlock",
      name: "Board Unlock",
      publicPrice: "$19 once, surfaced in-app",
      audience: "For a specific free board that hits a board-level limit.",
      hidden: true,
      promises: [
        {
          id: "unlock.board_level_checkout",
          label: "One-time unlock applies to the current board only",
          phase: "Phase 1",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "one-time in-app unlock" }],
          implementationEvidence: [
            { file: "apps/slots-api/src/billing.ts", includes: "createEventPassCheckout" },
            { file: "apps/slots-api/src/entitlements.ts", includes: "EVENT_PASS_BOOKING_LIMIT = 75" },
            { file: "apps/slots-api/src/entitlements.ts", includes: "EVENT_PASS_SLOT_LIMIT = 200" },
            { file: "apps/slots-api/src/entitlements.ts", includes: "EVENT_PASS_RETENTION_DAYS = 180" },
          ],
          testEvidence: [{ file: "scripts/test-billing-entitlements.mjs", includes: "event_pass" }],
        },
      ],
    },
    {
      key: "company",
      name: "Company",
      publicPrice: "$480/year or $49/month",
      audience: "For teams running repeated interview rounds.",
      promises: [
        {
          id: "company.pricing_checkout",
          label: "$480/year or $49/month subscription",
          phase: "Phase 1",
          publicEvidence: [
            { file: "apps/slots/src/views/PricingPage.tsx", includes: "$480" },
            { file: "apps/slots/src/views/PricingPage.tsx", includes: "$49 monthly available" },
          ],
          implementationEvidence: [
            { file: "apps/slots-api/src/billing.ts", includes: "createCompanyStandbyCheckout" },
            { file: "apps/slots-api/src/env.ts", includes: "stripeCompanyStandbyAnnualPriceId" },
          ],
          testEvidence: [{ file: "scripts/test-billing-entitlements.mjs", includes: "company_standby" }],
        },
        {
          id: "company.unlimited_boards",
          label: "Unlimited boards, fair use",
          phase: "Phase 1",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "Unlimited boards" }],
          implementationEvidence: [
            { file: "apps/slots-api/src/entitlements.ts", includes: "COMPANY_STANDBY_BOOKING_LIMIT" },
            { file: "apps/slots-api/src/events.ts", includes: "readCreationEntitlement" },
          ],
          testEvidence: [{ file: "scripts/test-billing-entitlements.mjs", includes: "expected active subscription creation entitlement" }],
        },
        {
          id: "company.active_window",
          label: "12-month active window",
          phase: "Phase 1",
          publicEvidence: [
            { file: "apps/slots/src/views/PricingPage.tsx", includes: "12 months" },
            { file: "apps/slots/src/views/PricingPage.tsx", includes: "12-month active window" },
          ],
          implementationEvidence: [
            { file: "apps/slots-api/src/billing.ts", includes: "current_period_end" },
            { file: "apps/slots-api/src/entitlements.ts", includes: "expiresAt: null" },
          ],
          testEvidence: [{ file: "scripts/test-billing-entitlements.mjs", includes: "current_period_end" }],
        },
        {
          id: "company.organizer_seats",
          label: "10 organizer seats",
          phase: "Phase 2",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "10 organizer seats" }],
          implementationEvidence: [
            { file: "apps/slots-api/migrations/0001_slotboard.sql", includes: "organizations" },
            { file: "apps/slots-api/migrations/0001_slotboard.sql", includes: "organization_members" },
            { file: "apps/slots-api/src/organizations.ts", includes: "COMPANY_INCLUDED_ORGANIZER_SEATS = 10" },
            { file: "apps/slots-api/src/organizations.ts", includes: "assertOrganizationCanInviteOrganizer" },
          ],
          testEvidence: [{ file: "scripts/test-company-workspace.mjs", includes: "10 organizer seats" }],
        },
        {
          id: "company.company_wide_recovery",
          label: "Company-wide admin link recovery",
          phase: "Phase 3",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "Company-wide" }],
          implementationEvidence: [
            { file: "apps/slots-api/migrations/0001_slotboard.sql", includes: "organization_members" },
            { file: "apps/slots-api/src/myBoards.ts", includes: "organization" },
          ],
          testEvidence: [{ file: "scripts/test-company-workspace.mjs", includes: "company-wide recovery" }],
        },
        {
          id: "company.team_templates",
          label: "Team templates",
          phase: "Phase 3",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "Team templates" }],
          implementationEvidence: [
            { file: "apps/slots-api/migrations/0001_slotboard.sql", includes: "event_templates" },
            { file: "apps/slots/src/views/AccountEventsPage.tsx", includes: "Template" },
          ],
          testEvidence: [{ file: "scripts/test-company-workspace.mjs", includes: "template" }],
        },
        {
          id: "company.cross_board_csv",
          label: "Cross-board CSV export",
          phase: "Phase 3",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "Cross-board CSV export" }],
          implementationEvidence: [
            { file: "apps/slots-api/src/app.ts", includes: "/api/slotboard/account/exports/bookings.csv" },
            { file: "apps/slots-api/src/slotboard.ts", includes: "exportOrganizerCrossBoardCsv" },
            { file: "apps/slots/src/views/AccountEventsPage.tsx", includes: "Cross-board CSV" },
          ],
          testEvidence: [
            { file: "scripts/smoke-auth.mjs", includes: "cross-board CSV export to require Company" },
          ],
        },
        {
          id: "company.custom_subdomain",
          label: "Custom company subdomain",
          phase: "Phase 4",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "Custom company subdomain" }],
          implementationEvidence: [
            { file: "apps/slots-api/migrations/0001_slotboard.sql", includes: "custom_domains" },
            { file: "apps/slots-api/src/customDomains.ts", includes: "requestCustomDomain" },
            { file: "apps/slots-api/src/customDomains.ts", includes: "verifyCustomDomain" },
            { file: "apps/slots/src/views/AccountEventsPage.tsx", includes: "CustomDomainCard" },
          ],
          testEvidence: [{ file: "scripts/test-billing-entitlements.mjs", includes: "customDomainHostname" }],
        },
        {
          id: "company.footer_removed",
          label: '"Made with mytimes" footer removed',
          phase: "Phase 3",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "Removed" }],
          implementationEvidence: [
            { file: "apps/slots/src/components/BookingHeaderCard.tsx", includes: "showMytimesFooter" },
            { file: "apps/slots/src/components/AppShell.tsx", includes: "hideFooter" },
          ],
          testEvidence: [{ file: "scripts/test-booking-ui-regression.tsx", includes: "Made with mytimes" }],
        },
      ],
    },
    {
      key: "enterprise",
      name: "Enterprise",
      publicPrice: "Custom",
      audience: "For hiring teams operating at scale.",
      salesLed: true,
      promises: [
        {
          id: "enterprise.contact_flow",
          label: "Enterprise contact and procurement path",
          phase: "Phase 5",
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "Talk to sales" }],
          implementationEvidence: [
            { file: "apps/slots-api/src/contact.ts", includes: "createContactLead" },
            { file: "apps/slots/src/views/ContactPage.tsx", includes: "integrationInterest" },
          ],
          testEvidence: [{ file: "scripts/test-api-hardening.mjs", includes: "Slack, Teams, and SSO" }],
        },
        {
          id: "enterprise.slack_teams",
          label: "Slack & Teams setup",
          phase: "Phase 5",
          salesLed: true,
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "Slack & Teams setup" }],
          implementationEvidence: [
            { file: "apps/slots/src/views/EnterprisePage.tsx", includes: "Slack &amp; Teams setup" },
            { file: "apps/slots/src/views/ContactPage.tsx", includes: "slack" },
            { file: "apps/slots/src/views/ContactPage.tsx", includes: "teams" },
          ],
          testEvidence: [{ file: "scripts/test-frontend-readiness.mjs", includes: "Slack & Teams setup" }],
        },
        {
          id: "enterprise.sso_security",
          label: "SSO and security review",
          phase: "Phase 5",
          salesLed: true,
          publicEvidence: [{ file: "apps/slots/src/views/PricingPage.tsx", includes: "SSO and security review" }],
          implementationEvidence: [
            { file: "apps/slots/src/views/EnterprisePage.tsx", includes: "SSO" },
            { file: "apps/slots/src/views/ContactPage.tsx", includes: "security" },
          ],
          testEvidence: [{ file: "scripts/test-frontend-readiness.mjs", includes: "SSO" }],
        },
      ],
    },
  ],
};

export function allPricingPromises() {
  return pricingPromiseContract.tiers.flatMap((tier) =>
    tier.promises.map((promise) => ({
      ...promise,
      tier: tier.key,
      tierName: tier.name,
      hidden: Boolean(tier.hidden),
      salesLed: Boolean(tier.salesLed || promise.salesLed),
    })),
  );
}
