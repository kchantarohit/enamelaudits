// POST /api/stripe-webhook  (Stripe -> us). Verifies the signature and fulfills orders automatically.
import { config, siteUrlFrom } from '../lib/config.js';
import { verifyWebhook } from '../lib/stripe.js';
import { fulfillCheckoutSession } from '../lib/fulfill.js';
import { json } from '../lib/http.js';

export async function POST(request) {
  const raw = await request.text();
  let event;
  try { event = verifyWebhook(raw, request.headers.get('stripe-signature'), config.stripeWebhookSecret); }
  catch (e) { console.warn('[webhook] rejected:', e.message); return json({ error: 'Invalid signature' }, 400); }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    try {
      const result = await fulfillCheckoutSession(event.data.object, siteUrlFrom(request));
      console.log('[webhook]', event.type, event.data.object.id, result.status);
      // Another delivery is mid-fulfillment: ask Stripe to retry later rather than risk never sending.
      if (result.status === 'in_progress') return json({ received: true, ...result }, 503);
      return json({ received: true, ...result });
    } catch (e) {
      console.error('[webhook] fulfillment failed', e);
      return json({ error: 'Fulfillment failed, Stripe will retry' }, 500);
    }
  }
  return json({ received: true, ignored: event.type });
}
