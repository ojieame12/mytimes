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
]);

assertFileIncludes("apps/slots/src/views/PricingPage.tsx", [
  "$480",
  "$49 monthly available",
  "Free for small rounds. Company for repeat hiring.",
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

const distJs = filesUnder("apps/slots/dist/assets").filter((file) => file.endsWith(".js"));
assert(
  distJs.length > 0,
  "production build must contain a JS bundle under apps/slots/dist/assets",
);
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
