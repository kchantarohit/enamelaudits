#!/usr/bin/env node
// Daily cold outreach through Gmail. Every email links to a REAL audit of the clinic's own site.
//
//   node outreach/gmail-outreach.mjs --verify                 # check Gmail login + API access; sends nothing
//   node outreach/gmail-outreach.mjs --enqueue leads.csv      # add leads to the Supabase queue (dupes skipped)
//   node outreach/gmail-outreach.mjs                          # dry run: audit the next leads and preview emails
//   node outreach/gmail-outreach.mjs --test-to you@gmail.com --site https://some-dental-site.com   # one sample to yourself
//   node outreach/gmail-outreach.mjs --send [--limit 15]      # send today's batch
//   node outreach/gmail-outreach.mjs --suppress x@clinic.com  # never contact this email or domain
//   node outreach/gmail-outreach.mjs --stats                  # queue status
//
// Safety: max 20 emails per rolling 24 h (enforced in the database, across all runs);
// each clinic (email AND domain) can be emailed only once; suppressed addresses are skipped;
// every email has your address, a one-click unsubscribe link and a List-Unsubscribe header.
//
// Gmail login, pick one:
//   GMAIL_USER + GMAIL_APP_PASSWORD  (Google Account > Security > 2-Step Verification > App passwords)
//   GMAIL_USER + GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET + GMAIL_REFRESH_TOKEN  (Gmail API OAuth2)
import fs from "node:fs";
import path from "node:path";
import { OUT, args, auditViaApi, domainOf, env, jitter, loadEnv, readCsv, sleep, today } from "./lib.mjs";
import { renderEmail } from "./email-template.mjs";

loadEnv();
const a = args();
const LIMIT = Math.min(20, Math.max(1, Number(a.limit || process.env.OUTREACH_DAILY_LIMIT || 15)));
const DAILY_CAP = 20;
const MIN_ISSUES = 3;
const MAX_SCORE = 89;
const sender = {
  name: process.env.SENDER_NAME || "The Enamel Audits team",
  address: process.env.SENDER_ADDRESS || "136 Sukhumvit St, Pattaya, Chonburi 20150 Thailand",
};

/** Logs are public on public GitHub repos: never print full email addresses. */
const mask = (email) => {
  const [local, dom] = String(email).split("@");
  return `${local.slice(0, 1)}***@${dom || "?"}`;
};

async function api(action, body = {}) {
  const base = env("SITE_URL", "https://enamelaudits.vercel.app").replace(/\/$/, "");
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${base}/api/outreach/contacts`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env("OUTREACH_TOKEN")}` },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) throw Object.assign(new Error("OUTREACH_TOKEN was rejected by the site"), { fatal: true });
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } catch (e) {
      if (e.fatal || attempt >= 3) throw e;
      await sleep(2000 * attempt);
    }
  }
}

async function gmail() {
  const nodemailer = (await import("nodemailer")).default;
  const user = env("GMAIL_USER");
  if (process.env.GMAIL_SMTP_HOST) {
    // Testing only: point at a local SMTP sink instead of Gmail.
    const port = Number(process.env.GMAIL_SMTP_PORT || 2525);
    return nodemailer.createTransport({ host: process.env.GMAIL_SMTP_HOST, port, secure: port === 465, ignoreTLS: true, auth: { user, pass: process.env.GMAIL_APP_PASSWORD || "x" } });
  }
  if (process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, "") },
    });
  }
  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      },
    });
  }
  console.error("Set GMAIL_APP_PASSWORD (or GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET + GMAIL_REFRESH_TOKEN) with GMAIL_USER.");
  process.exit(1);
}

async function sendOne(transport, to, msg, contact) {
  const user = env("GMAIL_USER");
  const headers = contact?.unsubscribeApiUrl
    ? { "List-Unsubscribe": `<${contact.unsubscribeApiUrl}>, <mailto:${user}?subject=unsubscribe>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : { "List-Unsubscribe": `<mailto:${user}?subject=unsubscribe>` };
  const info = await transport.sendMail({
    from: { name: sender.name, address: user },
    to,
    replyTo: process.env.REPLY_TO || user,
    subject: msg.subject,
    text: msg.text,
    headers,
  });
  return info.messageId;
}

// ---------------------------------------------------------------- commands
if (a.stats) {
  console.log(JSON.stringify(await api("stats"), null, 2));
  process.exit(0);
}

if (a.suppress) {
  await api("suppress", { value: String(a.suppress), reason: String(a.reason || "manual") });
  console.log(`Suppressed ${a.suppress}. It will never be emailed.`);
  process.exit(0);
}

if (a.enqueue) {
  const rows = readCsv(path.resolve(String(a.enqueue)))
    .filter((r) => r.email && (r.website || r.domain))
    .map((r) => ({ email: r.email, website: r.website, domain: r.domain || domainOf(r.website), name: r.name, first_name: r.first_name, city: r.city, source: r.source || path.basename(String(a.enqueue)) }));
  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const r = await api("enqueue", { rows: rows.slice(i, i + 500) });
    inserted += r.inserted;
    skipped += r.skipped;
  }
  console.log(`Queued ${inserted} new clinic(s); skipped ${skipped} (already queued/contacted, suppressed, or invalid).`);
  process.exit(0);
}

if (a.verify) {
  const stats = await api("stats");
  console.log(`✓ Site API reachable; queue: ${JSON.stringify(stats.by_status)}; sent in last 24h: ${stats.sent_24h}`);
  const t = await gmail();
  await t.verify();
  console.log(`✓ Gmail login OK for ${mask(env("GMAIL_USER"))}`);
  process.exit(0);
}

if (a["test-to"]) {
  if (!a.site) {
    console.error("Usage: --test-to you@example.com --site https://some-dental-site.com");
    process.exit(1);
  }
  const audit = await auditViaApi(String(a.site), "", "test");
  const msg = renderEmail({ lead: { first_name: "", name: "" }, audit, sender });
  const id = await sendOne(await gmail(), String(a["test-to"]), { ...msg, subject: `[TEST] ${msg.subject}` });
  console.log(`✓ Test email sent to ${mask(a["test-to"])} (${audit.domain}: ${audit.score}/100, ${audit.issueCount} issues). Message-ID ${id}`);
  process.exit(0);
}

const SEND = !!a.send;
console.log(`Mode: ${SEND ? "SEND" : "DRY RUN (no emails, no queue changes)"} · limit ${LIMIT} · cap ${DAILY_CAP}/24h`);

const transport = SEND ? await gmail() : null;
if (transport) await transport.verify();

const batch = SEND ? await api("next", { limit: LIMIT, dailyCap: DAILY_CAP }) : { contacts: (await api("peek", { limit: LIMIT })).contacts };
if (SEND) console.log(`Sent in last 24h before this run: ${batch.sent_24h}. Claimed ${batch.contacts.length} clinic(s).`);
if (!batch.contacts.length) {
  console.log(SEND ? "Nothing to send (queue empty or daily cap reached)." : "Queue is empty. Add leads with --enqueue leads.csv");
  process.exit(0);
}

const previewFile = path.join(OUT, `gmail-preview-${today()}.md`);
let sent = 0;
let skipped = 0;
let failed = 0;

for (let i = 0; i < batch.contacts.length; i++) {
  const c = batch.contacts[i];
  let audit;
  try {
    audit = await auditViaApi(c.website, c.name || "", "gmail");
  } catch (e) {
    console.log(`- ${c.domain}: audit failed (${e.message}); skipping`);
    if (SEND) await api("result", { id: c.id, status: "skipped", data: { error: `audit failed: ${e.message}` } });
    skipped++;
    continue;
  }
  const auditData = { audit_id: audit.id, score: audit.score, grade: audit.grade, issue_count: audit.issueCount, report_url: audit.reportUrl };
  if (audit.score > MAX_SCORE || audit.issueCount < MIN_ISSUES) {
    console.log(`- ${c.domain}: ${audit.score}/100 with ${audit.issueCount} issue(s), not worth emailing; skipping`);
    if (SEND) await api("result", { id: c.id, status: "skipped", data: { ...auditData, error: "score too high / too few issues" } });
    skipped++;
    continue;
  }
  const msg = renderEmail({ lead: c, audit, sender, unsubscribeUrl: c.unsubscribeUrl });

  if (!SEND) {
    if (!process.env.CI) fs.appendFileSync(previewFile, `\n---\nTO: ${c.email}\nSUBJECT: ${msg.subject}\n\n${msg.text}\n`);
    console.log(`- would email ${mask(c.email)} · ${c.domain} ${audit.score}/100 (${audit.grade}), ${audit.issueCount} fixes · "${msg.subject}"`);
    continue;
  }

  try {
    const messageId = await sendOne(transport, c.email, msg, c);
    await api("result", { id: c.id, status: "sent", data: { ...auditData, message_id: messageId } });
    sent++;
    console.log(`✓ sent ${mask(c.email)} · ${c.domain} ${audit.score}/100 (${audit.grade}), ${audit.issueCount} fixes`);
  } catch (e) {
    failed++;
    const authProblem = e.code === "EAUTH" || /auth|credentials|login/i.test(e.message || "");
    console.log(`✗ ${c.domain}: ${e.message}`);
    await api("result", { id: c.id, status: "failed", data: { error: String(e.message).slice(0, 300) } }).catch(() => {});
    if (authProblem) {
      // Release the clinics we claimed but never attempted, so a later run picks them up.
      for (const rest of batch.contacts.slice(i + 1)) {
        await api("result", { id: rest.id, status: "failed", data: { error: "run stopped before sending (Gmail login problem)" } }).catch(() => {});
      }
      console.log("Stopping: Gmail rejected the login. Fix the credentials, then re-run.");
      break;
    }
  }
  if (i < batch.contacts.length - 1) await sleep(jitter(Number(a["delay-min"] || 60) * 1000, Number(a["delay-max"] || 150) * 1000));
}

console.log(`\nDone. sent=${sent} skipped=${skipped} failed=${failed}`);
if (!SEND && !process.env.CI) console.log(`Full previews (local only): ${previewFile}\nLooks good? Run again with --send.`);
