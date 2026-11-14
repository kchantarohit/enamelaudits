#!/usr/bin/env node
// Post the next queued tip to X (Twitter) from your own account, via the official API v2.
//
//   node outreach/x-post.mjs            # posts the next unposted item in content/x-posts.json
//   node outreach/x-post.mjs --dry-run  # prints what would be posted
//   node outreach/x-post.mjs --by-date  # stateless daily rotation (used by the GitHub Action)
//   node outreach/x-post.mjs --stats    # posts a stats update built from REAL audit data (skips if too few audits)
//
// Needs an X developer app with Read+Write and user tokens:
// X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET. Schedule it daily (see .github/workflows/social.yml).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, STATE, args, env, loadEnv, statsViaApi } from "./lib.mjs";

loadEnv();
const a = args();
const DRY = !!a["dry-run"];
const queueFile = path.join(ROOT, "content", "x-posts.json");
const stateFile = path.join(STATE, "x-state.json");
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : { posted: [] };

const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

function oauthHeader(method, url) {
  const oauth = {
    oauth_consumer_key: env("X_API_KEY"),
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: env("X_ACCESS_TOKEN"),
    oauth_version: "1.0",
  };
  const paramStr = Object.keys(oauth).sort().map((k) => `${pct(k)}=${pct(oauth[k])}`).join("&");
  const base = [method.toUpperCase(), pct(url), pct(paramStr)].join("&");
  const signingKey = `${pct(env("X_API_SECRET"))}&${pct(env("X_ACCESS_SECRET"))}`;
  oauth.oauth_signature = crypto.createHmac("sha1", signingKey).update(base).digest("base64");
  return "OAuth " + Object.keys(oauth).sort().map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(", ");
}

async function tweet(text, replyTo) {
  const url = "https://api.twitter.com/2/tweets";
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: oauthHeader("POST", url), "content-type": "application/json" },
    body: JSON.stringify({ text, ...(replyTo ? { reply: { in_reply_to_tweet_id: replyTo } } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`X API ${res.status}: ${JSON.stringify(data)}`);
  return data.data.id;
}

async function statsPost() {
  const s = await statsViaApi(30);
  if (!s.audits || s.audits < 25) {
    console.log(`Only ${s.audits || 0} audits in the last 30 days; need 25+ before posting stats. Skipping.`);
    return null;
  }
  const rates = s.fail_rates || {};
  const pick = [
    ["tel_link", "had a phone number patients can't tap to call"],
    ["sitemap", "had no XML sitemap for Google"],
    ["local_schema", "had no Dentist structured data"],
    ["meta_description", "had no meta description"],
    ["online_booking", "had no visible way to book online"],
    ["privacy_policy", "had no privacy policy link"],
  ].filter(([id]) => rates[id] != null).sort((x, y) => rates[y[0]] - rates[x[0]]).slice(0, 3);
  if (!pick.length) return null;
  return {
    text: `We checked ${s.distinct_domains} dental practice websites in the last 30 days. Average score: ${s.avg_score}/100.\n\n${pick
      .map(([id, label]) => `• ${rates[id]}% ${label}`)
      .join("\n")}\n\nCheck yours free in 30 seconds: https://enamelaudits.vercel.app/?ref=x`,
  };
}

let item;
if (a.stats) item = await statsPost();
else {
  const queue = JSON.parse(fs.readFileSync(queueFile, "utf8"));
  // --by-date: stateless rotation (one post per day), handy for CI schedulers.
  item = a["by-date"] ? queue[Math.floor(Date.now() / 86_400_000) % queue.length] : queue.find((q) => !state.posted.includes(q.id));
  if (!item) {
    console.log("Queue exhausted. Add more posts to outreach/content/x-posts.json.");
    process.exit(0);
  }
}
if (!item) process.exit(0);

const parts = [item.text, ...(item.thread || [])];
if (DRY) {
  parts.forEach((p, i) => console.log(`--- ${i === 0 ? "post" : "reply " + i} (${p.length} chars)\n${p}\n`));
  process.exit(0);
}
let prev;
for (const p of parts) prev = await tweet(p, prev);
if (item.id) {
  state.posted.push(item.id);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}
console.log(`Posted ${item.id || "stats"}: https://x.com/i/web/status/${prev}`);
