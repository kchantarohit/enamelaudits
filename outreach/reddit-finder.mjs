#!/usr/bin/env node
// Find recent Reddit threads where dental practice owners/managers ask about their website,
// and draft a genuinely helpful reply for YOU to review and post by hand.
//
//   node outreach/reddit-finder.mjs [--days 7] [--out outreach/out/reddit-YYYY-MM-DD.md]
//
// It deliberately does NOT auto-post: automated promotional comments get accounts banned and
// break most subreddits' rules. Answer the question first; mention the free checker only where
// the subreddit allows it and it actually helps.
// Optional: REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET (a "script" app) for higher rate limits.
import fs from "node:fs";
import path from "node:path";
import { OUT, args, loadEnv, sleep, today } from "./lib.mjs";

loadEnv();
const a = args();
const days = Number(a.days || 7);
const outFile = a.out ? String(a.out) : path.join(OUT, `reddit-${today()}.md`);
const UA = "script:enamel-audits-finder:v1.0 (research tool)";

const SUBREDDITS = ["Dentistry", "dentists", "DentalHygiene", "smallbusiness", "Entrepreneur", "SEO", "localseo", "webdev", "web_design", "marketing", "PracticeManagement"];
const QUERIES = [
  '"dental website"', '"dentist website"', '"dental practice" website', '"dental office" website', '"practice website"',
  '"dental marketing"', '"dentist" "google business"', '"dental seo"', '"new patients" website', '"dental" "online booking"',
];

// Keyword -> which guide to point to, so replies teach something specific.
const TOPICS = [
  { re: /slow|speed|load(ing)? time|pagespeed/i, guide: "server-response", tip: "Check it on your phone over mobile data. If the screen stays blank for 2+ seconds, page caching and a CDN usually fix most of it." },
  { re: /seo|rank|google|found online|show up/i, guide: "local-schema", tip: "For local search the basics matter most: a unique page title with your town, a meta description, a sitemap submitted in Search Console, and Dentist schema that matches your Google Business Profile exactly." },
  { re: /book|appointment|schedul/i, guide: "online-booking", tip: "Put a 'Book appointment' button in the mobile header, linked to your scheduler. If you don't have online scheduling, a short request form you answer first thing in the morning works too." },
  { re: /call|phone/i, guide: "tel-link", tip: "Make every phone number a tap-to-call link (href=\"tel:+1...\") and add a call button to the mobile header." },
  { re: /ada|accessib/i, guide: "img-alt", tip: "Start with the basics: alt text on images, labels on every form field, and don't block pinch-to-zoom. (Not legal advice; for compliance questions talk to a professional.)" },
  { re: /secure|ssl|https|hack/i, guide: "https", tip: "Make sure the site forces HTTPS, the certificate auto-renews, and WordPress/plugins are kept updated." },
  { re: /redesign|new website|agency|vendor|web design/i, guide: "broken-links", tip: "Before paying for a redesign, get a list of what's actually wrong; a lot of 'we need a new site' turns out to be a handful of fixable issues." },
];

let token = null;
const blocked = [];
async function auth() {
  if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) return null;
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      authorization: "Basic " + Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64"),
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": UA,
    },
    body: "grant_type=client_credentials",
  });
  return res.ok ? (await res.json()).access_token : null;
}

async function search(sub, q) {
  const host = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const url = `${host}/r/${sub}/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new&t=${days <= 7 ? "week" : "month"}&limit=50`;
  const res = await fetch(url, { headers: { "user-agent": UA, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) {
    blocked.push(res.status);
    return [];
  }
  const data = await res.json().catch(() => null);
  return data?.data?.children?.map((c) => c.data) || [];
}

token = await auth();
const cutoff = Date.now() / 1000 - days * 86400;
const seen = new Map();
// One combined OR query per subreddit keeps us well inside Reddit's rate limits.
const combined = QUERIES.join(" OR ");
for (const sub of SUBREDDITS) {
  for (const p of await search(sub, combined)) {
    if (p.created_utc < cutoff || seen.has(p.id) || p.locked || p.archived) continue;
    seen.set(p.id, p);
  }
  await sleep(token ? 700 : 2500);
}

if (blocked.length) {
  console.warn(
    `\nReddit refused ${blocked.length}/${SUBREDDITS.length} searches (HTTP ${[...new Set(blocked)].join(", ")}). ` +
      (token
        ? "Check your Reddit app credentials."
        : "Reddit blocks anonymous requests from cloud servers (incl. GitHub Actions). Run this from your own computer, or set REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET (free 'script' app at reddit.com/prefs/apps)."),
  );
}

const threads = [...seen.values()].sort((x, y) => y.num_comments - x.num_comments || y.created_utc - x.created_utc);
const lines = [`# Reddit threads to answer (${today()}, last ${days} days)`, ``, `${threads.length} threads. Reply by hand, lead with the answer, and follow each subreddit's self-promotion rules.`, ``];
for (const p of threads) {
  const text = `${p.title}\n${p.selftext || ""}`;
  const topic = TOPICS.find((t) => t.re.test(text)) || TOPICS[1];
  lines.push(
    `## r/${p.subreddit}: ${p.title}`,
    `https://www.reddit.com${p.permalink}  ·  ${p.num_comments} comments  ·  ${new Date(p.created_utc * 1000).toISOString().slice(0, 10)}`,
    ``,
    `> ${(p.selftext || "").replace(/\s+/g, " ").slice(0, 400)}${(p.selftext || "").length > 400 ? "…" : ""}`,
    ``,
    `**Draft reply (edit before posting):**`,
    ``,
    `${topic.tip}`,
    ``,
    `There's a plain-English write-up of how to check and fix this here: https://enamelaudits.vercel.app/guides/${topic.guide}?ref=reddit`,
    `_(If the subreddit doesn't allow links, drop the link line and just answer.)_`,
    ``,
  );
}
fs.writeFileSync(outFile, lines.join("\n"));
console.log(`${threads.length} threads -> ${outFile}`);
