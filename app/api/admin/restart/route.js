import { verifyAdmin } from '../../../../lib/admin-auth.js';
import { checkApi, saveHistoryPoint } from '../../../../lib/health-checker.js';
import { getApiById } from '../../../../lib/api-registry.js';
import { successResponse, errorResponse } from '../../../../lib/response-utils.js';

export async function POST(req) {
  const auth = verifyAdmin(req);
  if (!auth.ok) return errorResponse(auth.status, auth.message);

  try {
    const { id } = await req.json();
    if (!id) return errorResponse(400, 'Missing API id');

    const api = getApiById(id);
    if (!api) return errorResponse(404, `API "${id}" not found`);

    const result = await checkApi(api);
    await saveHistoryPoint(result);

    return successResponse(result, { source: 'admin-restart' });
  } catch (err) {
    return errorResponse(500, err.message);
  }
}
