import { proxyFetch, buildUrl, getFallbackApis } from '../../../../lib/proxy-fetch.js';
import { getApiById } from '../../../../lib/api-registry.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || searchParams.get('query') || '';
  const page = Number(searchParams.get('page') || 1);
  const provider = searchParams.get('provider') || 'jikan-anime';

  if (!query.trim()) return errorResponse(400, 'Query parameter "q" is required');

  const api = getApiById(provider);
  if (!api) return errorResponse(404, `Provider "${provider}" not found`);
  if (!api.enabled) return errorResponse(503, `Provider "${provider}" is currently disabled`);

  const cacheKey = `search:anime:${provider}:${query}:${page}`;

  try {
    const url = buildUrl(api.baseUrl, api.endpoints.search, { query, page });
    const { data, fromCache } = await proxyFetch(url, { timeout: api.timeout }, cacheKey, 180);
    const items = normalizeAnimeSearch(data, provider);
    return successResponse(items, { source: provider, page, fromCache });
  } catch (err) {
    // Fallback providers
    const fallbacks = getFallbackApis(provider, 'anime');
    for (const fb of fallbacks) {
      try {
        const url = buildUrl(fb.baseUrl, fb.endpoints.search || '', { query, page });
        const { data } = await proxyFetch(url, { timeout: fb.timeout }, null, 180);
        const items = normalizeAnimeSearch(data, fb.id);
        return successResponse(items, { source: `${fb.id} (fallback)`, page });
      } catch {/* try next */}
    }
    console.error('[anime/search]', err.message);
    return gatewayError('All anime providers failed. Please try again later.');
  }
}

function normalizeAnimeSearch(raw, provider) {
  if (provider === 'jikan-anime') {
    const list = raw?.data || [];
    return list.map((a) => ({
      id: String(a.mal_id),
      title: a.title,
      title_english: a.title_english,
      image: a.images?.jpg?.image_url,
      type: a.type,
      episodes: a.episodes,
      score: a.score,
      year: a.year,
      status: a.status,
      genres: a.genres?.map((g) => g.name) || [],
      synopsis: a.synopsis,
    }));
  }
  if (provider === 'consumet-anime') {
    const list = raw?.results || [];
    return list.map((a) => ({
      id: a.id,
      title: a.title,
      image: a.image,
      type: a.subOrDub || 'sub',
      episodes: a.totalEpisodes,
      url: a.url,
    }));
  }
  return raw?.results || raw?.data || raw || [];
}
