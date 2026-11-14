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
import { OUT, args, domainOf, env, loadEnv, sleep, toCsv, today } from "./lib.mjs";

loadEnv();
const a = args();
const file = process.argv.slice(2).find((x) => !x.startsWith("--") && x !== a.source);
if (!file) {
  console.error("Usage: node outreach/leads-from-urls.mjs urls.txt [--enqueue] [--source tag]");
  process.exit(1);
}

const FREE = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", "icloud.com", "me.com", "msn.com", "live.com", "sbcglobal.net", "att.net", "comcast.net", "verizon.net", "bellsouth.net", "protonmail.com"]);
const JUNK = /(example\.|sentry|wixpress|domain\.com|yourdomain|email\.com|\.(png|jpe?g|gif|webp|svg)$|@2x|noreply|no-reply|donotreply|privacy@|webmaster@)/i;
const UA = "Mozilla/5.0 (compatible; EnamelAuditsBot/1.0; +https://enamelaudits.vercel.app/bot)";

const entries = fs
  .readFileSync(path.resolve(file), "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const [url, ...rest] = l.split(",");
    return { website: url.trim(), name: rest.join(",").trim() };
  });

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "user-agent": UA, accept: "text/html" } });
    if (!res.ok) return "";
    return (await res.text()).slice(0, 1_500_000);
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

async function findEmail(website) {
  const base = /^https?:/i.test(website) ? website : `https://${website}`;
  const site = domainOf(base);
  const pages = [base, "/contact", "/contact-us", "/contact-us/", "/contact/", "/about-us"].map((p) => (p.startsWith("/") ? new URL(p, base).toString() : p));
  const found = new Set();
  for (const p of pages) {
    const html = await get(p);
    if (!html) continue;
    const mailtos = [...html.matchAll(/mailto:([^"'?>\s]+)/gi)].map((m) => {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return m[1];
      }
    });
    const plain = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    for (const e of [...mailtos, ...plain]) {
      const email = e.toLowerCase().replace(/^\/+/, "");
      if (!JUNK.test(email)) found.add(email);
    }
    const own = [...found].find((e) => e.endsWith("@" + site) || e.endsWith("." + site));
    if (own) return own;
    await sleep(300);
  }
  return [...found].find((e) => FREE.has(e.split("@")[1])) || "";
}

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
