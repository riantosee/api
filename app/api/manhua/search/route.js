import { proxyFetch, buildUrl } from '../../../../lib/proxy-fetch.js';
import { getApiById } from '../../../../lib/api-registry.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';
  const provider = searchParams.get('provider') || 'manganato-manhua';

  if (!query.trim()) return errorResponse(400, 'Query "q" is required');

  const api = getApiById(provider);
  if (!api || !api.enabled) return errorResponse(503, `Provider "${provider}" unavailable`);

  const cacheKey = `search:manhua:${provider}:${query}`;
  try {
    const url = buildUrl(api.baseUrl, api.endpoints.search, { query });
    const { data, fromCache } = await proxyFetch(url, { timeout: api.timeout }, cacheKey, 300);
    const items = data?.results || data?.data || data || [];
    return successResponse(items, { source: provider, fromCache, total: items.length });
  } catch (err) {
    console.error('[manhua/search]', err.message);
    return gatewayError('Manhua provider unavailable');
  }
}
