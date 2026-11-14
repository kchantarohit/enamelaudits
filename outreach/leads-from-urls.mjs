#!/usr/bin/env node
// Turn a plain list of dental practice websites into outreach leads. No API key needed.
//
//   node outreach/leads-from-urls.mjs urls.txt [--enqueue] [--source austin-tx]
//
// urls.txt: one practice per line, "https://practice.com" or "https://practice.com, Practice Name".
// For each site it reads the home page and the usual contact pages and keeps a contact email the
// practice publishes itself: one on its own domain, or a common mailbox provider (gmail.com etc.).
// Addresses on any other domain are ignored (usually the web agency or a vendor, not the clinic).
// Writes outreach/out/leads-from-urls-<date>.csv; with --enqueue, adds them to the Gmail outreach queue.
import fs from "node:fs";
import path from "node:path";
import { OUT, args, domainOf, env, loadEnv, toCsv, today } from "./lib.mjs";
import { findEmail } from "./email-finder.mjs";

loadEnv();
const a = args();
const file = process.argv.slice(2).find((x) => !x.startsWith("--") && x !== a.source);
if (!file) {
  console.error("Usage: node outreach/leads-from-urls.mjs urls.txt [--enqueue] [--source tag]");
  process.exit(1);
}

const entries = fs
  .readFileSync(path.resolve(file), "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const [url, ...rest] = l.split(",");
    return { website: url.trim(), name: rest.join(",").trim() };
  });

const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < entries.length) {
      const e = entries[next++];
      const email = await findEmail(e.website);
      results.push({ ...e, domain: domainOf(e.website), email });
      console.log(`${domainOf(e.website)}: ${email ? email.replace(/^(.).*@/, "$1***@") : "(no public email)"}`);
    }
  }),
);

const withEmail = results.filter((r) => r.email);
const out = path.join(OUT, `leads-from-urls-${today()}.csv`);
fs.writeFileSync(out, toCsv(results, ["name", "email", "website", "domain"]));
console.log(`\n${withEmail.length} of ${results.length} sites publish a usable email -> ${out}`);

if (a.enqueue && withEmail.length) {
  const base = env("SITE_URL", "https://enamelaudits.vercel.app").replace(/\/$/, "");
  const res = await fetch(`${base}/api/outreach/contacts`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env("OUTREACH_TOKEN")}` },
    body: JSON.stringify({ action: "enqueue", rows: withEmail.map((r) => ({ ...r, source: `urls:${a.source || today()}` })) }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(r.error || `enqueue failed (${res.status})`);
  console.log(`Queued ${r.inserted} clinic(s); skipped ${r.skipped} (already contacted, suppressed or invalid).`);
}
