#!/usr/bin/env node
// Build a lead list of dental practices with websites, using the official Google Places API.
//
//   node outreach/find-leads.mjs --city "Austin, TX" [--query "dentist"] [--max 60] [--emails] [--enqueue]
//
// Output: outreach/out/leads-<city>.csv with name, website, phone, address, rating, reviews,
// and (with --emails) a publicly listed contact email found on the practice's own website.
// With --enqueue, practices that have an email are added straight to the Gmail outreach queue.
// Requires GOOGLE_PLACES_API_KEY (Places API (New) enabled; first $200/month of usage is free).
import path from "node:path";
import fs from "node:fs";
import { OUT, args, domainOf, env, loadEnv, sleep, toCsv } from "./lib.mjs";

loadEnv();
const a = args();
if (!a.city) {
  console.error('Usage: node outreach/find-leads.mjs --city "Austin, TX" [--query dentist] [--max 60] [--emails]');
  process.exit(1);
}
const key = env("GOOGLE_PLACES_API_KEY");
const query = `${a.query || "dentist"} in ${a.city}`;
const max = Number(a.max || 60);

async function searchPage(pageToken) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.websiteUri,places.nationalPhoneNumber,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus,nextPageToken",
    },
    body: JSON.stringify({ textQuery: query, pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`);
  return res.json();
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BAD_EMAIL = /(example\.|sentry|wixpress|godaddy|domain\.com|yourdomain|email\.com|\.png|\.jpg|\.webp|@2x)/i;

/** Find a contact email the practice publishes on its own site (home or contact page). */
async function findEmail(website) {
  const base = /^https?:/i.test(website) ? website : `https://${website}`;
  const pages = [base, new URL("/contact", base).toString(), new URL("/contact-us", base).toString()];
  const site = domainOf(base);
  for (const p of pages) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch(p, { signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; EnamelAuditsBot/1.0; +https://enamelaudits.vercel.app/bot)" } });
      clearTimeout(t);
      if (!res.ok) continue;
      const html = await res.text();
      const mailtos = [...html.matchAll(/mailto:([^"'?>\s]+)/gi)].map((m) => decodeURIComponent(m[1]));
      const found = [...mailtos, ...(html.match(EMAIL_RE) || [])].map((e) => e.toLowerCase()).filter((e) => !BAD_EMAIL.test(e));
      // Prefer an address on the practice's own domain.
      const own = found.find((e) => e.endsWith("@" + site) || e.endsWith("." + site));
      if (own || found[0]) return own || found[0];
    } catch {
      /* try next page */
    }
    await sleep(500);
  }
  return "";
}

const leads = [];
let token;
do {
  const page = await searchPage(token);
  for (const p of page.places || []) {
    if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
    if (!p.websiteUri) continue;
    leads.push({
      name: p.displayName?.text || "",
      website: p.websiteUri,
      domain: domainOf(p.websiteUri),
      phone: p.nationalPhoneNumber || "",
      address: p.formattedAddress || "",
      city: a.city,
      rating: p.rating ?? "",
      reviews: p.userRatingCount ?? "",
      place_id: p.id,
      email: "",
      first_name: "",
    });
  }
  token = page.nextPageToken;
  if (token) await sleep(2000);
} while (token && leads.length < max);

// De-duplicate by domain (multi-location groups share one site).
const unique = [...new Map(leads.map((l) => [l.domain, l])).values()].slice(0, max);

if (a.emails) {
  for (const l of unique) {
    l.email = await findEmail(l.website);
    console.log(`${l.domain}: ${l.email || "(no public email)"}`);
  }
}

const file = path.join(OUT, `leads-${a.city.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`);
fs.writeFileSync(file, toCsv(unique, ["name", "first_name", "email", "website", "domain", "phone", "address", "city", "rating", "reviews", "place_id"]));
console.log(`\n${unique.length} practices with websites -> ${file}`);
if (a.enqueue) {
  const rows = unique.filter((l) => l.email).map((l) => ({ email: l.email, website: l.website, domain: l.domain, name: l.name, city: l.city, source: `places:${a.city}` }));
  const base = env("SITE_URL", "https://enamelaudits.vercel.app").replace(/\/$/, "");
  const res = await fetch(`${base}/api/outreach/contacts`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env("OUTREACH_TOKEN")}` },
    body: JSON.stringify({ action: "enqueue", rows }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(r.error || `enqueue failed (${res.status})`);
  console.log(`Queued ${r.inserted} clinic(s) for Gmail outreach; skipped ${r.skipped} (duplicates, suppressed or invalid).`);
} else {
  console.log("Review the list, remove anyone you shouldn't contact, then: node outreach/gmail-outreach.mjs --enqueue " + path.relative(process.cwd(), file));
}
