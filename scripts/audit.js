#!/usr/bin/env node
// Usage: node scripts/audit.js https://example-dental.com [--json]
import { runAudit } from '../lib/audit.js';

const url = process.argv[2];
if (!url) { console.error('Usage: node scripts/audit.js <website> [--json]'); process.exit(1); }
const r = await runAudit(url, { pagespeedKey: process.env.PAGESPEED_API_KEY });
if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
console.log(`\n${r.finalUrl}\nScore ${r.score}/100  Grade ${r.grade}  (${r.durationMs} ms)\n`);
for (const c of r.categories) console.log(`  ${c.label.padEnd(22)} ${c.score ?? '-'}`);
console.log(`\nIssues (${r.findings.length}):`);
for (const f of r.findings) console.log(`  [${f.severity.toUpperCase()}] ${f.title}`);
console.log(`\nPassed (${r.passed.length}):`);
for (const p of r.passed) console.log(`  ✓ ${p.title}`);
