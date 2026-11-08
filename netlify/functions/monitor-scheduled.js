// Netlify Scheduled Function (free on all plans). Runs every hour; each run processes the monitoring
// and founding re-checks that are due and fit inside one 30s function run.
import { runMonitoringSweep } from '../../lib/fulfill.js';
import { config as app } from '../../lib/config.js';

export default async () => {
  if (!app.stripeKey) { console.log('[scheduled] STRIPE_SECRET_KEY not set, skipping'); return new Response('skipped'); }
  const r = await runMonitoringSweep(app.siteUrl);
  console.log('[scheduled]', JSON.stringify({ due: r.due, processed: r.processed, remaining: r.remaining }));
  return new Response('ok');
};

export const config = { schedule: '@hourly' };
