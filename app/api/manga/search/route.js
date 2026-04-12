import { proxyFetch, buildUrl } from '../../../../lib/proxy-fetch.js';
import { getApiById } from '../../../../lib/api-registry.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';
  const page = Number(searchParams.get('page') || 1);
  const provider = searchParams.get('provider') || 'mangadex';

  if (!query.trim()) return errorResponse(400, 'Query "q" is required');

  const api = getApiById(provider);
  if (!api || !api.enabled) return errorResponse(503, `Provider "${provider}" unavailable`);

  const cacheKey = `search:manga:${provider}:${query}:${page}`;
  try {
    const url = buildUrl(api.baseUrl, api.endpoints.search, { query, page });
    const { data, fromCache } = await proxyFetch(url, { timeout: api.timeout }, cacheKey, 300);
    const items = normalizeMangaSearch(data, provider);
    return successResponse(items, { source: provider, page, fromCache, total: items.length });
  } catch (err) {
    console.error('[manga/search]', err.message);
    return gatewayError('Manga provider unavailable');
  }
}

function normalizeMangaSearch(raw, provider) {
  if (provider === 'mangadex') {
    const list = raw?.data || [];
    return list.map((m) => ({
      id: m.id,
      title: m.attributes?.title?.en || Object.values(m.attributes?.title || {})[0] || 'Unknown',
      description: m.attributes?.description?.en || '',
      status: m.attributes?.status,
      year: m.attributes?.year,
      tags: m.attributes?.tags?.map((t) => t.attributes?.name?.en) || [],
      contentRating: m.attributes?.contentRating,
    }));
  }
  return raw?.results || raw?.data || raw || [];
}
