// POST /api/checkout {plan, url, email} -> {url}   (from the site)
// GET  /api/checkout?plan=&url=&email=  -> 303 to Stripe Checkout   (from email links)
import { config, siteUrlFrom } from '../lib/config.js';
import { stripe } from '../lib/stripe.js';
import { normalizeUrl, assertPublicHost } from '../lib/safe-fetch.js';
import { json, readJson, isEmail, clientIp, rateLimited } from '../lib/http.js';

async function createSession(request, { plan, url, email }) {
  const p = config.plans[plan];
  if (!p) throw Object.assign(new Error('Unknown plan.'), { status: 400 });
  const site = normalizeUrl(url);
  await assertPublicHost(site.hostname); // catch typos before the customer pays
  const base = siteUrlFrom(request);
  const md = { url: site.href, plan };
  const lineItem = p.price ? { price: p.price, quantity: 1 } : {
    quantity: 1,
    price_data: {
      currency: config.currency, unit_amount: p.cents,
      product_data: { name: p.name, description: `For ${site.hostname}` },
      ...(p.interval ? { recurring: { interval: p.interval } } : {}),
    },
  };
  return stripe('POST', '/checkout/sessions', {
    mode: p.mode,
    line_items: [lineItem],
    success_url: `${base}/report.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/#pricing`,
    allow_promotion_codes: true,
    metadata: md,
    ...(isEmail(email) ? { customer_email: email } : {}),
    ...(p.mode === 'payment' ? { payment_intent_data: { metadata: md }, customer_creation: 'always' } : { subscription_data: { metadata: md } }),
  });
}

function errorMessage(e) {
  if (e.code) return e.message; // FetchError: friendly
  console.error('[checkout]', e.message);
  return 'Checkout is temporarily unavailable. Please try again in a minute.';
}

export async function POST(request) {
  if (rateLimited(`co:${clientIp(request)}`, 20, 3600_000)) return json({ error: 'Too many attempts. Try again later.' }, 429);
  let body;
  try { body = await readJson(request); } catch (e) { return json({ error: e.message }, 400); }
  try {
    const session = await createSession(request, body);
    return json({ url: session.url });
  } catch (e) {
    return json({ error: errorMessage(e) }, e.status === 400 || e.code ? 400 : 502);
  }
}

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  try {
    const session = await createSession(request, { plan: q.get('plan') || 'report', url: q.get('url'), email: q.get('email') });
    return Response.redirect(session.url, 303);
  } catch (e) {
    const back = `${siteUrlFrom(request)}/?checkout_error=${encodeURIComponent(errorMessage(e))}#pricing`;
    return Response.redirect(back, 303);
  }
}
