import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const failures = [];
const checked = [];

assertMissing("apps/slots/public/email-previews", "email previews must not live in Vite public/");
assertMissing("apps/slots/dist/email-previews", "email previews must not be present in the production build");

const sourceFiles = [
  "apps/slots/src",
  "apps/slots-api/src",
  "apps/slots-api/scripts",
  "scripts",
  ".env.example",
  "apps/slots-api/.env.example",
].flatMap((path) => filesUnder(path));
const scannedFiles = sourceFiles.filter((file) => !file.endsWith("scripts/test-frontend-readiness.mjs"));

assertNoMatches(scannedFiles, [
  { pattern: /SLOTBOARD_EVENT_PASS_AMOUNT=900\b/, label: "old $9 board-unlock env amount" },
  { pattern: /SLOTBOARD_COMPANY_STANDBY_AMOUNT=6000\b/, label: "old $60 company env amount" },
  { pattern: /https:\/\/mytimes\.app\b|mytimes\.app\//, label: "old mytimes.app public origin" },
  { pattern: /MT-2026-[A-Z0-9]+/, label: "fake receipt id" },
  { pattern: /href="#"/, label: "dead href placeholder" },
  { pattern: /href="#privacy"|href="#terms"/, label: "placeholder legal footer anchors" },
]);

assertFileIncludes("apps/slots/src/views/PricingPage.tsx", [
  "$480",
  "$49 monthly available",
  "Free for small rounds. Company for repeat hiring.",
  "My boards email recovery",
]);
assertFileExcludes("apps/slots/src/views/PricingPage.tsx", [
  "Event Pass",
  "Most teams pick this",
  "$79",
  "$60",
  "$9",
]);
assertFileIncludes("apps/slots/src/lib/routing.ts", [
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/enterprise",
  "/contact",
  "/privacy",
  "/terms",
]);
assertFileIncludes("apps/slots/src/components/AppShell.tsx", [
  'href="/privacy"',
  'href="/terms"',
  'href="/contact"',
  'href="/my-boards/request"',
  "My boards",
]);
assertFileIncludes("apps/slots/src/views/create/ReviewStep.tsx", [
  "active_board_limit_reached",
  "Find previous board",
  "navigate('/my-boards/request')",
]);
assertFileIncludes("apps/slots/src/views/create/DoneStep.tsx", [
  "Find previous boards",
  "navigate('/my-boards/request')",
  "Free includes one active board",
]);
assertFileIncludes("apps/slots/src/views/MyBoardsPage.tsx", [
  "Free board limit",
  "archive",
  "admin view",
  "Compare Company",
]);
assertFileIncludes("apps/slots/src/lib/errorMessages.ts", [
  "Free includes one active board",
]);
assertFileIncludes("apps/slots/src/views/LegalPage.tsx", [
  "Privacy Policy",
  "Terms of Service",
  "support@getcaboo.com",
]);
assertFileIncludes("apps/slots/src/views/ContactPage.tsx", [
  "support@getcaboo.com",
  "submitContactLead",
  "Slack",
  "Teams",
]);
assertFileIncludes("apps/slots/src/views/EnterprisePage.tsx", [
  "Slack &amp; Teams setup",
  "Microsoft Entra ID",
  "Teams",
  "SSO",
]);
assertFileExcludes("apps/slots/src/views/EnterprisePage.tsx", [
  "Azure AD",
  "mark: 'O'",
  "mark: 'A'",
  "mark: 'G'",
]);
assertFileIncludes("apps/slots/scripts/prerender.mts", [
  "/enterprise",
  "/contact",
]);
assertFileIncludes("apps/slots/src/views/PasswordResetPage.tsx", [
  "Reset your password",
  "Choose a new password",
  "Request a fresh link",
  "Email verified",
  "Verification link expired",
]);
assertFileIncludes("apps/slots/src/views/AuthPage.tsx", [
  "Check your email",
  "Verify your email first",
]);
assertFileIncludes("apps/slots/src/views/LandingPage.tsx", [
  "../styles/booking-page.css",
  "../styles/carousel.css",
  "../styles/landing.css",
]);
assertFileIncludes("apps/slots/src/components/Avatar.tsx", [
  "const AVATAR_LOAD_DELAY_MS = 250",
  "priority?: boolean",
  "if (priority || loadDelayMs <= 0)",
]);
assertFileExcludes("apps/slots/src/components/Avatar.tsx", [
  "const AVATAR_LOAD_DELAY_MS = 4000",
]);
assertFileIncludes("apps/slots/src/components/BookingHeaderCard.tsx", [
  "priority",
]);
assertFileIncludes("apps/slots/src/views/create/DetailsStep.tsx", [
  "loadDelayMs={isSelected ? 0 : 700 + index * 200}",
  "priority={isSelected}",
]);
assertFileExcludes("apps/slots/src/views/create/DetailsStep.tsx", [
  "4600 + index * 700",
]);
assertFileIncludes("apps/slots/src/views/BookingPage.tsx", [
  "const [bookingDraft, setBookingDraft] = useState<InlineSlotFormDraft>",
  "setBookingDraft(EMPTY_INLINE_SLOT_FORM_DRAFT);",
  "onDraftChange={setBookingDraft}",
  "if (selectedSlotId && !selectedSlot)",
]);
assertFileIncludes("apps/slots/src/components/InlineSlotForm.tsx", [
  'name="participantName"',
  'name="participantEmail"',
  'name="notes"',
  "maxLength={160}",
  "maxLength={2000}",
  "participantTimezone: viewerTz",
  "participantLocale: navigator.language || undefined",
  "participantOffsetAtBooking: formatUtcOffset(startsAt, viewerTz)",
  "notes: notes.trim()",
  "onDraftChange?.(EMPTY_INLINE_SLOT_FORM_DRAFT)",
  "We kept your",
]);

const distJs = filesUnder("apps/slots/dist/assets").filter((file) => file.endsWith(".js"));
assert(
  distJs.length > 0,
  "production build must contain a JS bundle under apps/slots/dist/assets",
);
const distIndex = readFileSync(join(root, "apps/slots/dist/index.html"), "utf8");
const initialCssLinks = [...distIndex.matchAll(/href="([^"]+\.css)"/g)].map((match) => match[1]);
assert(initialCssLinks.length > 0, "production landing HTML must link initial CSS");
const initialCssText = initialCssLinks
  .map((href) => readFileSync(join(root, "apps/slots/dist", href.replace(/^\//, "")), "utf8"))
  .join("\n");
assertIncludes(initialCssText, ".booking-card", "initial landing CSS includes booking card styles");
assertIncludes(initialCssText, ".day-band", "initial landing CSS includes day band styles");
assertIncludes(initialCssText, ".tz-picker", "initial landing CSS includes timezone picker styles");
const bundleText = distJs.map((file) => readFileSync(file, "utf8")).join("\n");
assertIncludes(bundleText, "Preview only", "bundle must include read-only demo submit label");
assertIncludes(bundleText, "This is a demo board", "bundle must include demo submit guard copy");
assertIncludes(bundleText, "View demo board", "bundle must include demo CTA copy");
assertIncludes(bundleText, "mytimes.co", "bundle must use branded mytimes.co examples");
assertIncludes(bundleText, "Reset your password", "bundle must include password reset request copy");
assertIncludes(bundleText, "Choose a new password", "bundle must include password reset completion copy");
assertIncludes(bundleText, "Check your email", "bundle must include verification sent copy");
assertIncludes(bundleText, "Email verified", "bundle must include email verification success copy");
assertIncludes(bundleText, "Verification link expired", "bundle must include email verification error copy");
assertIncludes(bundleText, "Privacy Policy", "bundle must include privacy page copy");
assertIncludes(bundleText, "Terms of Service", "bundle must include terms page copy");
assertIncludes(bundleText, "support@getcaboo.com", "bundle must include support contact email");
assertIncludes(bundleText, "Slack & Teams setup", "bundle must include Enterprise page copy");
assertIncludes(bundleText, "Microsoft Entra ID", "bundle must include current SSO provider copy");
assertIncludes(bundleText, "Teams notification setup", "bundle must include Enterprise page copy");
assertExcludes(bundleText, "Azure AD", "bundle must not include old Azure AD naming");
assertExcludes(bundleText, "Email previews", "bundle must not include email preview index copy");
assertExcludes(bundleText, "mytimes.app", "bundle must not include old mytimes.app origin");
assertExcludes(bundleText, "MT-2026", "bundle must not include fake receipt ids");
assertExcludes(bundleText, "View live board", "bundle must not call mock route live");
assertExcludes(bundleText, "See a live board", "bundle must not call mock route live");

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures, checked }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked }, null, 2));

function assertMissing(relativePath, label) {
  checked.push(label);
  const absolutePath = join(root, relativePath);
  assert(!existsSync(absolutePath), `${label}: found ${relativePath}`);
}

function assertNoMatches(files, rules) {
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const rule of rules) {
      if (rule.pattern.test(content)) {
        failures.push(`${rule.label}: ${relative(file)}`);
      }
    }
  }
  checked.push(`scanned ${files.length} source/config files for stale public values`);
}

function assertFileIncludes(relativePath, needles) {
  const content = readFileSync(join(root, relativePath), "utf8");
  for (const needle of needles) {
    assertIncludes(content, needle, `${relativePath} includes ${needle}`);
  }
}

function assertFileExcludes(relativePath, needles) {
  const content = readFileSync(join(root, relativePath), "utf8");
  for (const needle of needles) {
    assertExcludes(content, needle, `${relativePath} excludes ${needle}`);
  }
}

function assertIncludes(content, needle, label) {
  checked.push(label);
  assert(content.includes(needle), `${label}: missing "${needle}"`);
}

function assertExcludes(content, needle, label) {
  checked.push(label);
  assert(!content.includes(needle), `${label}: found "${needle}"`);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function filesUnder(relativePath) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) return [];
  if (statSync(absolutePath).isFile()) return [absolutePath];
  const out = [];
  for (const entry of readdirSync(absolutePath)) {
    if (entry === "dist" || entry === "node_modules" || entry.endsWith(".tsbuildinfo")) continue;
    const child = join(absolutePath, entry);
    const stat = statSync(child);
    if (stat.isDirectory()) out.push(...filesUnder(child.slice(root.length + 1)));
    if (stat.isFile() && /\.(css|html|js|json|mjs|mts|ts|tsx|toml|md|example)$/.test(entry)) {
      out.push(child);
    }
  }
  return out;
}

function relative(file) {
  return file.startsWith(root) ? file.slice(root.length + 1) : file;
}
