// Automated fulfillment. Stripe metadata is the only "database":
//  - PaymentIntent.metadata (one-time reports): url, email, fulfill_state, score, founding, recheck_pending, recheck_due
//  - Subscription.metadata (monitoring): url, email, last_run, last_score
import { config } from './config.js';
import { stripe, stripeAll } from './stripe.js';
import { runAudit } from './audit.js';
import { sendEmail, notifyOwner } from './email.js';
import { renderReportEmail, reportText } from './render.js';

const DAY = 86400000;
const STALE_LOCK_MS = 10 * 60 * 1000;

export function reportUrlFor(siteUrl, sessionId) {
  return `${siteUrl}/report.html?session_id=${encodeURIComponent(sessionId)}`;
}

export function monitorCheckoutUrl(siteUrl, url, email) {
  const q = new URLSearchParams({ plan: 'monthly', url });
  if (email) q.set('email', email);
  return `${siteUrl}/api/checkout?${q}`;
}

export function isSessionPaid(session) {
  return session.status === 'complete' && ['paid', 'no_payment_required'].includes(session.payment_status);
}

async function countFounding() {
  let n = 0;
  try {
    for await (const _ of stripeAll('/payment_intents/search', { query: "metadata['founding']:'1'" })) { n++; if (n >= config.foundingSpots) break; }
  } catch (e) { console.warn('[fulfill] founding count failed', e.message); return Infinity; }
  return n;
}

async function runAuditForCustomer(url) {
  return runAudit(url, { pagespeedKey: config.pagespeedKey, budgetMs: 25000 });
}

/**
 * Fulfill a completed Checkout Session exactly once (safe under Stripe webhook retries).
 * @returns {Promise<{status:string, score?:number}>}
 */
export async function fulfillCheckoutSession(session, siteUrl) {
  if (!isSessionPaid(session)) return { status: 'not_paid' };
  const md = session.metadata || {};
  // Sessions from /api/checkout carry metadata.url; legacy Stripe Payment Links can collect it via a custom field.
  const url = md.url || session.custom_fields?.find(f => /web|url|site|domain/i.test(f.key || ''))?.text?.value;
  const email = session.customer_details?.email || session.customer_email || md.email;
  if (!url) return { status: 'no_url' };
  const reportUrl = reportUrlFor(siteUrl, session.id);

  if (session.mode === 'payment') {
    const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!piId) return { status: 'no_payment_intent' };
    const pi = await stripe('GET', `/payment_intents/${piId}`);
    const state = pi.metadata?.fulfill_state || '';
    if (state === 'done') return { status: 'already_fulfilled' };
    if (state.startsWith('started:') && Date.now() - Number(state.slice(8)) < STALE_LOCK_MS) return { status: 'in_progress' };
    await stripe('POST', `/payment_intents/${piId}`, { metadata: { fulfill_state: `started:${Date.now()}`, url, email: email || '' } });

    const report = await runAuditForCustomer(url);
    const founding = (await countFounding()) < config.foundingSpots;
    await sendEmail({
      to: email,
      subject: `Your Website Health Report: ${report.score}/100 for ${report.host}`,
      html: renderReportEmail(report, {
        reportUrl, foundingBonus: founding, monitorUrl: monitorCheckoutUrl(siteUrl, url, email),
        intro: 'Thanks for your order! Your full website health report is below. It is also saved online at the link, where you can print it or save it as a PDF.',
      }),
      text: reportText(report, { reportUrl }),
    });
    await stripe('POST', `/payment_intents/${piId}`, {
      metadata: {
        fulfill_state: 'done', score: String(report.score),
        ...(founding ? { founding: '1', recheck_pending: '1', recheck_due: String(Date.now() + config.foundingRecheckDays * DAY) } : {}),
      },
    });
    await notifyOwner(`New sale: report for ${report.host}`, `Customer: ${email}\nSite: ${url}\nScore: ${report.score} (${report.grade})\nFounding bonus: ${founding ? 'yes' : 'no'}\nReport: ${reportUrl}`);
    return { status: 'fulfilled', score: report.score };
  }

  if (session.mode === 'subscription') {
    const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (!subId) return { status: 'no_subscription' };
    const sub = await stripe('GET', `/subscriptions/${subId}`);
    const m = sub.metadata || {};
    if (m.last_run && !m.last_run.startsWith('started:')) return { status: 'already_fulfilled' };
    if (m.last_run?.startsWith('started:') && Date.now() - Number(m.last_run.slice(8)) < STALE_LOCK_MS) return { status: 'in_progress' };
    await stripe('POST', `/subscriptions/${subId}`, { metadata: { last_run: `started:${Date.now()}`, url, email: email || '', report_session: session.id } });
    const report = await runAuditForCustomer(url);
    await sendEmail({
      to: email,
      subject: `Monitoring started: ${report.host} scores ${report.score}/100`,
      html: renderReportEmail(report, {
        reportUrl, isMonitoring: true,
        intro: `Welcome to monthly monitoring! Here is your first full report. We'll re-check ${report.host} automatically every ${config.monitorIntervalDays} days and email you a fresh report with your score change.`,
      }),
      text: reportText(report, { reportUrl }),
    });
    await stripe('POST', `/subscriptions/${subId}`, { metadata: { last_run: String(Date.now()), last_score: String(report.score) } });
    await notifyOwner(`New subscriber: ${report.host}`, `Customer: ${email}\nSite: ${url}\nPlan: ${md.plan}\nScore: ${report.score}`);
    return { status: 'fulfilled', score: report.score };
  }
  return { status: 'unsupported_mode' };
}

/** Daily cron: monthly re-checks for subscribers + one-off founding-bonus re-checks. */
export async function runMonitoringSweep(siteUrl, { budgetMs = 50000, concurrency = 3 } = {}) {
  const started = Date.now();
  const jobs = [];
  const now = Date.now();

  for await (const sub of stripeAll('/subscriptions', { status: 'active' })) {
    const m = sub.metadata || {};
    if (!m.url) continue;
    if (m.last_run?.startsWith('started:')) {
      // In progress (skip) or a crashed run (stale lock: retry now).
      if (now - Number(m.last_run.slice(8)) >= STALE_LOCK_MS) jobs.push({ kind: 'subscription', sub });
      continue;
    }
    if (now - Number(m.last_run || 0) >= config.monitorIntervalDays * DAY - 6 * 3600000) jobs.push({ kind: 'subscription', sub });
  }
  try {
    for await (const pi of stripeAll('/payment_intents/search', { query: "metadata['recheck_pending']:'1'" })) {
      if (Number(pi.metadata?.recheck_due || 0) <= now && pi.metadata?.url) jobs.push({ kind: 'founding', pi });
    }
  } catch (e) { console.warn('[sweep] founding search failed', e.message); }

  const results = [];
  let i = 0;
  async function worker() {
    while (i < jobs.length && Date.now() - started < budgetMs - 25000) {
      const job = jobs[i++];
      try { results.push(await (job.kind === 'subscription' ? recheckSubscription(job.sub, siteUrl) : recheckFounding(job.pi, siteUrl))); }
      catch (e) { console.error('[sweep] job failed', job.kind, e.message); results.push({ kind: job.kind, error: e.message }); }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { due: jobs.length, processed: results.length, remaining: jobs.length - i, results };
}

async function recheckSubscription(sub, siteUrl) {
  const m = sub.metadata;
  await stripe('POST', `/subscriptions/${sub.id}`, { metadata: { last_run: `started:${Date.now()}` } });
  let email = m.email;
  if (!email && sub.customer) email = (await stripe('GET', `/customers/${typeof sub.customer === 'string' ? sub.customer : sub.customer.id}`)).email;
  const prev = m.last_score !== undefined && m.last_score !== '' ? Number(m.last_score) : undefined;
  try {
    const report = await runAuditForCustomer(m.url);
    const delta = prev === undefined ? '' : ` (${report.score - prev >= 0 ? '+' : ''}${report.score - prev})`;
    await sendEmail({
      to: email,
      subject: `Monthly check: ${report.host} scores ${report.score}/100${delta}`,
      html: renderReportEmail(report, { previousScore: prev, isMonitoring: true, reportUrl: m.report_session ? reportUrlFor(siteUrl, m.report_session) : undefined, intro: 'Here is this month\'s automatic health check of your website.' }),
      text: reportText(report),
    });
    await stripe('POST', `/subscriptions/${sub.id}`, { metadata: { last_run: String(Date.now()), last_score: String(report.score), prev_score: prev === undefined ? '' : String(prev) } });
    return { kind: 'subscription', id: sub.id, score: report.score };
  } catch (e) {
    // Site unreachable this month: tell the customer (that's useful info!) and try again in ~1 day.
    await sendEmail({ to: email, subject: `We couldn't reach ${m.url} for your monthly check`, text: `Our monthly health check couldn't load ${m.url}: ${e.message}\n\nIf your site is down, contact your web host. We'll try again tomorrow.`, html: `<p>Our monthly health check couldn't load <strong>${m.url}</strong>: ${e.message}</p><p>If your site is down, contact your web host. We'll try again tomorrow.</p>` }).catch(() => {});
    await stripe('POST', `/subscriptions/${sub.id}`, { metadata: { last_run: String(Date.now() - (config.monitorIntervalDays - 1) * DAY) } });
    throw e;
  }
}

async function recheckFounding(pi, siteUrl) {
  const m = pi.metadata;
  await stripe('POST', `/payment_intents/${pi.id}`, { metadata: { recheck_pending: '0' } }); // claim first: one email max
  const prev = m.score !== undefined && m.score !== '' ? Number(m.score) : undefined;
  const report = await runAuditForCustomer(m.url);
  await sendEmail({
    to: m.email,
    subject: `Your free re-check: ${report.host} now scores ${report.score}/100`,
    html: renderReportEmail(report, {
      previousScore: prev, monitorUrl: monitorCheckoutUrl(siteUrl, m.url, m.email),
      intro: 'As promised with your founding-clinic bonus, we re-checked your website. Here is your updated report with the score change since your first report. Want this every month? Add monitoring below. Cancel anytime.',
    }),
    text: reportText(report),
  });
  await stripe('POST', `/payment_intents/${pi.id}`, { metadata: { recheck_score: String(report.score) } });
  return { kind: 'founding', id: pi.id, score: report.score };
}
