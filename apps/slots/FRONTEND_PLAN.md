# mytimes Front-End Plan

Working product name: mytimes.

mytimes turns a fixed list of interview times into a public booking link and a private organizer admin link. There are no accounts, recurring rules, calendar connections, or multi-organizer flows in v1. The UI should feel like a tangible appointment board inside the same mytimes letterpress system.

## Product Principle

The app optimizes for two short-lived jobs:

- An organizer creates a one-off event with 10-25 claimable slots in under 4 minutes.
- A participant claims one slot from a shared link in under 30 seconds.

Anything that slows those jobs down is deferred, even if it is common in larger scheduling products.

## Suggested App Boundary

Keep mytimes as `apps/slots`, a sibling of `apps/web`.

Use copied foundational styles for now. Do not import from `apps/web/src/styles.css` directly; that would make this app depend on mytimes internals. If both apps continue to share tokens after the MVP proves useful, extract the foundation into a small shared package later, for example `packages/design-system-css`.

## Route Inventory

### Public Routes

| Route | View | Purpose |
| --- | --- | --- |
| `/` | Create entry | A focused event-start screen, not a marketing landing page. |
| `/new` | Event basics | Title, description, organizer name, organizer email, timezone. Held in client state. |
| `/new/availability` | Availability builder | Date range, weekdays, time window, duration, blocked ranges, live slot preview. This is the key organizer screen. |
| `/new/done` | Event created | Public link, admin link, copy buttons, participant preview, dashboard CTA. |
| `/b/:publicToken` | Booking page | Participant event header and available slot grid. |
| `/b/:publicToken` modal | Booking modal | Slot confirmation, name, email, optional notes, privacy disclosure. |
| `/m/:manageToken` | Manage booking | Participant can keep or cancel a booking. No rebooking flow in v1. |
| `/recover` | Admin link recovery | Email-only recovery. The server rotates the admin token and emails a fresh link. |

### Admin Routes

| Route | View | Purpose |
| --- | --- | --- |
| `/a/:adminToken` | Admin dashboard | Event summary, slot states, booking details, slot actions, CSV export. |
| `/a/:adminToken` drawer | Slot detail | Participant details, notes, timestamp, cancellation actions. |
| `/a/:adminToken/edit` | Edit event details | Title, description, organizer name; timezone only while there are zero bookings. |
| `/a/:adminToken/archive` | Archive/delete confirmation | Archive event, or start 7-day delete grace period. |

## View Sketches

### Participant Booking Page

Use one centered `material-panel` as the event paper. The top shows event title, organizer, description, source timezone, and a note that times are rendered locally. Below it, render date groups as `material-panel-mini` rows.

The slot grid should make open slots feel claimable but not playful. Each slot is a compact wax-stamped button:

- Top line: participant-local time.
- Small line: source timezone time.
- Hover: warm paper lift.
- Active: stamp press.

Booked slots do not render on the public page. Sold-out dates collapse to a single "All slots booked" row.

### Booking Modal

Open in-place over the booking page with a full-viewport veil. Do not navigate away from the selected slot. The modal includes:

- Selected slot in source and local timezone.
- Name field.
- Email field.
- Optional notes field.
- Privacy disclosure: "Your name and email will be shared with the organizer to confirm this interview."
- Secondary cancel button.
- Primary confirm booking button.

The "slot just got taken" state stays in the modal, preserves typed form values, refreshes the slot grid behind it, and asks the participant to pick another slot.

### Confirmation Receipt

Replace the modal form with a receipt state:

- Wax-seal check mark.
- Confirmed slot details.
- Participant email confirmation copy.
- Note that the email includes a calendar file.
- Link to manage/cancel if the server returns it.

### Availability Builder

This is the most important organizer screen.

Use a two-column layout on desktop:

- Left rail: `material-panel-mini` control groups.
- Right rail: live generated slot preview grouped by date.

On mobile, controls stack above the preview. The slot counter should always be visible near the create action: "32 slots across 8 days".

Controls:

- Date range.
- Days of week.
- Daily time window.
- Meeting duration.
- Blocked ranges per day, with one removable lunch block prefilled.

The "Create event" button is the first database write in the flow. Disable it until at least one slot exists.

### Event Created

Show two distinct copy panels:

- Public participant link.
- Private admin link.

The admin link needs stronger visual hierarchy and a "keep this private" label. Also include "We emailed this to you" once email wiring exists.

### Admin Dashboard

The admin dashboard should reuse the participant slot grid, but all states are visible:

- Open.
- Booked.
- Closed.
- Cancelled.
- Booked and close-after-booking.

Summary chips at the top:

- Total slots.
- Booked.
- Open.
- Closed.
- Cancelled.
- Email bounce warnings when phase 3 adds bounce logs.

Booked slots open a side drawer with participant name, email, notes, and booking timestamp. Slot actions depend on state:

- Open, no booking: close slot.
- Open, booked: cancel and reopen, cancel and keep closed, or close after this booking.
- Closed, no booking: reopen slot.
- Closed, booked: cancel booking only.

## Component Inventory

### Foundation

- `AppShell`
- `Button`
- `IconButton`
- `Field`
- `Textarea`
- `Select`
- `CheckboxPill`
- `ModalShell`
- `DrawerShell`
- `CopyButton`
- `StatusChip`

### mytimes Domain Components

- `EventHeader`
- `SlotChip`
- `SlotGrid`
- `DaySlotGroup`
- `BookingForm`
- `BookingModal`
- `ConfirmationReceipt`
- `AvailabilityBuilder`
- `AvailabilityControls`
- `GeneratedSlotPreview`
- `BlockedRangeEditor`
- `CopyLinkCard`
- `AdminSummary`
- `AdminSlotGrid`
- `SlotDetailDrawer`
- `ManageBookingCard`
- `RecoverAdminLinkForm`
- `ArchiveEventDialog`

## mytimes Material Mapping

| mytimes Material | mytimes Use |
| --- | --- |
| `material-panel` | Main event card, admin dashboard shell, event-created page. |
| `material-panel-mini` | Date groups, builder controls, detail sections, link cards. |
| `material-wax-seal` | Slot chips, booking confirmation mark, state dots. |
| `material-stamp-dark` | Create event, confirm booking, cancel final confirmation. |
| `material-stamp-light` | Copy link, export CSV, cancel modal, close slot, reopen slot. |
| Severity tokens | Open/booked/closed/cancelled/bounced status grammar. |
| `stamp-in` motion | Modal open, receipt swap, newly generated slot preview. |

## Visual Rules

- Keep screens work-focused and compact. This is a scheduling tool, not a marketing site.
- Do not nest cards inside cards. Use one main paper panel, then smaller sections only where needed.
- Use wax-seal styling only for stateful or identity-bearing marks.
- Public participant pages should not show participant names, emails, or booked-slot metadata.
- Keep button labels short and literal.
- Use one primary action per screen.
- Make the slot grid responsive with stable chip dimensions so content does not shift when local timezone labels differ in length.

## Build Order

1. Participant happy path with mock data: `EventHeader`, `SlotGrid`, `SlotChip`, `BookingModal`, `ConfirmationReceipt`.
2. Organizer creation shell with mock slot generation: basics form, availability builder, created links page.
3. Admin dashboard with mock states and slot detail drawer.
4. Route model and data contracts for public/admin/manage tokens.
5. Server-backed phase 1: schema, event creation, transactional booking write, public/admin reads.
6. Phase 2: emails, `.ics`, manage cancellation, recovery, CSV export.
7. Phase 3: rate limits, referrer policy, token-safe logs, bounce warning, archive/delete, mobile hardening.

## Clean Removal

To remove the experiment:

```sh
rm -rf apps/slots
npm install
```

No app outside `apps/slots` should import from this workspace until the MVP proves it should become a permanent product surface.
