// POST /api/snapshot  {name, practice, url, email}  -> free score + top 3 issues (shown instantly + emailed)
import { runAudit, toSnapshot } from '../lib/audit.js';
import { json, readJson, clientIp, isEmail, rateLimited } from '../lib/http.js';
import { sendEmail, notifyOwner } from '../lib/email.js';
import { renderSnapshotEmail } from '../lib/render.js';
import { siteUrlFrom } from '../lib/config.js';

export async function POST(request) {
  let body;
  try { body = await readJson(request); } catch (e) { return json({ error: e.message }, 400); }
  if (body.hp) return json({ error: 'Rejected' }, 400); // honeypot field filled = bot
  const { name = '', practice = '', url = '', email = '' } = body;
  if (!url) return json({ error: 'Please enter your website address.' }, 400);
  if (email && !isEmail(email)) return json({ error: 'Please enter a valid email address.' }, 400);
  if (rateLimited(`snap:${clientIp(request)}`, 6, 3600_000)) return json({ error: 'Too many checks from your network. Please try again in an hour.' }, 429);

  let snapshot;
  try {
    snapshot = toSnapshot(await runAudit(url, { budgetMs: 20000 }));
  } catch (e) {
    return json({ error: e.code ? e.message : 'Sorry, we could not check that website. Please check the address and try again.' }, 422);
  }
  const site = siteUrlFrom(request);
  const buyUrl = `${site}/api/checkout?${new URLSearchParams({ plan: 'report', url: snapshot.url, ...(email ? { email } : {}) })}`;
  const emailed = email ? await sendEmail({
    to: email,
    subject: `Your website scored ${snapshot.score}/100 (Grade ${snapshot.grade})`,
    html: renderSnapshotEmail(snapshot, { name: String(name).slice(0, 80), buyUrl }),
    text: `Your free snapshot for ${snapshot.host}: ${snapshot.score}/100 (Grade ${snapshot.grade}).\n\n${snapshot.topIssues.map((i, n) => `${n + 1}. ${i.title}`).join('\n')}\n\nFull report with every fix: ${buyUrl}`,
  }).then(r => !r.skipped).catch(err => { console.error('[snapshot] email failed', err.message); return false; }) : false;
  await notifyOwner(`New lead: ${snapshot.host} (${snapshot.score})`, `Name: ${name}\nPractice: ${practice}\nEmail: ${email}\nSite: ${snapshot.url}\nScore: ${snapshot.score} (${snapshot.grade})\nIssues: ${snapshot.totalIssues}`);
  return json({ ...snapshot, buyUrl, emailed });
}
