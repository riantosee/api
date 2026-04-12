import { getUptimeStats, getErrorLog } from '../../../lib/health-checker.js';
import { API_REGISTRY } from '../../../lib/api-registry.js';
import { successResponse, errorResponse } from '../../../lib/response-utils.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') || 'summary'; // summary | errors | history

  try {
    if (mode === 'errors') {
      const log = await getErrorLog();
      return successResponse(log, { source: 'error-logger', total: log.length });
    }

    if (mode === 'history') {
      const id = searchParams.get('id');
      if (!id) return errorResponse(400, 'Missing id param for history mode');
      const stats = await getUptimeStats(id);
      return successResponse(stats, { source: 'uptime-tracker' });
    }

    // Summary — uptime for all APIs
    const uptimes = await Promise.all(
      API_REGISTRY.map(async (api) => {
        const stats = await getUptimeStats(api.id);
        return { id: api.id, label: api.label, category: api.category, ...stats };
      })
    );

    return successResponse(uptimes, { source: 'uptime-tracker', total: uptimes.length });
  } catch (err) {
    console.error('[/api/health]', err);
    return errorResponse(500, 'Health endpoint error');
  }
}
