// GET /api/report?session_id=cs_...  -> live full report for a paid Checkout Session (the success page)
import { config, siteUrlFrom } from '../lib/config.js';
import { stripe } from '../lib/stripe.js';
import { runAudit } from '../lib/audit.js';
import { renderReportBody } from '../lib/render.js';
import { isSessionPaid, monitorCheckoutUrl } from '../lib/fulfill.js';
import { json, clientIp, rateLimited } from '../lib/http.js';

const MAX_AGE_DAYS = 120;

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('session_id') || '';
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return json({ error: 'Invalid report link.' }, 400);
  if (rateLimited(`rep:${clientIp(request)}`, 30, 3600_000)) return json({ error: 'Too many requests. Try again later.' }, 429);

  let session;
  try { session = await stripe('GET', `/checkout/sessions/${id}`); }
  catch (e) { return json({ error: e.status === 404 ? 'Report not found.' : 'Could not load your order. Please refresh in a moment.' }, e.status === 404 ? 404 : 502); }
  if (!isSessionPaid(session)) return json({ error: 'This order has not been paid yet.', pending: session.status === 'complete' }, 402);

  if (session.mode === 'subscription') {
    const sub = await stripe('GET', `/subscriptions/${session.subscription}`);
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) return json({ error: 'This monitoring subscription has ended. Restart it any time from the pricing page.' }, 403);
  } else if ((Date.now() / 1000 - session.created) > MAX_AGE_DAYS * 86400) {
    return json({ error: `This report link has expired (links last ${MAX_AGE_DAYS} days). Reply to your report email if you need a copy.` }, 410);
  }

  const site = siteUrlFrom(request);
  const target = session.metadata?.url || session.custom_fields?.find(f => /web|url|site|domain/i.test(f.key || ''))?.text?.value;
  if (!target) return json({ error: 'We could not find a website address on this order. Reply to your receipt email with it and we will send your report.' }, 422);
  try {
    const report = await runAudit(target, { pagespeedKey: config.pagespeedKey, budgetMs: 25000 });
    return json({
      html: renderReportBody(report),
      score: report.score, grade: report.grade, host: report.host,
      email: session.customer_details?.email || null,
      mode: session.mode,
      monitorUrl: session.mode === 'payment' ? monitorCheckoutUrl(site, target, session.customer_details?.email) : null,
      portalUrl: session.mode === 'subscription' ? config.portalUrl || null : null,
    });
  } catch (e) {
    return json({ error: `We couldn't load ${target} right now (${e.message}). Your report will also arrive by email. Please refresh in a minute.` }, 502);
  }
}
