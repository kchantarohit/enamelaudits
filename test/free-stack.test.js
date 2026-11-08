// Zero-cost stack: Gmail SMTP delivery + Netlify function wrappers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  AUDIT_ALLOW_PRIVATE: '1', GMAIL_USER: 'shop@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
  STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_test', SITE_URL: 'https://enamel.netlify.app',
});
delete process.env.RESEND_API_KEY;
const { startFixtureServer } = await import('./serve-fixtures.js');
const email = await import('../lib/email.js');
const { config } = await import('../lib/config.js');
const snapshotFn = (await import('../netlify/functions/snapshot.js')).default;
const healthFn = (await import('../netlify/functions/health.js')).default;
const webhookFn = (await import('../netlify/functions/stripe-webhook.js')).default;
const healthCfg = (await import('../netlify/functions/health.js')).config;
const scheduledCfg = (await import('../netlify/functions/monitor-scheduled.js')).config;

let srv; const sent = [];
before(async () => { srv = await startFixtureServer(); email._setTransportForTest({ sendMail: async m => { sent.push(m); return { messageId: 'm1' }; } }); });
after(() => { email._setTransportForTest(null); srv.server.close(); });

test('Gmail is selected when GMAIL_* is set, app password spaces stripped', () => {
  email._setTransportForTest(null);
  assert.equal(email.emailProvider(), 'gmail');
  assert.equal(config.gmailAppPassword, 'abcdefghijklmnop');
  assert.equal(config.ownerEmail, 'shop@gmail.com');
  email._setTransportForTest({ sendMail: async m => { sent.push(m); return { messageId: 'm1' }; } });
});

test('Netlify snapshot function audits and emails from the Gmail address', async () => {
  const res = await snapshotFn(new Request('https://enamel.netlify.app/api/snapshot', { method: 'POST', body: JSON.stringify({ url: `${srv.base}/bad/`, email: 'dr@example.com', name: 'Dr A' }) }));
  const j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j));
  assert.equal(j.topIssues.length, 3);
  assert.equal(j.emailed, true);
  assert.match(j.buyUrl, /^https:\/\/enamel\.netlify\.app\/api\/checkout\?/);
  const toCustomer = sent.find(m => m.to === 'dr@example.com');
  assert.equal(toCustomer.from, '"Enamel Audits" <shop@gmail.com>');
  assert.ok(sent.some(m => m.to === 'shop@gmail.com' && /New lead/.test(m.subject)), 'owner lead alert to the Gmail inbox');
});

test('Netlify wrappers: routing config, method handling, webhook signature check', async () => {
  assert.equal(healthCfg.path, '/api/health');
  assert.equal(scheduledCfg.schedule, '@hourly');
  const h = await healthFn(new Request('https://enamel.netlify.app/api/health'));
  assert.equal((await h.json()).email, 'test');
  assert.equal((await healthFn(new Request('https://enamel.netlify.app/api/health', { method: 'POST' }))).status, 405);
  const w = await webhookFn(new Request('https://enamel.netlify.app/api/stripe-webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=bad' } }));
  assert.equal(w.status, 400);
});
