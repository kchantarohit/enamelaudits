// Usage: npx tsx scripts/audit-cli.ts https://example-dental.com [--json]
import { runAudit } from "../src/lib/audit/engine";
import { rankIssues } from "../src/lib/audit/score";
import { CHECK_BY_ID } from "../src/lib/audit/catalog";

const url = process.argv[2];
if (!url) {
  console.error("Usage: npx tsx scripts/audit-cli.ts <url> [--json]");
  process.exit(1);
}
const res = await runAudit(url);
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(res, null, 2));
} else {
  console.log(`${res.meta.domain}: ${res.score}/100 (${res.grade}) in ${res.meta.durationMs} ms, platform=${res.meta.platform}`);
  console.log(res.categoryScores);
  for (const c of rankIssues(res.checks)) console.log(`- [${c.status}/${c.severity || CHECK_BY_ID[c.id].severity}] ${CHECK_BY_ID[c.id].issue}: ${c.detail}${c.evidence ? "\n    " + c.evidence.join("\n    ") : ""}`);
  console.log(`passed: ${res.checks.filter((c) => c.status === "pass").map((c) => c.id).join(", ")}`);
}
