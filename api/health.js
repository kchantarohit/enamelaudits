// GET /api/health -> which integrations are configured (booleans only, no secrets)
import { config } from '../lib/config.js';
import { json } from '../lib/http.js';
import { emailProvider } from '../lib/email.js';

export function GET() {
  return json({
    ok: true,
    stripe: Boolean(config.stripeKey),
    stripeMode: config.stripeKey.startsWith('sk_live') || config.stripeKey.startsWith('rk_live') ? 'live' : config.stripeKey ? 'test' : null,
    webhook: Boolean(config.stripeWebhookSecret),
    email: emailProvider(), // 'gmail' | 'resend' | null
    ownerAlerts: Boolean(config.ownerEmail),
    cronSecret: Boolean(config.cronSecret), // only needed for the HTTP /api/cron endpoint (Vercel / manual)
    pagespeed: Boolean(config.pagespeedKey),
    siteUrl: config.siteUrl || null,
  });
}
