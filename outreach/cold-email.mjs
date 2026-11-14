#!/usr/bin/env node
// Personalized cold email to dental practices, each with a REAL audit of their own site.
//
//   node outreach/cold-email.mjs --leads outreach/out/leads-austin-tx.csv            # dry run: writes drafts only
//   node outreach/cold-email.mjs --leads ... --send [--limit 25]                     # sends via SMTP, rate limited
//   node outreach/cold-email.mjs --followups [--send]                                # one follow-up, 4+ days later
//   node outreach/cold-email.mjs --unsubscribe someone@practice.com                  # add to suppression list
//
// Built to stay within CAN-SPAM: honest subject lines, real sender identity, your physical address,
// a clear opt-out honored forever (outreach/state/suppression.txt), and at most 1 follow-up.
// Copy is based on outreach/templates/cold-email.md (manual templates + reply scripts).
// Default daily cap is 25 with a randomized 90–180 s gap, which suits a normal mailbox.
import fs from "node:fs";
import path from "node:path";
import { OUT, STATE, appendCsv, args, auditViaApi, domainOf, env, jitter, loadEnv, readCsv, sleep, suppress, suppressed, today } from "./lib.mjs";

loadEnv();
const a = args();
const SENT_LOG = path.join(STATE, "sent.csv");
const SENT_COLS = ["date", "step", "email", "domain", "name", "score", "grade", "report_url", "subject"];

if (a.unsubscribe) {
  suppress(String(a.unsubscribe));
  console.log(`Suppressed ${a.unsubscribe}. They will never be emailed again.`);
  process.exit(0);
}

const SEND = !!a.send;
const LIMIT = Number(a.limit || 25);
const FROM_NAME = env("SENDER_NAME", "The Enamel Audits team");
const ADDRESS = env("SENDER_ADDRESS", "136 Sukhumvit St, Pattaya, Chonburi 20150 Thailand");
const CAMPAIGN = String(a.campaign || today());

function firstName(lead) {
  return (lead.first_name || "").trim() || "there";
}

/** Only repeat the detail line when it says something the issue title doesn't. */
function addsInfo(issue) {
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const d = norm(issue.detail);
  const words = norm(issue.issue).split(" ").filter((w) => w.length > 3);
  const overlap = words.filter((w) => d.includes(w)).length;
  return words.length === 0 || overlap / words.length < 0.7;
}

/**
 * Issue-specific openers (see outreach/templates/cold-email.md, section 2).
 * When the practice's top issue matches, lead with the patient impact instead of the score.
 */
const HOOKS = {
  noindex: {
    subject: (p, d) => `${d} may be hidden from Google`,
    open: (d) => `I ran a quick check on ${d} and it's telling Google not to list it (a "noindex" setting, often left on by accident after a redesign). If that's not intentional, your site may be missing from search results entirely. It's a one-setting fix.`,
  },
  robots_txt: {
    subject: (p, d) => `${d} may be blocked from Google`,
    open: (d) => `I ran a quick check on ${d} and its robots.txt file blocks search engines from the whole site. If that's not intentional, you may be missing from Google results. It's a one-line fix.`,
  },
  https: {
    subject: (p, d) => `${d} shows "Not secure"`,
    open: (d) => `Heads up: ${d} shows a "Not secure" warning in the browser, right next to your practice name. For a healthcare practice that warning alone can make a new patient leave. The fix is usually a free certificate and one redirect.`,
  },
  ssl_certificate: {
    subject: (p, d) => `${d}: certificate problem`,
    open: (d) => `Heads up: our check found a problem with the security certificate on ${d}. When a certificate is invalid or expires, browsers show a full-page warning instead of your site.`,
  },
  tel_link: {
    subject: (p) => `${p}: patients can't tap your number`,
    open: (d) => `I was looking at ${d} the way a patient would on a phone and noticed your phone number isn't tappable. Mobile visitors have to copy it by hand, which is exactly when people give up and call the next practice. It's a two-minute fix.`,
  },
  online_booking: {
    subject: (p, d) => `Booking from ${d} after hours`,
    open: (d) => `I tried to book a visit on ${d} the way a new patient would at 9pm, and couldn't find a way to book or request an appointment online. A lot of people search for a dentist after hours, so that's usually worth fixing first.`,
  },
  server_response: {
    subject: (p, d) => `${d} loads slowly on phones`,
    open: (d, top) => `${d} was slow to start loading in our check (${top.detail.replace(/\.$/, "")}). On a phone with mobile data that usually means a few seconds of blank screen, which is when people tap back to the search results.`,
  },
  viewport: {
    subject: (p, d) => `${d} on phones`,
    open: (d) => `I opened ${d} on a phone and it isn't set up for mobile screens, so patients see a shrunken desktop page they have to pinch and zoom. Most patients find a dentist on their phone, and Google ranks mobile-unfriendly sites lower.`,
  },
};

function initialEmail(lead, audit) {
  const top = audit.topIssues[0];
  const second = audit.topIssues[1];
  const practice = lead.name || audit.domain;
  const hook = top && HOOKS[top.id];
  const subject = hook ? hook.subject(practice, audit.domain) : `${practice}: your website scored ${audit.score}/100`;
  const opening = hook
    ? [hook.open(audit.domain, top), ``, `Overall it scored ${audit.score}/100 (grade ${audit.grade}).${second ? ` It also flagged: "${second.issue}."` : ""}`]
    : [
        `I ran ${audit.domain} through our dental website checker and it scored ${audit.score}/100 (grade ${audit.grade}).`,
        ``,
        top ? `The biggest thing it flagged: "${top.issue}."${addsInfo(top) ? ` ${top.detail}` : ""}` : `It found a few things worth tightening up.`,
        second ? `It also noticed: "${second.issue}."` : ``,
      ];
  const lines = [
    `Hi ${firstName(lead)},`,
    ``,
    ...opening,
    ``,
    `Your free summary is here (no login or signup): ${audit.reportUrl}`,
    ``,
    `Most of these are quick fixes for whoever manages your site. If you'd like the complete fix list (${audit.issueCount} items, step by step), it's $97 on that page, refunded if it doesn't find at least 3 real improvements.`,
    ``,
    `Either way, I hope the summary is useful.`,
    ``,
    `${FROM_NAME}`,
    `Enamel Audits · ${ADDRESS}`,
    ``,
    `You're receiving this because ${audit.domain} is a public dental practice website. Not interested? Reply "no thanks" and you won't hear from me again.`,
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));
  return { subject, text: lines.join("\n") };
}

function followupEmail(row) {
  return {
    subject: `Re: ${row.subject}`,
    text: [
      `Hi again,`,
      ``,
      `Quick follow-up on the website check for ${row.domain} (${row.score}/100). The summary is still here: ${row.report_url}`,
      ``,
      `If now isn't the time, no problem. This is the last email I'll send about it.`,
      ``,
      `${FROM_NAME}`,
      `Enamel Audits · ${ADDRESS}`,
      ``,
      `Reply "no thanks" to opt out.`,
    ].join("\n"),
  };
}

async function transport() {
  const nodemailer = (await import("nodemailer")).default;
  return nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port: Number(env("SMTP_PORT", "465")),
    secure: Number(env("SMTP_PORT", "465")) === 465,
    auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") },
  });
}

async function deliver(t, to, msg) {
  await t.sendMail({ from: `${FROM_NAME} <${env("SMTP_FROM", process.env.SMTP_USER)}>`, to, subject: msg.subject, text: msg.text, replyTo: env("REPLY_TO", process.env.SMTP_USER) });
}

const sentRows = readCsv(SENT_LOG);
const blocked = suppressed();
const contacted = new Set(sentRows.map((r) => r.email.toLowerCase()));
const contactedDomains = new Set(sentRows.map((r) => r.domain));
const draftsFile = path.join(OUT, `drafts-${today()}.md`);
const t = SEND ? await transport() : null;
let count = 0;

if (a.followups) {
  const replied = blocked;
  const firstTouches = sentRows.filter((r) => r.step === "1");
  const followed = new Set(sentRows.filter((r) => r.step === "2").map((r) => r.email));
  for (const row of firstTouches) {
    if (count >= LIMIT) break;
    const ageDays = (Date.now() - new Date(row.date).getTime()) / 86_400_000;
    if (ageDays < 4 || followed.has(row.email) || replied.has(row.email.toLowerCase()) || replied.has(row.domain)) continue;
    const msg = followupEmail(row);
    fs.appendFileSync(draftsFile, `\n---\nTO: ${row.email}\nSUBJECT: ${msg.subject}\n\n${msg.text}\n`);
    if (SEND) {
      await deliver(t, row.email, msg);
      appendCsv(SENT_LOG, { ...row, date: new Date().toISOString(), step: "2", subject: msg.subject }, SENT_COLS);
      console.log(`follow-up sent -> ${row.email}`);
      await sleep(jitter(90_000, 180_000));
    } else console.log(`follow-up drafted -> ${row.email}`);
    count++;
  }
  console.log(`\n${count} follow-up(s) ${SEND ? "sent" : "drafted"}. Drafts: ${draftsFile}`);
  process.exit(0);
}

if (!a.leads) {
  console.error("Usage: node outreach/cold-email.mjs --leads <file.csv> [--send] [--limit 25]");
  process.exit(1);
}
const leads = readCsv(path.resolve(String(a.leads)));
console.log(`${leads.length} leads loaded. Mode: ${SEND ? "SEND" : "DRY RUN (drafts only)"}; limit ${LIMIT}.`);

for (const lead of leads) {
  if (count >= LIMIT) break;
  const email = (lead.email || "").toLowerCase();
  const domain = lead.domain || domainOf(lead.website);
  if (!email || !lead.website) continue;
  if (blocked.has(email) || blocked.has(domain) || contacted.has(email) || contactedDomains.has(domain)) continue;
  let audit;
  try {
    audit = await auditViaApi(lead.website, lead.name, CAMPAIGN);
  } catch (e) {
    console.log(`skip ${domain}: ${e.message}`);
    continue;
  }
  // Only email practices with something genuinely worth fixing.
  if (audit.score >= 90 || audit.issueCount < 3) {
    console.log(`skip ${domain}: score ${audit.score}, ${audit.issueCount} issues (not worth emailing)`);
    continue;
  }
  const msg = initialEmail(lead, audit);
  fs.appendFileSync(draftsFile, `\n---\nTO: ${email}\nSUBJECT: ${msg.subject}\n\n${msg.text}\n`);
  if (SEND) {
    try {
      await deliver(t, email, msg);
    } catch (e) {
      console.log(`send failed for ${email}: ${e.message}`);
      continue;
    }
    appendCsv(SENT_LOG, { date: new Date().toISOString(), step: "1", email, domain, name: lead.name, score: audit.score, grade: audit.grade, report_url: audit.reportUrl, subject: msg.subject }, SENT_COLS);
    contacted.add(email);
    contactedDomains.add(domain);
    console.log(`sent -> ${email} (${domain} ${audit.score}/100)`);
    await sleep(jitter(90_000, 180_000));
  } else {
    console.log(`drafted -> ${email} (${domain} ${audit.score}/100) ${audit.reportUrl}`);
  }
  count++;
}
console.log(`\n${count} email(s) ${SEND ? "sent" : "drafted"}. Review drafts: ${draftsFile}`);
if (!SEND) console.log("Happy with them? Re-run with --send. Mark opt-outs with --unsubscribe <email>.");
