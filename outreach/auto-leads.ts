// Daily automated lead finder: small-town US dental practices -> audited -> outreach queue. No API key needed.
//
//   npx tsx outreach/auto-leads.ts [--state KS] [--target 12] [--max-sites 90] [--dry-run]
//
// 1. Picks today's US state (rotates through STATES, one per day) unless --state is given.
// 2. Asks OpenStreetMap (Overpass API) for dentists with a website in that state, plus every city of
//    50,000+ people. Drops practices within 15 km of those cities (so: smaller towns), chains,
//    institutions, multi-location groups (same website 3+ times) and directory/social links.
// 3. Drops domains already in the outreach queue/history or on the suppression list.
// 4. For the rest, in random order: finds an email the practice publishes on its own site, runs the
//    real audit engine, and queues the practice if it has a strong, patient-facing problem
//    (prospectQuality in email-template.mjs). Weak prospects are recorded as screened out so they're
//    never checked again. Practices with no public email are left alone.
// Stops once --target practices are queued or --max-sites sites were checked. Logs never show emails.
// Map data © OpenStreetMap contributors (ODbL).
import { runAudit } from "../src/lib/audit/engine";
import { rankIssues, severityOf } from "../src/lib/audit/score";
import { CHECK_BY_ID } from "../src/lib/audit/catalog";
// @ts-ignore: plain JS helpers shared with the other outreach scripts
import { args, domainOf, env, loadEnv, sleep } from "./lib.mjs";
// @ts-ignore
import { findEmail } from "./email-finder.mjs";
// @ts-ignore
import { prospectQuality } from "./email-template.mjs";

loadEnv();
const a = args() as Record<string, string | boolean>;
const DRY = !!a["dry-run"];
const TARGET = Math.max(1, Number(a.target || process.env.LEADS_DAILY_TARGET || 12));
const MAX_SITES = Math.max(1, Number(a["max-sites"] || 90));
const BACKLOG_MAX = Number(process.env.LEADS_BACKLOG_MAX || 40);
const BIG_CITY_POP = 50_000;
const BIG_CITY_RADIUS_KM = 15;
const SITE = String(env("SITE_URL", "https://enamelaudits.vercel.app")).replace(/\/$/, "");
const UA = "EnamelAudits-lead-finder/1.0 (+https://enamelaudits.vercel.app/bot)";

// Interleaved by region so consecutive days don't hit neighbouring states.
const STATES = [
  "KS", "MS", "IA", "AL", "NE", "IN", "OK", "GA", "WI", "TN", "ND", "KY", "MO", "SC", "MN", "AR", "SD", "LA",
  "OH", "NC", "IL", "VA", "MI", "WV", "PA", "NY", "ME", "VT", "NH", "TX", "NM", "CO", "WY", "MT", "ID", "UT",
  "OR", "WA", "NV", "AZ", "CA", "FL", "MD", "DE", "NJ", "CT", "MA", "RI", "AK", "HI",
];
const STATE = String(a.state || STATES[Math.floor(Date.now() / 86_400_000) % STATES.length]).toUpperCase();
if (!STATES.includes(STATE)) {
  console.error(`Unknown state "${STATE}". Use a two-letter code: ${STATES.join(" ")}`);
  process.exit(1);
}

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
const CHAIN_OR_INSTITUTION =
  /aspen dental|heartland dental|western dental|bright now|coast dental|monarch dental|castle dental|kool smiles|affordable dentures|clear ?choice|great expressions|pacific dental|smile brands|dental care alliance|1st family dental|mortenson|perfect teeth|comfort dental|midwest dental|familia dental|dental depot|sonrava|dentalworks|smile direct|community health|health ?center|health system|hospital|university|college|school of|veterans|\bva\b|department of|county health|public health|indian health|tribal|medicaid|mobile dental|correctional/i;
const BAD_DOMAIN = /(^|\.)(facebook|fb|instagram|linkedin|twitter|x|yelp|google|goo|healthgrades|zocdoc|opencare|yellowpages|mapquest|bing|apple|vitals|webmd|wikipedia|linktr|carrd)\.[a-z]+$|\.(gov|edu|mil)$/i;

type El = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

const mask = (e: string) => e.replace(/^(.).*@/, "$1***@");
function km(a1: number, o1: number, a2: number, o2: number) {
  const r = Math.PI / 180;
  const h = Math.sin(((a2 - a1) * r) / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(((o2 - o1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

async function overpass(query: string): Promise<El[]> {
  let last = "";
  for (let attempt = 0; attempt < OVERPASS.length * 2; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(200_000),
      });
      if (res.ok) return ((await res.json()) as { elements: El[] }).elements || [];
      last = `${new URL(url).host} HTTP ${res.status}`;
    } catch (e) {
      last = `${new URL(url).host} ${(e as Error).message}`;
    }
    console.log(`Overpass attempt ${attempt + 1} failed (${last}); retrying...`);
    await sleep(15_000);
  }
  throw new Error(`Overpass API unavailable: ${last}`);
}

async function api(action: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${SITE}/api/outreach/contacts`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env("OUTREACH_TOKEN")}` },
    body: JSON.stringify({ action, ...body }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

// ---------------------------------------------------------------- 1. candidates from OpenStreetMap
const t0 = Date.now();
console.log(`Lead finder · state ${STATE} · target ${TARGET} queued · max ${MAX_SITES} sites${DRY ? " · DRY RUN" : ""}`);

if (!DRY) {
  const stats = await api("stats");
  const backlog = Number(stats.by_status?.queued || 0);
  if (backlog >= BACKLOG_MAX) {
    console.log(`Queue already has ${backlog} clinics waiting (limit ${BACKLOG_MAX}); not adding more today.`);
    process.exit(0);
  }
}

const elements = await overpass(`[out:json][timeout:180];
area["ISO3166-2"="US-${STATE}"]["admin_level"="4"]->.s;
(nwr["amenity"="dentist"](area.s); nwr["healthcare"="dentist"](area.s);)->.d;
(nwr.d["website"]; nwr.d["contact:website"]; nwr.d["url"];);
out center;
node["place"~"^(city|town|village)$"](area.s);
out;`);

const places = elements
  .filter((e) => e.tags?.place && e.lat != null && e.lon != null)
  .map((e) => ({ name: e.tags!.name || "", lat: e.lat!, lon: e.lon!, pop: Number(String(e.tags!.population || "").replace(/[^\d]/g, "")) || 0 }));
const bigCities = places.filter((p) => p.pop >= BIG_CITY_POP);

const dentists = elements
  .filter((e) => !e.tags?.place)
  .map((e) => {
    const t = e.tags || {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    let website = (t.website || t["contact:website"] || t.url || "").split(";")[0].trim();
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
    return { name: t.name || "", website, domain: domainOf(website), lat, lon, city: t["addr:city"] || "" };
  })
  .filter((d) => d.domain && d.lat != null && d.lon != null);

const perDomain = new Map<string, number>();
for (const d of dentists) perDomain.set(d.domain, (perDomain.get(d.domain) || 0) + 1);

const seen = new Set<string>();
const candidates = dentists.filter((d) => {
  if (seen.has(d.domain)) return false;
  seen.add(d.domain);
  if ((perDomain.get(d.domain) || 0) >= 3) return false; // multi-location group
  if (CHAIN_OR_INSTITUTION.test(d.name) || BAD_DOMAIN.test(d.domain)) return false;
  if (bigCities.some((c) => km(d.lat!, d.lon!, c.lat, c.lon) < BIG_CITY_RADIUS_KM)) return false;
  if (!d.city) {
    const near = places.reduce<{ name: string; dist: number } | null>((best, p) => {
      const dist = km(d.lat!, d.lon!, p.lat, p.lon);
      return !best || dist < best.dist ? { name: p.name, dist } : best;
    }, null);
    if (near && near.dist < 20) d.city = near.name;
  }
  return true;
});
console.log(`OpenStreetMap: ${dentists.length} dentists with websites, ${bigCities.length} cities of ${BIG_CITY_POP.toLocaleString()}+; ${candidates.length} small-town independents.`);

// ---------------------------------------------------------------- 2. skip anyone we already know
let fresh = candidates;
if (!DRY) {
  const known = new Set<string>();
  for (let i = 0; i < candidates.length; i += 500) {
    const r = await api("known", { domains: candidates.slice(i, i + 500).map((c) => c.domain) });
    for (const d of r.known || []) known.add(d);
  }
  fresh = candidates.filter((c) => !known.has(c.domain));
  console.log(`${candidates.length - fresh.length} already contacted, screened or suppressed; ${fresh.length} new.`);
}
for (let i = fresh.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
}

// ---------------------------------------------------------------- 3. email -> audit -> queue
let checked = 0;
let noEmail = 0;
let queued = 0;
let screened = 0;
let failed = 0;
let next = 0;
const pending: Record<string, unknown>[] = [];

async function flush() {
  if (DRY || !pending.length) return;
  const rows = pending.splice(0);
  const r = await api("enqueue", { rows });
  if (r.skipped) console.log(`  (${r.skipped} row(s) were already known or suppressed)`);
}

await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < fresh.length && checked < MAX_SITES && queued < TARGET) {
      const c = fresh[next++];
      checked++;
      const email: string = await findEmail(c.website);
      if (!email) {
        noEmail++;
        continue;
      }
      try {
        const result = await runAudit(c.website);
        const issues = rankIssues(result.checks).map((x) => ({ id: x.id, status: x.status, severity: severityOf(x), issue: CHECK_BY_ID[x.id].issue, detail: x.detail }));
        const audit = { score: result.score, grade: result.grade, issueCount: issues.length, issues };
        const q = prospectQuality(audit) as { ok: boolean; reason?: string };
        const base = { email, domain: domainOf(result.meta.finalUrl || c.website) || c.domain, website: c.website, name: c.name, city: c.city ? `${c.city}, ${STATE}` : STATE, source: `osm:${STATE}`, score: result.score, grade: result.grade, issue_count: issues.length };
        if (q.ok) {
          if (queued >= TARGET) continue; // another worker filled today's target; leave this one for a later run
          queued++;
          pending.push({ ...base, status: "queued" });
          console.log(`✓ queue  ${c.domain} (${c.city || "?"}) ${result.score}/100 ${result.grade}, ${issues.length} issues · ${mask(email)}`);
        } else {
          screened++;
          pending.push({ ...base, status: "skipped", reason: q.reason });
          console.log(`- skip   ${c.domain} ${result.score}/100: ${q.reason}`);
        }
        if (pending.length >= 10) await flush();
      } catch (e) {
        failed++;
        console.log(`- error  ${c.domain}: ${(e as Error).message.slice(0, 120)}`);
      }
    }
  }),
);
await flush();

console.log(`\nDone in ${Math.round((Date.now() - t0) / 1000)} s · state ${STATE}: checked ${checked} sites · ${noEmail} without a public email · ${queued} queued · ${screened} screened out · ${failed} errors${DRY ? " (dry run: nothing saved)" : ""}.`);
