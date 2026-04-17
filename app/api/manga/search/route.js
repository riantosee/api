/**
 * app/api/manga/search/route.js
 * Search manga — multi source
 *
 * GET /api/manga/search?q=Naruto
 * GET /api/manga/search?q=Naruto&source=mangadex      (default)
 * GET /api/manga/search?q=Naruto&source=komikstation   (bahasa Indonesia)
 * GET /api/manga/search?q=Naruto&source=jikan          (MyAnimeList data)
 * GET /api/manga/search?q=Naruto&page=2
 *
 * CATATAN KOMIKSTATION DI VERCEL:
 *   komikstation.org mungkin memblokir IP datacenter Vercel.
 *   Gunakan source=mangadex (default) yang 100% work di Vercel.
 *   Komikstation bisa pakai SCRAPER_API_KEY jika di-block.
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
      case 'komikstation':
        results = await searchKomikstation(query, page);
        break;
      default:
        return errorResponse(400, `Source "${source}" tidak dikenal. Pilih: mangadex, jikan, komikstation`);
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
// SOURCE 3: KOMIKSTATION — bahasa Indonesia
// URL: https://komikstation.org/?s=query
// (Gunakan ScraperAPI jika IP Vercel di-block)
// ─────────────────────────────────────────────────────────────────

async function searchKomikstation(query, page) {
  const scraperKey = process.env.SCRAPER_API_KEY;

  const target = new URL('https://komikstation.org/');
  target.searchParams.set('s', query);
  if (page > 1) target.searchParams.set('page', page);

  let fetchUrl, fetchHeaders;

  if (scraperKey) {
    // Pakai ScraperAPI untuk bypass IP block
    fetchUrl     = `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(target.toString())}&render=false`;
    fetchHeaders = {};
  } else {
    // Tanpa proxy — coba langsung (mungkin di-block di Vercel)
    fetchUrl     = target.toString();
    fetchHeaders = {
      'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept'     : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer'    : 'https://komikstation.org/',
    };
  }

  const html = await fetchWithTimeout(fetchUrl, fetchHeaders, 20000);
  return parseKomikstationHtml(html);
}

// ─────────────────────────────────────────────────────────────────
// KOMIKSTATION HTML PARSER
// Struktur: <div class="bsx"> > <a href> > <div class="bigor">
//   > <div class="tt">Judul</div>
//   > <div class="adds"><div class="epxs">Chapter X</div>
//   > <div class="numscore">5.1</div>
//   Thumbnail: <img data-src="..." /> atau <img src="..." />
// ─────────────────────────────────────────────────────────────────

function parseKomikstationHtml(html) {
  if (!html || typeof html !== 'string') return [];

  const results = [];
  // Setiap item dibungkus <div class="bsx"> ... </div>
  const bsxRE = /<div\s+class="bsx">([\s\S]*?)(?=<div\s+class="bsx"|$)/gi;
  let block;

  while ((block = bsxRE.exec(html)) !== null) {
    const item = parseKomikstationItem(block[1]);
    if (item) results.push(item);
  }

  return results.length > 0 ? results : parseKomikstationFallback(html);
}

function parseKomikstationItem(content) {
  // Ambil URL & judul dari <a href="...">
  const linkMatch = content.match(/<a\s+href="(https?:\/\/komikstation\.org\/[^"]+)"[^>]*>/i);
  if (!linkMatch) return null;

  const url   = linkMatch[1];
  const slugM = url.match(/komikstation\.org\/([^/?#]+)\/?$/i);
  const slug  = slugM ? slugM[1] : '';

  // Judul dari <div class="tt"> atau <div class="titleheading"><h2>
  const titleM = content.match(/<div\s+class="tt"[^>]*>([^<]+)<\/div>/i)
              || content.match(/<h2[^>]*>([^<]+)<\/h2>/i);
  if (!titleM) return null;
  const title = titleM[1].trim();

  // Thumbnail — coba data-src dulu (lazy load), lalu src biasa
  const imgM = content.match(/<img[^>]+data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i)
            || content.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);
  const thumbnail = imgM ? imgM[1] : '';

  // Chapter terakhir dari <div class="epxs">
  const chapterM = content.match(/<div\s+class="epxs"[^>]*>([^<]+)<\/div>/i);
  const lastChapter = chapterM ? chapterM[1].trim() : '';

  // Score dari <div class="numscore">
  const scoreM = content.match(/<div\s+class="numscore"[^>]*>([^<]+)<\/div>/i);
  const score  = scoreM ? parseFloat(scoreM[1].trim()) || null : null;

  // Genre dari <span class="type ..."> atau meta info
  const typeM  = content.match(/<span\s+class="type[^"]*"[^>]*>([^<]+)<\/span>/i);
  const type   = typeM ? typeM[1].trim() : 'manga';

  return {
    id           : slug,
    title,
    slug,
    url,
    thumbnail,
    author       : '',
    genres       : [],
    synopsis     : '',
    status       : '',
    type,
    year         : null,
    rating       : '',
    score,
    lastChapter,
  };
}

function parseKomikstationFallback(html) {
  // Fallback: cari semua link manga dari domain komikstation.org
  const results = [];
  const seen    = new Set();
  const linkRE  = /<a\s+href="(https?:\/\/komikstation\.org\/[^"?#]+)"[^>]*>/gi;
  let m;

  while ((m = linkRE.exec(html)) !== null) {
    const url = m[1];
    // Hanya ambil URL yang kemungkinan halaman manga (bukan kategori/tag/page)
    if (seen.has(url)) continue;
    if (/\/(category|tag|page|wp-content|feed)\//i.test(url)) continue;
    seen.add(url);

    const slugM = url.match(/komikstation\.org\/([^/?#]+)\/?$/i);
    const slug  = slugM ? slugM[1] : '';

    // Cari thumbnail di sekitar link ini
    const before = html.slice(Math.max(0, m.index - 600), m.index);
    const imgM   = before.match(/<img[^>]+data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i)
                || before.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);

    // Cari judul di sekitar link ini
    const after    = html.slice(m.index, m.index + 400);
    const titleM   = after.match(/<div\s+class="tt"[^>]*>([^<]+)<\/div>/i)
                  || after.match(/<h2[^>]*>([^<]+)<\/h2>/i);
    const title    = titleM ? titleM[1].trim() : slug;

    if (!title || title.length < 2) continue;

    results.push({
      id          : slug,
      title,
      slug,
      url,
      thumbnail   : imgM ? imgM[1] : '',
      author      : '',
      genres      : [],
      synopsis    : '',
      status      : '',
      type        : 'manga',
      year        : null,
      rating      : '',
      score       : null,
      lastChapter : '',
    });
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
