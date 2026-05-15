/* One-off email preview renderer.
 * Mirrors the production caller shapes so designers can visually verify
 * what each variant will look like in real inboxes. Writes HTML files
 * outside the Vite public directory so previews are never shipped. */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEmailHtml, renderLinkCard } from '../src/email.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../../.generated/email-previews');
mkdirSync(OUT, { recursive: true });

// Slots dev origin so PNG wordmark + DiceBear avatars resolve.
const ASSET_BASE = process.env.SLOTBOARD_EMAIL_PREVIEW_ASSET_BASE || 'http://127.0.0.1:5174';

// Match the FONT_DISPLAY constant in src/email.ts.
const FONT_DISPLAY = "'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif";
const COLOR_BODY = '#27272A';

const heroBody = (html: string) =>
  `<p style="margin:0 0 18px 0;font-family:${FONT_DISPLAY};font-size:17px;line-height:1.55;color:${COLOR_BODY};letter-spacing:-0.003em">${html}</p>`;

const samples: Record<string, () => string> = {
  '01-booking-confirmation': () =>
    renderEmailHtml({
      assetBaseURL: ASSET_BASE,
      eyebrow: 'Booking confirmed',
      title: 'Confirmed with Emily.',
      preheader: '10:00–11:00 · SAST · 60 min with Emily Carter · calendar attached',
      timeBlock: {
        primary: { label: 'Your time', weekday: 'Tuesday', date: '18 May 2026', timeRange: '10:00–11:00', timezone: 'SAST' },
        secondary: { label: 'organizer time', weekday: 'Tuesday', date: '18 May 2026', timeRange: '09:00–10:00', timezone: 'BST' },
      },
      timeBlockStyle: 'hero',
      personLockup: { role: 'Organizer', name: 'Emily Carter', email: 'emily@vision.studio' },
      body: heroBody(`<strong style="font-weight:600">60 minutes</strong> on <strong style="font-weight:600">Vision Assessment</strong>. A calendar invite is attached. Drop it in and you're set.`),
      pullQuote: { text: 'On a phone for the first five minutes.', attribution: 'your note, on booking' },
      primaryCta: { href: 'https://mytimes.co/m/k3J9-2Xm-4Tn8', label: 'Manage booking' },
      whatsNext: [
        `Add the attached <strong style="font-weight:600">.ics</strong> to your calendar. You'll get a reminder automatically.`,
        `Need to reschedule or cancel? Use the <strong style="font-weight:600">Manage booking</strong> link above.`,
        `Replying to this email reaches Emily directly.`,
      ],
      footerNote: "Sent because you booked a time on Emily's mytimes board.",
      manageURL: 'https://mytimes.co/m/k3J9-2Xm-4Tn8',
    }),

  '02-event-created': () =>
    renderEmailHtml({
      assetBaseURL: ASSET_BASE,
      eyebrow: 'Board created',
      title: 'Your board is live.',
      preheader: 'Vision Assessment · two links below · share the public, save the admin',
      body: [
        heroBody(`Two links below. The first is public. Share it with anyone who needs to book a time. The second is yours.`),
        renderLinkCard({ variant: 'public', label: 'Public participant link', url: 'https://mytimes.co/b/vision-assessment-2026', caption: 'Share this with the people who need to book a slot.' }),
        renderLinkCard({ variant: 'admin', label: 'Private admin link', url: 'https://mytimes.co/admin/k3J9-2Xm-4Tn8', caption: "Save this somewhere safe. It's how you manage this board. Anyone with it can edit, cancel, or close it." }),
      ].join(''),
      primaryCta: { href: 'https://mytimes.co/admin/k3J9-2Xm-4Tn8', label: 'Open board admin' },
      whatsNext: [
        `Share the <strong style="font-weight:600">public link</strong> with anyone who needs to book a time.`,
        `Save the <strong style="font-weight:600">admin link</strong> somewhere safe. It's how you run the board.`,
        `You'll get an email each time someone books, with their note and time.`,
      ],
      footerNote: 'Sent because you just created a mytimes board.',
    }),

  '03-cancellation-participant': () =>
    renderEmailHtml({
      assetBaseURL: ASSET_BASE,
      eyebrow: 'Booking cancelled',
      title: 'Your time is open again.',
      preheader: 'cancelled · 10:00–11:00 · SAST · rebook below',
      timeBlock: {
        primary: { label: 'Was', weekday: 'Tuesday', date: '18 May 2026', timeRange: '10:00–11:00', timezone: 'SAST' },
      },
      timeBlockStyle: 'muted',
      personLockup: { role: 'Organizer', name: 'Emily Carter' },
      body: heroBody(`Your booking for <strong style="font-weight:600">Vision Assessment</strong> has been cancelled. The time is available again on the board.`),
      primaryCta: { href: 'https://mytimes.co/b/vision-assessment-2026', label: 'Pick another time' },
      whatsNext: [
        `Pick another time on the board if you'd like to rebook.`,
        `If you didn't mean to cancel, reach out to Emily directly.`,
      ],
      footerNote: 'A cancellation invite is attached so your calendar stays in sync.',
    }),

  '04-admin-recovery': () =>
    renderEmailHtml({
      assetBaseURL: ASSET_BASE,
      eyebrow: 'Admin link recovery',
      title: "Here's a fresh admin link.",
      preheader: 'fresh admin link · Vision Assessment · replaces the previous one',
      body: [
        heroBody(`Someone requested a new admin link for <strong style="font-weight:600">Vision Assessment</strong>. This one replaces the previous.`),
        renderLinkCard({ variant: 'admin', label: 'Private admin link', url: 'https://mytimes.co/admin/k3J9-2Xm-4Tn8', caption: 'Save this somewhere safe. Anyone with it can manage this board.' }),
      ].join(''),
      primaryCta: { href: 'https://mytimes.co/admin/k3J9-2Xm-4Tn8', label: 'Open board admin' },
      whatsNext: [
        `Save this link somewhere safe. It's the only way to manage <strong style="font-weight:600">Vision Assessment</strong>.`,
        `The previous admin link has been replaced and no longer works.`,
      ],
      footerNote: "If you didn't request this, you can safely ignore this email.",
    }),

  '05-my-boards-link': () =>
    renderEmailHtml({
      assetBaseURL: ASSET_BASE,
      eyebrow: 'Boards link',
      title: 'Your boards, in one place.',
      preheader: '3 boards · private link · expires in 24 hours',
      body: [
        heroBody(`Click below to see every board you've created with this email: <strong style="font-weight:600">3 boards</strong> in total. Link works for 24 hours.`),
        renderLinkCard({ variant: 'admin', label: 'Your private boards link', url: 'https://mytimes.co/my-boards?token=abc123def456', caption: 'Anyone with this link can request fresh admin links for boards tied to this email. Keep it private.' }),
      ].join(''),
      primaryCta: { href: 'https://mytimes.co/my-boards?token=abc123def456', label: 'Open my boards' },
      footerNote: "If you didn't request this, you can safely ignore this email. The link only works for the email it was sent to.",
    }),

  '06-organizer-new-booking': () =>
    renderEmailHtml({
      assetBaseURL: ASSET_BASE,
      eyebrow: 'New booking',
      title: 'Casey grabbed a slot.',
      preheader: '09:00–10:00 · BST · Casey Rivera on Vision Assessment',
      timeBlock: {
        primary: { label: 'Your time', weekday: 'Tuesday', date: '18 May 2026', timeRange: '09:00–10:00', timezone: 'BST' },
        secondary: { label: 'their time', weekday: 'Tuesday', date: '18 May 2026', timeRange: '10:00–11:00', timezone: 'SAST' },
      },
      timeBlockStyle: 'hero',
      personLockup: { role: 'Participant', name: 'Casey Rivera', email: 'casey@example.com' },
      body: heroBody(`Someone just claimed a time on your <strong style="font-weight:600">Vision Assessment</strong> board.`),
      pullQuote: { text: 'I might run two minutes late — heads down on a deploy.', attribution: 'from Casey' },
      whatsNext: [
        `Their slot is on your calendar automatically once they add the invite.`,
        `Replying to this email reaches Casey directly.`,
      ],
      footerNote: "Sent because you're the organizer of Vision Assessment.",
    }),

  '07-organizer-cancellation': () =>
    renderEmailHtml({
      assetBaseURL: ASSET_BASE,
      eyebrow: 'Booking cancelled',
      title: 'Casey cancelled.',
      preheader: 'Casey Rivera · cancelled · 09:00–10:00 BST',
      timeBlock: {
        primary: { label: 'Freed up', weekday: 'Tuesday', date: '18 May 2026', timeRange: '09:00–10:00', timezone: 'BST' },
      },
      timeBlockStyle: 'muted',
      personLockup: { role: 'Participant', name: 'Casey Rivera', email: 'casey@example.com' },
      body: heroBody(`Their time is available again. The board now shows <strong style="font-weight:600">4</strong> open slots.`),
      primaryCta: { href: 'https://mytimes.co/admin/k3J9-2Xm-4Tn8', label: 'Open board admin' },
      footerNote: 'Sent because you’re the organizer of Vision Assessment.',
    }),

  '08-managed-booking-resend': () =>
    renderEmailHtml({
      assetBaseURL: ASSET_BASE,
      eyebrow: 'Your booking',
      title: "Here's your booking again.",
      preheader: 'your booking · 10:00–11:00 · SAST · with Emily Carter',
      timeBlock: {
        primary: { label: 'Your time', weekday: 'Tuesday', date: '18 May 2026', timeRange: '10:00–11:00', timezone: 'SAST' },
      },
      timeBlockStyle: 'hero',
      personLockup: { role: 'Organizer', name: 'Emily Carter', email: 'emily@vision.studio' },
      body: heroBody(`Fresh copy of your booking on <strong style="font-weight:600">Vision Assessment</strong>, with the link to manage or cancel it.`),
      primaryCta: { href: 'https://mytimes.co/m/k3J9-2Xm-4Tn8', label: 'Manage booking' },
      footerNote: 'Sent because you asked us to resend your booking details.',
      manageURL: 'https://mytimes.co/m/k3J9-2Xm-4Tn8',
    }),

  '09-manage-link-recovery': () =>
    renderEmailHtml({
      assetBaseURL: ASSET_BASE,
      eyebrow: 'Booking link',
      title: 'Your manage link is back.',
      preheader: 'manage link · 10:00–11:00 · SAST · Vision Assessment',
      timeBlock: {
        primary: { label: 'Your time', weekday: 'Tuesday', date: '18 May 2026', timeRange: '10:00–11:00', timezone: 'SAST' },
      },
      timeBlockStyle: 'hero',
      personLockup: { role: 'Organizer', name: 'Emily Carter', email: 'emily@vision.studio' },
      body: heroBody(`Use the link below to manage or cancel your booking on <strong style="font-weight:600">Vision Assessment</strong>.`),
      primaryCta: { href: 'https://mytimes.co/m/k3J9-2Xm-4Tn8', label: 'Manage booking' },
      footerNote: 'Sent because you asked us to resend your booking management link.',
      manageURL: 'https://mytimes.co/m/k3J9-2Xm-4Tn8',
    }),

  '10-operational-test': () =>
    renderEmailHtml({
      assetBaseURL: ASSET_BASE,
      eyebrow: 'System check',
      title: 'Email is up.',
      preheader: 'Provider delivery reached this inbox.',
      body: heroBody(`If you received this, the configured production email provider can deliver mail from the API service.`),
      footerNote: 'This is an operational test message.',
    }),
};

const indexLinks: string[] = [];
for (const [name, build] of Object.entries(samples)) {
  const html = build();
  const filePath = join(OUT, `${name}.html`);
  writeFileSync(filePath, html, 'utf8');
  indexLinks.push(
    `<li><a href="./${name}.html" style="font-family:Georgia,serif;font-size:18px;color:#27272A">${name}</a></li>`,
  );
  console.log(`wrote ${filePath}`);
}

writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><html><body style="font-family:Georgia,serif;background:#FBF6EE;padding:40px"><h1>Email previews</h1><ul style="line-height:2">${indexLinks.join('')}</ul></body></html>`,
  'utf8',
);
console.log(`wrote index`);
