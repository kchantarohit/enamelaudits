// GET /api/cron  (Vercel Cron, daily). Sends monthly monitoring reports + founding-bonus re-checks.
import { config, siteUrlFrom } from '../lib/config.js';
import { runMonitoringSweep } from '../lib/fulfill.js';
import { json } from '../lib/http.js';

export async function GET(request) {
  if (!config.cronSecret || request.headers.get('authorization') !== `Bearer ${config.cronSecret}`) return json({ error: 'Unauthorized' }, 401);
  try {
    const result = await runMonitoringSweep(siteUrlFrom(request));
    console.log('[cron]', JSON.stringify({ due: result.due, processed: result.processed, remaining: result.remaining }));
    return json(result);
  } catch (e) {
    console.error('[cron] failed', e);
    return json({ error: e.message }, 500);
  }
}
