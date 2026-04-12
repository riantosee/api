import { proxyFetch, buildUrl } from '../../../../lib/proxy-fetch.js';
import { getApiById } from '../../../../lib/api-registry.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get('provider') || 'jikan-anime';
  const page = Number(searchParams.get('page') || 1);

  const api = getApiById(provider);
  if (!api || !api.enabled) return errorResponse(503, `Provider "${provider}" unavailable`);
  if (!api.endpoints.trending) return errorResponse(400, `Provider "${provider}" has no trending endpoint`);

  const cacheKey = `trending:anime:${provider}:${page}`;
  try {
    const url = buildUrl(api.baseUrl, api.endpoints.trending, { page });
    const { data, fromCache } = await proxyFetch(url, { timeout: api.timeout }, cacheKey, 300);
    const items = (data?.data || data?.results || data || []).slice(0, 25);
    return successResponse(items, { source: provider, page, fromCache, total: items.length });
  } catch (err) {
    console.error('[anime/trending]', err.message);
    return gatewayError('Trending endpoint unavailable');
  }
}
