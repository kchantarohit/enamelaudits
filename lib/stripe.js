// Minimal Stripe REST client (no SDK) + webhook signature verification.
import crypto from 'node:crypto';
import { config } from './config.js';

function encode(params, prefix = '', out = []) {
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? encode(item, `${key}[${i}]`, out) : out.push([`${key}[${i}]`, String(item)])));
    else if (typeof v === 'object') encode(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}

export function formEncode(params) {
  return new URLSearchParams(encode(params)).toString();
}

export async function stripe(method, path, params, { idempotencyKey } = {}) {
  if (!config.stripeKey) throw new Error('STRIPE_SECRET_KEY is not configured');
  const isGet = method === 'GET';
  const qs = isGet && params ? `?${formEncode(params)}` : '';
  const headers = { authorization: `Bearer ${config.stripeKey}`, 'stripe-version': '2024-06-20' };
  if (!isGet) headers['content-type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1${path}${qs}`, { method, headers, body: isGet ? undefined : formEncode(params) });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Stripe ${res.status}`);
    err.status = res.status; err.stripe = json?.error;
    throw err;
  }
  return json;
}

/** Iterate over all items of a list/search endpoint. */
export async function* stripeAll(path, params = {}) {
  let page; let next = null;
  do {
    const p = { limit: 100, ...params };
    if (next) path.includes('/search') ? (p.page = next) : (p.starting_after = next);
    page = await stripe('GET', path, p);
    for (const item of page.data) yield item;
    next = path.includes('/search') ? page.next_page : page.data.at(-1)?.id;
  } while (page.has_more && next);
}

/** Verify a Stripe-Signature header. Returns the parsed event or throws. */
export function verifyWebhook(rawBody, header, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  if (!header) throw new Error('Missing Stripe-Signature header');
  let t = null; const v1 = [];
  for (const item of header.split(',')) {
    const [k, v] = item.split('=');
    if (k === 't') t = Number(v);
    if (k === 'v1') v1.push(v);
  }
  if (!t || !v1.length) throw new Error('Malformed Stripe-Signature header');
  if (Math.abs(nowSec - t) > toleranceSec) throw new Error('Webhook timestamp outside tolerance');
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  const ok = v1.some(sig => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
  if (!ok) throw new Error('Invalid webhook signature');
  return JSON.parse(rawBody);
}

export function signWebhookForTest(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  return `t=${t},v1=${sig}`;
}
