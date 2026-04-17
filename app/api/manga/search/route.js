/**
 * app/api/manga/search/route.js
 * Search manga — multi source
 *
 * GET /api/manga/search?q=Naruto
 * GET /api/manga/search?q=Naruto&source=mangadex   (default)
 * GET /api/manga/search?q=Naruto&source=komiku     (butuh ScraperAPI / tidak di-block)
 * GET /api/manga/search?q=Naruto&source=jikan      (MyAnimeList data)
 * GET /api/manga/search?q=Naruto&page=2
 *
 * KENAPA KOMIKU 502 DI VERCEL:
 *   komiku.org memblokir IP datacenter Vercel.
 *   Gunakan source=mangadex (default) yang 100% work di Vercel.
 *   Komiku hanya bisa jalan jika SCRAPER_API_KEY tersedia di env.
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const query  = (searchParams.get('q') || '').trim();
  const page   = Number(searchParams.get('page') || 1);
  const source = (searchParams.get('source') || 'mangadex').toLowerCase();

  if (!query) return errorResponse(400, 'Parameter "q" diperlukan. Contoh: ?q=Naruto');

  const cacheKey = `manga:search:${source}:${query.toLowerCase()}:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    let results = [];

    switch (source) {
      case 'mangadex':
        results = await searchMangaDex(query, page);
        break;
      case 'jikan':
        results = await searchJikan(query, page);
        break;
      case 'komiku':
        results = await searchKomiku(query, page);
        break;
      default:
        return errorResponse(400, `Source "${source}" tidak dikenal. Pilih: mangadex, jikan, komiku`);
    }

    const payload = { query, page, source, total: results.length, results };
    await cacheSet(cacheKey, payload, 300);
    return successResponse(payload);

  } catch (err) {
    console.error(`[manga/search][${source}]`, err.message);
    return gatewayError(`Gagal mengambil hasil pencarian dari ${source}: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// SOURCE 1: MANGADEX — default, 100% work di Vercel
// Docs: https://api.mangadex.org/docs
// ─────────────────────────────────────────────────────────────────

async function searchMangaDex(query, page) {
  const limit  = 20;
  const offset = (page - 1) * limit;

  const url = new URL('https://api.mangadex.org/manga');
  url.searchParams.set('title', query);
  url.searchParams.set('limit', limit);
  url.searchParams.set('offset', offset);
  url.searchParams.set('order[relevance]', 'desc');
  // Sertakan cover art supaya thumbnail tersedia
  url.searchParams.append('includes[]', 'cover_art');
  url.searchParams.append('includes[]', 'author');

  const res = await fetchWithTimeout(url.toString(), {
    'Accept': 'application/json',
  }, 8000);

  const json = JSON.parse(res);
  const list = json?.data || [];

  return list.map((m) => {
    // Ambil cover filename
    const coverRel = m.relationships?.find(r => r.type === 'cover_art');
    const coverFile = coverRel?.attributes?.fileName || '';
    const thumbnail = coverFile
      ? `https://uploads.mangadex.org/covers/${m.id}/${coverFile}.256.jpg`
      : '';

    // Ambil author
    const authorRel = m.relationships?.find(r => r.type === 'author');
    const author = authorRel?.attributes?.name || '';

    // Judul — prioritas: en → id → yang pertama tersedia
    const titles = m.attributes?.title || {};
    const title  = titles.en || titles.id || Object.values(titles)[0] || 'Unknown';

    // Deskripsi
    const descs = m.attributes?.description || {};
    const desc  = descs.en || descs.id || Object.values(descs)[0] || '';

    return {
      id          : m.id,
      title,
      slug        : m.id,
      url         : `https://mangadex.org/title/${m.id}`,
      thumbnail,
      author,
      genres      : m.attributes?.tags?.map(t => t.attributes?.name?.en).filter(Boolean) || [],
      synopsis    : desc.slice(0, 300),
      status      : m.attributes?.status || '',
      type        : m.attributes?.publicationDemographic || 'manga',
      year        : m.attributes?.year || null,
      rating      : m.attributes?.contentRating || '',
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// SOURCE 2: JIKAN (MyAnimeList) — metadata lengkap, work di Vercel
// Docs: https://docs.api.jikan.moe
// ─────────────────────────────────────────────────────────────────

async function searchJikan(query, page) {
  const url = new URL('https://api.jikan.moe/v4/manga');
  url.searchParams.set('q', query);
  url.searchParams.set('page', page);
  url.searchParams.set('limit', 20);
  url.searchParams.set('order_by', 'popularity');

  const res  = await fetchWithTimeout(url.toString(), { 'Accept': 'application/json' }, 8000);
  const json = JSON.parse(res);
  const list = json?.data || [];

  return list.map((m) => ({
    id        : String(m.mal_id),
    title     : m.title_english || m.title || '',
    slug      : String(m.mal_id),
    url       : m.url || '',
    thumbnail : m.images?.jpg?.large_image_url || m.images?.jpg?.image_url || '',
    author    : m.authors?.map(a => a.name).join(', ') || '',
    genres    : m.genres?.map(g => g.name) || [],
    synopsis  : (m.synopsis || '').slice(0, 300),
    status    : m.status || '',
    type      : m.type || 'manga',
    year      : m.published?.prop?.from?.year || null,
    rating    : m.rating || '',
    score     : m.score || null,
    rank      : m.rank || null,
  }));
}

// ─────────────────────────────────────────────────────────────────
// SOURCE 3: KOMIKU — bahasa Indonesia, butuh ScraperAPI di Vercel
// (IP Vercel di-block komiku.org tanpa proxy)
// ─────────────────────────────────────────────────────────────────

async function searchKomiku(query, page) {
  const scraperKey = process.env.SCRAPER_API_KEY;

  const target = new URL('https://api.komiku.org/');
  target.searchParams.set('post_type', 'manga');
  target.searchParams.set('s', query);
  if (page > 1) target.searchParams.set('page', page);

  let fetchUrl, fetchHeaders;

  if (scraperKey) {
    // Pakai ScraperAPI untuk bypass IP block
    fetchUrl     = `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(target.toString())}&render=false`;
    fetchHeaders = {};
  } else {
    // Tanpa proxy — hanya work di local/VPS, bukan di Vercel
    fetchUrl     = target.toString();
    fetchHeaders = {
      'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'HX-Request' : 'true',
      'HX-Trigger' : 'revealed',
      'Referer'    : 'https://komiku.org/',
    };
  }

  const html = await fetchWithTimeout(fetchUrl, fetchHeaders, 20000);
  return parseKomikuHtml(html);
}

// ─────────────────────────────────────────────────────────────────
// KOMIKU HTML PARSER
// ─────────────────────────────────────────────────────────────────

function parseKomikuHtml(html) {
  if (!html || typeof html !== 'string') return [];

  const results = [];
  const bgeRE   = /<div\s+class="bge">([\s\S]*?)(?=<div\s+class="bge"|$)/gi;
  let block;

  while ((block = bgeRE.exec(html)) !== null) {
    const item = parseKomikuItem(block[1]);
    if (item) results.push(item);
  }

  return results.length > 0 ? results : parseKomikuFallback(html);
}

function parseKomikuItem(content) {
  const linkMatch = content.match(/<h3[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/i)
                 || content.match(/<a\s+href="(https?:\/\/komiku\.org\/manga\/[^"]+)"[^>]*>([^<]{2,})<\/a>/i);
  if (!linkMatch) return null;

  const url   = linkMatch[1];
  const title = linkMatch[2].trim();
  const slugM = url.match(/\/manga\/([^/]+)\/?$/i);
  const slug  = slugM ? slugM[1] : '';

  const imgM      = content.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"[^>]*>/i);
  const genreM    = content.match(/<p\s+class="jdl2"[^>]*>([^<]+)<\/p>/i);
  const synopsisM = content.match(/<p\s+class="jdl2"[^>]*>[^<]+<\/p>\s*<p[^>]*>([^<]+)<\/p>/i);
  const statusM   = content.match(/Status:\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
  const typeM     = content.match(/Jenis:\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);

  return {
    id        : slug,
    title,
    url,
    slug,
    thumbnail : imgM      ? imgM[1]                                                    : '',
    genres    : genreM    ? genreM[1].replace(/^Genre:\s*/i,'').split(',').map(g=>g.trim()).filter(Boolean) : [],
    synopsis  : synopsisM ? synopsisM[1].trim()                                        : '',
    status    : statusM   ? statusM[1].trim()                                          : '',
    type      : typeM     ? typeM[1].trim()                                            : '',
  };
}

function parseKomikuFallback(html) {
  const results = [];
  const seen    = new Set();
  const linkRE  = /<a\s+href="(https?:\/\/komiku\.org\/manga\/[^"]+)"[^>]*>([^<]{3,})<\/a>/gi;
  let m;
  while ((m = linkRE.exec(html)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const slugM = m[1].match(/\/manga\/([^/]+)\/?$/i);
    const before = html.slice(Math.max(0, m.index - 400), m.index);
    const imgM   = before.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"[^>]*/i);
    results.push({ id: slugM?.[1]||'', title: m[2].trim(), url: m[1], slug: slugM?.[1]||'', thumbnail: imgM?.[1]||'', genres:[], synopsis:'', status:'', type:'' });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (res.status === 403) throw new Error('Akses ditolak (403)');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
