import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { allPricingPromises, pricingPromiseContract } from "./pricing-promise-contract.mjs";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const strict = process.argv.includes("--strict");
const phaseArg = process.argv.find((arg) => arg.startsWith("--phase="));
const phaseFilter = phaseArg ? phaseArg.slice("--phase=".length) : undefined;

const promises = allPricingPromises().filter((promise) =>
  phaseFilter ? promise.phase === phaseFilter : true,
);

const report = promises.map((promise) => {
  const publicEvidence = checkEvidence(promise.publicEvidence ?? []);
  const implementationEvidence = checkEvidence(promise.implementationEvidence ?? []);
  const testEvidence = checkEvidence(promise.testEvidence ?? []);
  const required = [...publicEvidence, ...implementationEvidence, ...testEvidence];
  const passed = required.filter((item) => item.ok).length;
  const total = required.length;
  const status =
    total > 0 && passed === total
      ? "complete"
      : passed > 0
        ? "partial"
        : "missing";

  return {
    id: promise.id,
    tier: promise.tier,
    label: promise.label,
    phase: promise.phase,
    salesLed: promise.salesLed,
    status,
    passed,
    total,
    missing: required
      .filter((item) => !item.ok)
      .map((item) => ({
        file: item.file,
        expected: item.includes,
        reason: item.reason,
      })),
  };
});

const counts = report.reduce(
  (acc, item) => {
    acc[item.status] += 1;
    return acc;
  },
  { complete: 0, partial: 0, missing: 0 },
);

const strictFailures = report.filter((item) => item.status !== "complete");
const output = {
  ok: strict ? strictFailures.length === 0 : true,
  readyForStrict: strictFailures.length === 0,
  strict,
  phase: phaseFilter ?? "all",
  contractVersion: pricingPromiseContract.version,
  counts,
  gaps: report
    .filter((item) => item.status !== "complete")
    .map((item) => ({
      id: item.id,
      tier: item.tier,
      label: item.label,
      phase: item.phase,
      status: item.status,
      missing: item.missing,
    })),
};

console.log(JSON.stringify(output, null, 2));

if (strict && strictFailures.length > 0) {
  process.exit(1);
}

function checkEvidence(evidence) {
  return evidence.map((item) => {
    const absolutePath = join(root, item.file);
    if (!existsSync(absolutePath)) {
      return {
        ...item,
        ok: false,
        reason: "file_missing",
      };
    }
    const content = readFileSync(absolutePath, "utf8");
    const ok = content.includes(item.includes);
    return {
      ...item,
      ok,
      reason: ok ? "found" : "text_missing",
    };
  });
}

