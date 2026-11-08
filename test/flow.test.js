// End-to-end test of the automated money path with Stripe + Resend mocked in memory.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  AUDIT_ALLOW_PRIVATE: '1', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test',
  RESEND_API_KEY: 're_test', OWNER_EMAIL: 'owner@example.com', CRON_SECRET: 'cron123', SITE_URL: 'https://shop.test', FOUNDING_SPOTS: '2',
});
const { startFixtureServer } = await import('./serve-fixtures.js');
const { signWebhookForTest } = await import('../lib/stripe.js');
const webhook = await import('../api/stripe-webhook.js');
const checkout = await import('../api/checkout.js');
const cron = await import('../api/cron.js');
const health = await import('../api/health.js');

let srv, db, emails, stripeCalls;
const realFetch = globalThis.fetch;

function parseForm(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body || '')) {
    const path = k.replace(/\]/g, '').split('[');
    let o = out;
    path.slice(0, -1).forEach(p => (o = o[p] ??= {}));
    o[path.at(-1)] = v;
  }
  return out;
}

function stripeMock(method, path, body) {
  stripeCalls.push({ method, path: path.split('?')[0].replace('/v1', ''), body });
  const p = path.split('?')[0].replace('/v1', '');
  const q = new URL('https://x' + path).searchParams;
  const reply = (j, s = 200) => new Response(JSON.stringify(j), { status: s, headers: { 'content-type': 'application/json' } });
  const search = (coll) => {
    const m = q.get('query').match(/metadata\['(\w+)'\]:'(\w+)'/);
    return reply({ data: Object.values(coll).filter(o => o.metadata?.[m[1]] === m[2]), has_more: false });
  };
  let m;
  if (p === '/checkout/sessions' && method === 'POST') return reply({ id: 'cs_test_new', url: 'https://checkout.stripe.com/c/pay/cs_test_new', ...body });
  if (p === '/payment_intents/search') return search(db.pi);
  if ((m = p.match(/^\/payment_intents\/(\w+)$/))) {
    const o = db.pi[m[1]];
    if (method === 'POST') Object.assign(o.metadata, body.metadata);
    return reply(o);
  }
  if (p === '/subscriptions') return reply({ data: Object.values(db.sub).filter(s => s.status === q.get('status')), has_more: false });
  if ((m = p.match(/^\/subscriptions\/(\w+)$/))) {
    const o = db.sub[m[1]];
    if (method === 'POST') Object.assign(o.metadata, body.metadata);
    return reply(o);
  }
  if ((m = p.match(/^\/customers\/(\w+)$/))) return reply({ id: m[1], email: 'sub@example.com' });
  return reply({ error: { message: 'unmocked ' + p } }, 404);
}

before(async () => {
  srv = await startFixtureServer();
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input instanceof URL ? input.href : input.url || input);
    if (url.startsWith('https://api.stripe.com')) return stripeMock(init.method || 'GET', url.replace('https://api.stripe.com', ''), parseForm(init.body));
    if (url.startsWith('https://api.resend.com')) { emails.push(JSON.parse(init.body)); return new Response('{"id":"em_1"}', { status: 200 }); }
    return realFetch(input, init);
  };
});
after(() => { globalThis.fetch = realFetch; srv.server.close(); });
beforeEach(() => { db = { pi: {}, sub: {} }; emails = []; stripeCalls = []; });

function signedRequest(event, secret = 'whsec_test') {
  const raw = JSON.stringify(event);
  return new Request('https://shop.test/api/stripe-webhook', { method: 'POST', body: raw, headers: { 'stripe-signature': signWebhookForTest(raw, secret) } });
}

const paidSession = (url, extra = {}) => ({
  id: 'cs_test_abc123456789', object: 'checkout.session', mode: 'payment', status: 'complete', payment_status: 'paid',
  payment_intent: 'pi_1', customer_details: { email: 'doc@example.com' }, metadata: { url, plan: 'report' }, ...extra,
});

test('webhook rejects bad signatures', async () => {
  const res = await webhook.POST(signedRequest({ type: 'checkout.session.completed', data: { object: {} } }, 'whsec_wrong'));
  assert.equal(res.status, 400);
  assert.equal(emails.length, 0);
});

test('paid report: audit is emailed once, founding bonus applied, retries are idempotent', async () => {
  db.pi.pi_1 = { id: 'pi_1', metadata: {} };
  const event = { type: 'checkout.session.completed', data: { object: paidSession(`${srv.base}/bad/`) } };
  const res = await webhook.POST(signedRequest(event));
  const j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j));
  assert.equal(j.status, 'fulfilled');
  const customer = emails.find(e => e.to[0] === 'doc@example.com');
  assert.ok(customer, 'customer emailed');
  assert.match(customer.subject, /Website Health Report: \d+\/100/);
  assert.match(customer.html, /tap-to-call/);
  assert.match(customer.html, /Fix:/);
  assert.match(customer.html, /Founding-clinic bonus/);
  assert.match(customer.html, /report\.html\?session_id=cs_test_abc123456789/);
  assert.ok(emails.some(e => e.to[0] === 'owner@example.com' && /New sale/.test(e.subject)), 'owner notified');
  assert.equal(db.pi.pi_1.metadata.fulfill_state, 'done');
  assert.equal(db.pi.pi_1.metadata.founding, '1');
  assert.equal(db.pi.pi_1.metadata.recheck_pending, '1');

  const before = emails.length;
  const again = await (await webhook.POST(signedRequest(event))).json();
  assert.equal(again.status, 'already_fulfilled');
  assert.equal(emails.length, before, 'no duplicate email on Stripe retry');
});

test('unpaid sessions are not fulfilled', async () => {
  const event = { type: 'checkout.session.completed', data: { object: paidSession(`${srv.base}/bad/`, { payment_status: 'unpaid' }) } };
  const j = await (await webhook.POST(signedRequest(event))).json();
  assert.equal(j.status, 'not_paid');
  assert.equal(emails.length, 0);
});

test('subscription checkout sends the first monitoring report', async () => {
  db.sub.sub_1 = { id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { url: `${srv.base}/good/` } };
  const s = paidSession(`${srv.base}/good/`, { mode: 'subscription', subscription: 'sub_1', payment_intent: null, metadata: { url: `${srv.base}/good/`, plan: 'monthly' } });
  const j = await (await webhook.POST(signedRequest({ type: 'checkout.session.completed', data: { object: s } }))).json();
  assert.equal(j.status, 'fulfilled');
  assert.match(emails[0].subject, /Monitoring started/);
  assert.ok(Number(db.sub.sub_1.metadata.last_run) > 0);
});

test('checkout creates a Stripe session carrying the website URL', async () => {
  const res = await checkout.POST(new Request('https://shop.test/api/checkout', { method: 'POST', body: JSON.stringify({ plan: 'report', url: `${srv.base}/good/`, email: 'a@b.co' }) }));
  const j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j));
  assert.match(j.url, /checkout\.stripe\.com/);
  const call = stripeCalls.find(c => c.path === '/checkout/sessions');
  assert.equal(call.body.mode, 'payment');
  assert.equal(call.body.metadata.url, `${srv.base}/good/`);
  assert.equal(call.body.payment_intent_data.metadata.url, `${srv.base}/good/`);
  assert.equal(call.body.line_items[0].price_data.unit_amount, '9700');
  assert.equal(call.body.success_url, 'https://shop.test/report.html?session_id={CHECKOUT_SESSION_ID}');

  const bad = await checkout.POST(new Request('https://shop.test/api/checkout', { method: 'POST', body: JSON.stringify({ plan: 'gold', url: 'x.com' }) }));
  assert.equal(bad.status, 400);
});

test('cron: requires secret, then sends due monthly reports and founding re-checks', async () => {
  assert.equal((await cron.GET(new Request('https://shop.test/api/cron'))).status, 401);
  const old = String(Date.now() - 31 * 86400000);
  db.sub.sub_due = { id: 'sub_due', status: 'active', customer: 'cus_9', metadata: { url: `${srv.base}/good/`, last_run: old, last_score: '50' } };
  db.sub.sub_fresh = { id: 'sub_fresh', status: 'active', customer: 'cus_8', metadata: { url: `${srv.base}/good/`, last_run: String(Date.now()) } };
  db.pi.pi_f = { id: 'pi_f', metadata: { url: `${srv.base}/bad/`, email: 'f@example.com', score: '20', founding: '1', recheck_pending: '1', recheck_due: String(Date.now() - 1000) } };
  db.pi.pi_later = { id: 'pi_later', metadata: { url: `${srv.base}/bad/`, email: 'l@example.com', recheck_pending: '1', recheck_due: String(Date.now() + 86400000) } };

  const res = await cron.GET(new Request('https://shop.test/api/cron', { headers: { authorization: 'Bearer cron123' } }));
  const j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j));
  assert.equal(j.due, 2);
  assert.equal(j.processed, 2);
  const monthly = emails.find(e => e.to[0] === 'sub@example.com');
  assert.match(monthly.subject, /Monthly check: .* \(\+\d+\)/);
  assert.match(monthly.html, /since last check \(was 50\)/);
  assert.ok(emails.some(e => e.to[0] === 'f@example.com' && /free re-check/.test(e.subject)));
  assert.ok(!emails.some(e => e.to[0] === 'l@example.com'));
  assert.equal(db.pi.pi_f.metadata.recheck_pending, '0');
  assert.equal(db.sub.sub_fresh.metadata.last_run.startsWith('started'), false);
});

test('health endpoint reports configuration without secrets', async () => {
  const j = await (await health.GET()).json();
  assert.equal(j.stripe, true);
  assert.equal(j.stripeMode, 'test');
  assert.ok(!JSON.stringify(j).includes('sk_test_x'));
});
