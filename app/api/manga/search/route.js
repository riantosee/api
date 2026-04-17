/**
 * app/api/manga/search/route.js
 * Search manga — Komikstation only
 *
 * SEARCH:
 *   GET /api/manga/search?q=Naruto
 *   GET /api/manga/search?q=Naruto&page=2
 *
 * Source: https://komikstation.org
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('q') || '').trim();
  const page  = Number(searchParams.get('page') || 1);

  if (!query) return errorResponse(400, 'Parameter "q" diperlukan. Contoh: ?q=Naruto');

  const cacheKey = `manga:search:komikstation:${query.toLowerCase()}:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const results = await searchKomikstation(query, page);
    const payload = { query, page, source: 'komikstation', total: results.length, results };
    await cacheSet(cacheKey, payload, 300);
    return successResponse(payload);
  } catch (err) {
    console.error('[manga/search][komikstation]', err.message);
    return gatewayError(`Gagal mengambil hasil pencarian: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER — shared headers & timeout
// ─────────────────────────────────────────────────────────────────

const BASE_HEADERS = {
  'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'     : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer'    : 'https://komikstation.org/',
};

async function fetchHtml(targetUrl) {
  const scraperKey = process.env.SCRAPER_API_KEY;

  const fetchUrl = scraperKey
    ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(targetUrl)}&render=false`
    : targetUrl;

  const headers  = scraperKey ? {} : BASE_HEADERS;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(fetchUrl, { signal: controller.signal, headers });
    if (res.status === 403) throw new Error('Akses ditolak (403) — coba set SCRAPER_API_KEY');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// SEARCH — https://komikstation.org/?s=query
// ─────────────────────────────────────────────────────────────────

async function searchKomikstation(query, page) {
  const target = new URL('https://komikstation.org/');
  target.searchParams.set('s', query);
  if (page > 1) target.searchParams.set('page', page);

  const html = await fetchHtml(target.toString());
  return parseKomikstationHtml(html);
}

// ─────────────────────────────────────────────────────────────────
// HTML PARSER — struktur bsx dari komikstation.org
//
// <div class="bs">
//   <div class="bsx">
//     <a href="https://komikstation.org/manga/slug/" title="Judul">
//       <div class="limit">
//         <span class="type Manga">Manga</span>
//         <noscript><img src="https://.../cover.jpg" /></noscript>
//         <img data-src="https://.../cover.jpg" class="lazyload ..." />
//       </div>
//       <div class="bigor">
//         <div class="tt"> Judul</div>
//         <div class="adds">
//           <div class="epxs">Chapter 46</div>
//           <div class="rt">
//             <div class="numscore">10</div>
//           </div>
//         </div>
//         <div class="titleheading"><h2>Judul</h2></div>
//       </div>
//     </a>
//   </div>
// </div>
// ─────────────────────────────────────────────────────────────────

function parseKomikstationHtml(html) {
  if (!html || typeof html !== 'string') return [];

  const results = [];
  const bsxRE = /<div\s+class="bsx">([\s\S]*?)(?=<div\s+class="bsx"|$)/gi;
  let block;

  while ((block = bsxRE.exec(html)) !== null) {
    const item = parseKomikstationItem(block[1]);
    if (item) results.push(item);
  }

  return results.length > 0 ? results : parseKomikstationFallback(html);
}

function parseKomikstationItem(content) {
  // ── URL & title dari tag <a href=".../manga/slug/" title="...">
  const linkMatch = content.match(
    /<a\s+href="(https?:\/\/komikstation\.org\/manga\/([^/"]+)\/?)"(?:[^>]*\btitle="([^"]*)")?[^>]*>/i
  );
  if (!linkMatch) return null;

  const url  = linkMatch[1];
  const slug = linkMatch[2] || '';
  // Skip halaman paginasi /manga/page/N/
  if (/^page$/i.test(slug)) return null;

  // Prioritas judul: atribut title="" → <div class="tt"> → <h2>
  let title = (linkMatch[3] || '').trim();
  if (!title) {
    const ttM = content.match(/<div\s+class="tt"[^>]*>\s*([^<]+?)\s*<\/div>/i)
             || content.match(/<h2[^>]*>\s*([^<]+?)\s*<\/h2>/i);
    title = ttM ? ttM[1].trim() : slug;
  }
  if (!title) return null;

  // ── Thumbnail
  // 1. <noscript><img src="..."> — gambar asli tanpa lazy load
  // 2. <img data-src="...">     — lazy load
  // 3. <img src="...komikstation..."> — fallback
  const noscriptM = content.match(/<noscript>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*>/i);
  const dataSrcM  = content.match(/<img[^>]+data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);
  const srcM      = content.match(/<img[^>]+src="(https?:\/\/komikstation\.org\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);
  const thumbnail = (noscriptM || dataSrcM || srcM)?.[1] || '';

  // ── Chapter terakhir: <div class="epxs">Chapter 46</div>
  const chapterM    = content.match(/<div\s+class="epxs"[^>]*>\s*([^<]+?)\s*<\/div>/i);
  const lastChapter = chapterM ? chapterM[1].trim() : '';

  // ── Score: <div class="numscore">10</div>
  const scoreM = content.match(/<div\s+class="numscore"[^>]*>\s*([^<]+?)\s*<\/div>/i);
  const score  = scoreM ? parseFloat(scoreM[1].trim()) || null : null;

  // ── Tipe: <span class="type Manga"> / Manhwa / Manhua dll
  const typeM = content.match(/<span\s+class="type\s+([^"]+)"[^>]*>([^<]*)<\/span>/i);
  const type  = typeM ? (typeM[2].trim() || typeM[1].trim()) : 'Manga';

  return {
    id          : slug,
    title,
    slug,
    url,
    thumbnail,
    type,
    lastChapter,
    score,
    author      : '',
    genres      : [],
    synopsis    : '',
    status      : '',
    year        : null,
  };
}

function parseKomikstationFallback(html) {
  // Fallback minimal: scan semua link /manga/slug/
  const results = [];
  const seen    = new Set();
  const linkRE  = /<a\s+href="(https?:\/\/komikstation\.org\/manga\/([^/"?#]+)\/?)"(?:[^>]*\btitle="([^"]*)")?[^>]*>/gi;
  let m;

  while ((m = linkRE.exec(html)) !== null) {
    const url  = m[1];
    const slug = m[2];
    if (!slug || seen.has(url)) continue;
    if (/^page$/i.test(slug)) continue;
    seen.add(url);

    const title = (m[3] || '').trim() || slug;

    // Thumbnail: cari di area sebelum/sesudah link
    const before    = html.slice(Math.max(0, m.index - 800), m.index);
    const noscriptM = before.match(/<noscript>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*>/i);
    const dataSrcM  = before.match(/<img[^>]+data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);
    const thumbnail = (noscriptM || dataSrcM)?.[1] || '';

    const after    = html.slice(m.index, m.index + 500);
    const chapterM = after.match(/<div\s+class="epxs"[^>]*>\s*([^<]+?)\s*<\/div>/i);
    const scoreM   = after.match(/<div\s+class="numscore"[^>]*>\s*([^<]+?)\s*<\/div>/i);

    results.push({
      id          : slug,
      title,
      slug,
      url,
      thumbnail,
      type        : 'Manga',
      lastChapter : chapterM ? chapterM[1].trim() : '',
      score       : scoreM   ? parseFloat(scoreM[1].trim()) || null : null,
      author      : '',
      genres      : [],
      synopsis    : '',
      status      : '',
      year        : null,
    });
  }

  return results;
}
