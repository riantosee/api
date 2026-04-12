import { getAllStatuses, checkAllApis, getApiStatus, saveHistoryPoint } from '../../../lib/health-checker.js';
import { successResponse, errorResponse } from '../../../lib/response-utils.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const refresh = searchParams.get('refresh') === 'true';

  try {
    if (id) {
      const status = await getApiStatus(id);
      if (!status) return errorResponse(404, `API "${id}" not found`);
      return successResponse(status, { source: 'health-checker' });
    }

    let statuses;
    if (refresh) {
      statuses = await checkAllApis();
      statuses.forEach(saveHistoryPoint);
    } else {
      statuses = await getAllStatuses();
    }

    // Summary
    const summary = {
      total: statuses.length,
      online: statuses.filter((s) => s.status === 'online').length,
      warning: statuses.filter((s) => s.status === 'warning').length,
      down: statuses.filter((s) => s.status === 'down').length,
      disabled: statuses.filter((s) => s.status === 'disabled').length,
      unknown: statuses.filter((s) => s.status === 'unknown').length,
    };

    return successResponse({ apis: statuses, summary }, { source: 'health-checker' });
  } catch (err) {
    console.error('[/api/status]', err);
    return errorResponse(500, 'Failed to retrieve status');
  }
}

// OPTIONS for CORS
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
