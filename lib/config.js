// All runtime configuration comes from environment variables (see .env.example).
const env = process.env;
const int = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  brand: env.BRAND_NAME || 'Enamel Audits',
  siteUrl: (env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, ''),
  stripeKey: env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
  currency: (env.CURRENCY || 'usd').toLowerCase(),
  plans: {
    report:  { mode: 'payment',      price: env.STRIPE_PRICE_REPORT  || '', cents: int(env.PRICE_REPORT_CENTS, 9700),   name: 'Full Website Health Report' },
    monthly: { mode: 'subscription', price: env.STRIPE_PRICE_MONTHLY || '', cents: int(env.PRICE_MONTHLY_CENTS, 2900), interval: 'month', name: 'Website Health Monitoring (monthly)' },
    annual:  { mode: 'subscription', price: env.STRIPE_PRICE_ANNUAL  || '', cents: int(env.PRICE_ANNUAL_CENTS, 29000), interval: 'year',  name: 'Website Health Monitoring (annual)' },
  },
  foundingSpots: int(env.FOUNDING_SPOTS, 25),
  foundingRecheckDays: int(env.FOUNDING_RECHECK_DAYS, 28),
  monitorIntervalDays: int(env.MONITOR_INTERVAL_DAYS, 30),
  resendKey: env.RESEND_API_KEY || '',
  emailFrom: env.EMAIL_FROM || 'Enamel Audits <onboarding@resend.dev>',
  replyTo: env.REPLY_TO || env.OWNER_EMAIL || '',
  ownerEmail: env.OWNER_EMAIL || '',
  portalUrl: env.STRIPE_PORTAL_URL || '',
  pagespeedKey: env.PAGESPEED_API_KEY || '',
  cronSecret: env.CRON_SECRET || '',
};

export function siteUrlFrom(request) {
  if (config.siteUrl) return config.siteUrl;
  try { return new URL(request.url).origin; } catch { return ''; }
}
