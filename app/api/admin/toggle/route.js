import { verifyAdmin } from '../../../../lib/admin-auth.js';
import { cacheGet, cacheSet } from '../../../../lib/cache.js';
import { API_REGISTRY } from '../../../../lib/api-registry.js';
import { successResponse, errorResponse } from '../../../../lib/response-utils.js';

export async function POST(req) {
  const auth = verifyAdmin(req);
  if (!auth.ok) return errorResponse(auth.status, auth.message);

  try {
    const { id, enabled } = await req.json();
    if (!id) return errorResponse(400, 'Missing API id');

    const api = API_REGISTRY.find((a) => a.id === id);
    if (!api) return errorResponse(404, `API "${id}" not found`);

    api.enabled = enabled ?? !api.enabled;

    const overrides = (await cacheGet('admin:overrides')) || {};
    overrides[id] = { enabled: api.enabled, updatedAt: new Date().toISOString() };
    await cacheSet('admin:overrides', overrides, 86400);

    return successResponse({ id, enabled: api.enabled }, { source: 'admin' });
  } catch (err) {
    return errorResponse(500, err.message);
  }
}
