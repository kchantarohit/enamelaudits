// GET /api/health -> which integrations are configured (booleans only, no secrets)
import { config } from '../lib/config.js';
import { json } from '../lib/http.js';

export function GET() {
  return json({
    ok: true,
    stripe: Boolean(config.stripeKey),
    stripeMode: config.stripeKey.startsWith('sk_live') || config.stripeKey.startsWith('rk_live') ? 'live' : config.stripeKey ? 'test' : null,
    webhook: Boolean(config.stripeWebhookSecret),
    email: Boolean(config.resendKey),
    ownerAlerts: Boolean(config.ownerEmail),
    cron: Boolean(config.cronSecret),
    pagespeed: Boolean(config.pagespeedKey),
    siteUrl: config.siteUrl || null,
  });
}
