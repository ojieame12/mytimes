---
name: mytimes
description: A compact, tangible booking-board system for one-off interview rounds.
colors:
  brand-primary: "#005F83"
  brand-primary-hover: "#174751"
  brand-accent: "#3EB1C8"
  brand-soft: "#E8F7F9"
  stamp-orange: "#F05A28"
  warm-paper: "#FEFCF8"
  sand-paper: "#EBE5DB"
  zinc-50: "#FAFAFA"
  zinc-100: "#F4F4F5"
  zinc-200: "#E4E4E7"
  zinc-300: "#D4D4D8"
  zinc-400: "#A1A1AA"
  zinc-500: "#71717A"
  zinc-700: "#3F3F46"
  zinc-800: "#27272A"
  ink: "#091E22"
  success: "#16A34A"
  danger: "#DC2626"
  warning: "#D97706"
  info: "#2563EB"
typography:
  display:
    fontFamily: "SF Compact Rounded, -apple-system, BlinkMacSystemFont, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(40px, 6vw, 72px)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "0"
  headline:
    fontFamily: "SF Compact Rounded, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(30px, 4vw, 48px)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "0"
  title:
    fontFamily: "SF Compact Rounded, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0"
  body:
    fontFamily: "SF Compact Rounded, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0"
  label:
    fontFamily: "SF Compact Rounded, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
  mono:
    fontFamily: "Geist Mono Variable, ui-monospace, SF Mono, Menlo, Monaco, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  xs: "2px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "64px"
  page: "96px"
components:
  button-primary:
    backgroundColor: "{colors.brand-primary}"
    textColor: "{colors.warm-paper}"
    rounded: "{rounded.md}"
    padding: "0 22px"
    height: "48px"
    typography: "{typography.body}"
  button-quiet:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.zinc-800}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "44px"
    typography: "{typography.body}"
  card-paper:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.zinc-800}"
    rounded: "{rounded.lg}"
    padding: "24px"
  card-sand:
    backgroundColor: "{colors.sand-paper}"
    textColor: "{colors.zinc-800}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input-control:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.zinc-800}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "44px"
    typography: "{typography.body}"
---

# Design System: mytimes

## 1. Overview

**Creative North Star: "The stamped interview packet"**

mytimes should feel like a warm, physical packet prepared for a specific interview round: compact, useful, and easy to hand to someone else. The interface borrows from letterpress, small receipts, admin stamps, paper cards, and tidy calendar ephemera without becoming decorative. It is a booking board, not calendar software.

The system favors restrained surfaces, a decisive deep-teal action axis, dense but calm information, and real product fragments over abstract SaaS illustration. Every screen should answer one job quickly: create the board, claim the slot, recover the link, export the records, or decide whether to pay.

**Key Characteristics:**
- Warm near-white canvas with sand paper surfaces and teal-ink action states.
- Rounded, compact controls: default radius is 6px, with 8px for cards and 12px for hero-scale surfaces.
- Teal is the operating color. Orange survives only as a small stamp accent, never the default action color.
- Mono type is for numerals, times, dates, IDs, prices, and URLs. It is not the brand voice by itself.
- Real product UI is the imagery. Booking cards, day bands, link cards, admin desks, and receipt panels prove the product.

## 2. Colors

The palette is warm paper plus a two-tone teal axis, with sand neutrals for tactility and small semantic colors for operational state.

### Primary
- **Deep Teal** (#005F83): The brand anchor. Use for primary CTA backgrounds, active paid states, selected states, links, and serious action.
- **Bright Teal** (#3EB1C8): The energy accent. Use for gradients, focus glow, highlights, and small proof details.
- **Teal Ink** (#091E22 to #174751): Private/admin surfaces, selected day bands, dark product proof, and footer-weight sections.
- **Stamp Orange** (#F05A28): A retained warmth accent for brand seals, tiny trust marks, and occasional paid/attention stamps. It is not the CTA color.

### Secondary
- **Success Green** (#16A34A): Open or active status only.
- **Danger Red** (#DC2626): Destructive action and validation errors only.
- **Warning Amber** (#D97706): Waiting, caution, or setup attention.
- **Info Blue** (#2563EB): Rare informational status where teal would imply primary action.

### Neutral
- **Warm Paper** (#FEFCF8): The perceived canvas, equivalent to the warm `--white` token.
- **Sand Paper** (#EBE5DB): Marketing and pricing surfaces that need tangible warmth.
- **Zinc Mist** (#F4F4F5): Sunken or quiet background.
- **Zinc Hairline** (#E4E4E7): Default divider and border.
- **Muted Ink** (#71717A): Secondary labels and support text.
- **Body Ink** (#3F3F46): Main body copy.
- **Deep Ink** (#27272A): Heading text and strong UI text.
- **Night Ink** (#091E22): Dark admin cards, custom-domain cards, and selected slot surfaces.

### Named Rules

**The Teal Action Rule.** Teal marks the one action or selected state in a local region. If every control is teal, the hierarchy is broken.

**The Orange Stamp Rule.** Orange is a retained material accent. If it starts carrying primary actions again, the system has regressed.

**The Warm Neutral Rule.** Never introduce pure white or pure black. Near-white and near-black must keep the existing warm bias.

## 3. Typography

**Display Font:** SF Compact Rounded, with system sans fallbacks.  
**Body Font:** SF Compact Rounded, with system sans fallbacks.  
**Label/Mono Font:** Geist Mono Variable for numeric and tokenized content only.

**Character:** The type system is soft, compact, and mechanical enough for scheduling without feeling like enterprise calendar software. It should feel like printed admin material, not a generic SaaS dashboard.

### Hierarchy
- **Display** (400, `clamp(40px, 6vw, 72px)`, 1.02): Landing hero headlines and only the largest marketing moments.
- **Headline** (400-650, `clamp(30px, 4vw, 48px)`, 1.05): Section titles, pricing titles, major empty states.
- **Title** (600, 16-24px, 1.25): Card titles, dashboard panel titles, plan names, form section headings.
- **Body** (400, 14-16px, 1.55-1.65): Product copy, form guidance, FAQ answers, panel descriptions. Keep long body lines under 65-75ch.
- **Label** (600-700, 10.5-12px, 0.04-0.08em): Short uppercase stamps and tiny section labels only.
- **Mono** (400-700, 11-24px, 1.2-1.4): Times, dates, counts, prices, reference codes, URLs.

### Named Rules

**The Mono Evidence Rule.** Mono proves something factual: a time, price, count, link, date, or ID. Do not use mono as generic "technical" flavor.

**The Display Restraint Rule.** Hero-scale type belongs to heroes and major section turns. Compact panels, cards, and dashboards use tighter title scales.

## 4. Elevation

mytimes uses tactile, teal-ink-tinted elevation over warm paper. Depth should feel like paper lifted from a warm desk: diffuse, low contrast, and never neutral gray. Controls often use inset highlights to read as pressed material.

### Shadow Vocabulary
- **Flat** (`none`): Default for text, nav links, rules, and dense list rows.
- **Card** (`0 1px 2px hsla(194, 44%, 18%, 0.05), 0 2px 4px hsla(194, 44%, 18%, 0.04), 0 4px 8px hsla(194, 44%, 18%, 0.04), 0 8px 16px hsla(194, 44%, 18%, 0.03)`): Standard paper cards and repeated panels.
- **Elevated Card** (`0 1px 2px hsla(194, 44%, 18%, 0.06), 0 2px 4px hsla(194, 44%, 18%, 0.06), 0 4px 8px hsla(194, 44%, 18%, 0.05), 0 8px 16px hsla(194, 44%, 18%, 0.05), 0 16px 32px hsla(194, 44%, 18%, 0.04)`): Important containers, dialogs, and surfaces that need more presence.
- **Button Rest** (`0 1px 2px hsla(194, 44%, 18%, 0.05), 0 2px 4px hsla(194, 44%, 18%, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)`): Quiet buttons and material controls.
- **Primary Button** (`0 1px 2px hsla(194, 100%, 22%, 0.22), 0 4px 8px hsla(194, 100%, 22%, 0.16), 0 8px 16px -4px hsla(194, 100%, 22%, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.22)`): Teal action buttons only.
- **Primary Glow** (`0 0 0 4px hsla(188, 55%, 52%, 0.14), 0 10px 24px -8px hsla(188, 55%, 52%, 0.44), inset 0 1px 0 rgba(255, 255, 255, 0.25)`): Hover state for the single primary action.

### Named Rules

**The Warm Shadow Rule.** Shadows must be teal-ink tinted or warm-paper tinted. Neutral gray shadows are prohibited.

**The Lift Has Meaning Rule.** Elevation appears for focus, hover, selected state, or important containers. Do not add floating cards for decoration.

## 5. Components

### Buttons

- **Shape:** Compact material stamp, default 6px radius.
- **Primary:** Diagonal teal gradient from #005F83 toward #3EB1C8, warm light text, 44-48px height, medium weight, teal-ink shadow.
- **Hover / Focus:** Primary buttons darken toward #174751 and gain a soft teal glow. Focus uses a clear 2px teal outline or an inset focus surface on form controls.
- **Quiet:** Warm-paper background, teal-ink text, 1px border, button-rest shadow. Use for secondary actions.
- **Danger:** Keep destructive actions quiet unless the action is the only task on the screen. Red text on a light button is usually enough.

### Chips

- **Style:** Small rounded rectangles with 6px radius, border, and factual mono values.
- **State:** Open, selected, booked, and closed states must be distinguishable by text, color, and surface. Never rely on color alone.
- **Time Chips:** Time is mono and dominant. Meridiem is smaller and warmer. Source timezone or date-shift details are auxiliary.

### Cards / Containers

- **Corner Style:** 8px for normal cards, 12px for hero or warm marketing cards.
- **Background:** Warm paper for product cards, sand paper for marketing and pricing proof surfaces, night ink for admin/private/custom-domain cards.
- **Shadow Strategy:** Use `--shadow-card` by default. Reserve stronger shadows for primary CTA, modal, or selected state.
- **Border:** 1px warm or teal-tinted hairline. Teal borders signal paid, selected, or product proof, not decoration.
- **Internal Padding:** 16-24px for normal cards, 24-32px for major marketing panels.

### Inputs / Fields

- **Style:** 44px minimum height, 6px radius, warm paper fill, inset border, body font.
- **Focus:** No extra decorative glow. Focus lives on the control surface: teal-tinted fill, 1.5px teal inset border, and subtle pressed shadow.
- **Error / Disabled:** Error uses red inset border and red helper text with dot marker. Disabled uses sand mist and muted text.

### Navigation

- **Style:** Sticky top bar, warm canvas, thin bottom hairline, small brand seal, plain text links.
- **Typography:** 13.5-15px body font. No all-caps navigation.
- **Mobile:** Hide low-priority support text and keep the bar compact. Preserve Pricing, Account, and Sign in.

### Booking Card

The booking card is the proof object. It uses a sand-tinted paper surface, a compact stamp eyebrow, display title, factual icon metadata, and a bottom strip for counts, reference, trust, and expansion. It should look like the real board, not an illustration of a board.

### Day Band

The day band is the signature interaction. The date block is the visual anchor; available time chips sit to the right on desktop and become a responsive grid on mobile. Selecting a chip inverts the day band to night ink and opens the booking form inline.

### Link Card

Public and admin links are shown as tangible cards. Public links stay light. Admin/private/custom-domain cards use night ink with teal labels and mono URLs. Long URLs must wrap with `overflow-wrap: anywhere`.

## 6. Do's and Don'ts

### Do:

- **Do** keep the product focused on fixed interview times, one public booking link, and one private organizer/admin link.
- **Do** use teal for the one primary action, paid upgrade state, or active status in a local region.
- **Do** show real product fragments on marketing pages: booking card, day band, link card, admin desk, receipt, pricing plan.
- **Do** keep controls compact: 6px radius, 44px minimum touch target, and readable 13-15px text.
- **Do** use mono for times, dates, counts, IDs, prices, and links.
- **Do** wrap long URLs and codes on mobile.
- **Do** make participants feel account-free: simple form, confirmation, calendar file, private manage link.

### Don't:

- **Don't** make mytimes feel like "Typical bloated calendar SaaS (Calendly, etc.)."
- **Don't** add recurring rules, multi-organizer flows, nested cards, or generic SaaS dashboards.
- **Don't** use generic hero illustrations, gradient orbs, bokeh blobs, glass panels, or decorative abstract diagrams.
- **Don't** compete as "another scheduler." The landing should sell a one-off interview booking board and the subscription as company operating mode.
- **Don't** put custom domains into the $9 Event Pass framing. Custom domains are Company Standby territory.
- **Don't** use mono as a costume for technical credibility.
- **Don't** make orange decorative. It is now a small retained stamp accent, not the action system.
- **Don't** nest cards inside cards unless the nested object is a real repeated item, modal, or framed tool.
