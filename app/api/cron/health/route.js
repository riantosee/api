/**
 * Vercel Cron Job — runs every minute (configured in vercel.json).
 * Checks all API health statuses and saves results to cache.
 *
 * Secured with CRON_SECRET env var to prevent public abuse.
 * Vercel automatically sends Authorization: Bearer <CRON_SECRET> header.
 */

import { checkAllApis, saveHistoryPoint } from '../../../../lib/health-checker.js';
import { successResponse, errorResponse } from '../../../../lib/response-utils.js';

// Required so Vercel doesn't cache this route
export const dynamic = 'force-dynamic';

export async function GET(req) {
  // Verify the request comes from Vercel's cron scheduler
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return errorResponse(401, 'Unauthorized');
  }

  const start = Date.now();
  try {
    const results = await checkAllApis();
    await Promise.all(results.map(saveHistoryPoint));

    const summary = {
      checked: results.length,
      online:  results.filter((r) => r.status === 'online').length,
      warning: results.filter((r) => r.status === 'warning').length,
      down:    results.filter((r) => r.status === 'down').length,
      elapsed_ms: Date.now() - start,
    };

    console.log('[cron/health]', summary);
    return successResponse(summary, { source: 'cron-health-checker' });
  } catch (err) {
    console.error('[cron/health] failed:', err.message);
    return errorResponse(500, err.message);
  }
}
