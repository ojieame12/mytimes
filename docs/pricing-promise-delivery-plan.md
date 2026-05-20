# mytimes Pricing Promise Delivery Plan

This plan treats the public pricing surface as a product contract. We do not reduce the promise to fit the current code. We build the missing systems until every promise has backend enforcement, frontend access, billing entitlement, and end-to-end tests.

## Phase 0: Promise Freeze and Audit Harness

Goal: make the promises explicit and measurable.

Deliverables:

- Machine-readable pricing promise contract.
- Audit script that checks public copy, backend evidence, frontend evidence, and test evidence.
- Non-gating npm audit command for the current known gaps.
- Strict npm test command that becomes CI-gating once Phase 1 starts closing gaps.

Tests:

- Public pricing copy contains the promised tier language.
- Backend constants match numeric Free and Board Unlock limits.
- Each promised feature has at least one implementation evidence marker.
- Known gaps are listed as missing or partial instead of hidden in prose.

Exit criteria:

- `npm run audit:pricing-promises` produces a complete promise report.
- Every missing feature has an owner phase below.

## Phase 1: Core Entitlement Contract

Goal: make plan limits impossible to drift from public pricing.

Deliverables:

- Shared entitlement matrix for Free, Board Unlock, Company, and Enterprise/sales-led.
- Backend checks that enforce active board count, booking limits, slot limits, booking window, retention, footer behavior, and custom-domain eligibility.
- Frontend limit banners and paywalls that read from the same contract.
- Billing readiness checks that validate Stripe product IDs and amounts.

Tests:

- Free can create exactly the promised number of active boards.
- Free cannot publish more than the promised bookings, slots, or booking window.
- Board Unlock raises only the current board to its promised limits.
- Company subscription raises account-level creation entitlement.
- Company cancellation/lapse restores the correct limits.
- Pricing copy, env defaults, Stripe product metadata, and entitlement constants agree.

Exit criteria:

- `npm run test:pricing-promises -- --phase=entitlements` passes.

## Phase 2: Company Workspace Foundation

Goal: turn Company from a paid individual account into a real workspace.

Deliverables:

- `organizations` table.
- `organization_members` table.
- Workspace ownership for boards.
- Better Auth session to workspace membership mapping.
- Roles: owner, admin, organizer.
- Seat limit enforcement for the promised 10 organizer seats.
- Workspace-scoped board list.
- Workspace-scoped billing customer and subscription records.

Tests:

- Company owner creates a workspace after checkout.
- Owner invites a second organizer.
- Invitee signs in and appears as a workspace member.
- Invitee can create a board under the Company workspace.
- Non-member cannot read or mutate Company boards.
- The 11th organizer invite is rejected with a clear seat-limit error.
- Cancelling Company freezes or downgrades workspace-only privileges according to the billing policy.

Exit criteria:

- Company "10 organizer seats" is backed by schema, API, UI, and tests.

## Phase 3: Company Operations

Goal: ship the operational features Company claims.

Deliverables:

- Shared dashboard across all workspace boards.
- Company-wide admin recovery that includes all workspace boards.
- Cross-board CSV export visible in the account UI.
- Team templates: create template from board, duplicate template into new board, manage template list.
- Persistent company branding: logo/name/color defaults applied to new boards.
- "Made with mytimes" removal on booking pages, including global shell/footer audit.

Tests:

- Workspace owner sees boards created by every member.
- Member sees only boards allowed by role.
- Company-wide recovery email includes workspace boards without leaking data on-screen.
- Cross-board CSV includes bookings from multiple members and multiple boards.
- Free and Board Unlock users receive 402 for cross-board CSV.
- Template duplication creates slots and event metadata without copying participant bookings.
- Company branding appears on booking pages and emails.
- Company booking pages do not show the "Made with mytimes" mark or a branded footer.

Exit criteria:

- Company workspace promises are complete enough for a paying team to use without support intervention.

## Phase 4: Custom Domain End to End

Goal: make "custom company subdomain" production-grade.

Current state: backend, account UI, DNS verification, active-domain routing, custom-domain CORS, and tests already exist. This phase finishes the production and UX edges.

Deliverables:

- Subdomain-only copy and validation: `book.company.com`, not apex domains.
- Railway/Cloudflare setup runbook.
- DNS pending, verified, active, and failed states in UI.
- Public booking links use the active custom domain.
- Manage links generated after activation use the active custom domain.
- Admin, auth, and billing remain on `mytimes.co`.
- Domain deactivation on Company lapse.

Tests:

- Free user cannot request a custom domain.
- Company user requests a valid subdomain and gets the expected CNAME target.
- Invalid apex, wildcard, localhost, and ported domains are rejected.
- Verified custom domain rewrites public and manage links.
- Custom-domain origin is allowed by CORS while Company is active.
- Company lapse disables custom-domain CORS and link generation.
- Live smoke verifies `mytimes.co` and any configured custom subdomain resolve correctly.

Exit criteria:

- Custom domain can be sold confidently as a Company feature.

## Phase 5: Enterprise Sales-Led Features

Goal: make Enterprise a sales-led pathway, not a fake self-serve promise.

Deliverables:

- Enterprise contact intake with clear feature interest flags.
- Internal lead notification email.
- Lead persistence and admin triage.
- Sales-led feature status labels for Slack, Teams, SSO, security review, custom limits, and procurement contracts.
- No self-serve checkmarks for Enterprise-only integrations until built.

Tests:

- Enterprise form submits and sends an internal lead email.
- Slack/Teams/SSO/security/procurement interests are captured.
- Enterprise page routes to contact with the correct intent.
- Public pages do not imply self-serve Enterprise activation.

Exit criteria:

- Enterprise claims are routed to sales and cannot be accidentally interpreted as already self-serve.

## Phase 6: Full End-to-End Release Gate

Goal: block launch if any public promise regresses.

Deliverables:

- `test:pricing-promises` added to CI.
- Browser tests for Free, Board Unlock, Company, and Enterprise lead journeys.
- Stripe webhook tests for Company monthly and annual subscriptions.
- Email shape tests for organizer links, participant confirmation, admin recovery, workspace invite, and Company lead notifications.
- Production smoke tests for live links, auth, billing readiness, email readiness, custom domain readiness, and security headers.

Tests:

- Free journey: create board, book slot, CSV export, footer visible, free limits enforced.
- Board Unlock journey: hit limit, pay, webhook fulfills, board limits increase, footer removed for that board.
- Company journey: subscribe, create workspace, invite organizer, create shared board, export cross-board CSV, configure custom subdomain, cancel subscription.
- Enterprise journey: submit sales request, verify lead persistence and notification.
- Link delivery journey: organizer public/admin links, participant manage links, recovery links, and workspace invite links all work.

Exit criteria:

- A single command can validate the pricing contract and all paid journeys before every deploy.

