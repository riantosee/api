/**
 * app/api/manga/search/route.js
 * Search manga — komiku.org
 *
 * GET /api/manga/search?q=Naruto
 * GET /api/manga/search?q=One+Piece&page=2
 *
 * Tidak pakai provider/registry — langsung fetch ke api.komiku.org
 * dengan header HX-Request: true (wajib, tanpa ini hasil kosong karena HTMX).
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

const KOMIKU_API = 'https://api.komiku.org';

const HEADERS = {
  'User-Agent'      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'          : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language' : 'id-ID,id;q=0.9,en-US;q=0.8',
  'Referer'         : 'https://komiku.org/',
  'HX-Request'      : 'true',    // ← kunci utama agar server kembalikan hasil
  'HX-Trigger'      : 'revealed',
  'HX-Current-URL'  : 'https://komiku.org/',
  'Cache-Control'   : 'no-cache',
};

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('q') || '').trim();
  const page  = Number(searchParams.get('page') || 1);

  if (!query) return errorResponse(400, 'Parameter "q" diperlukan. Contoh: ?q=Naruto');

  const cacheKey = `manga:search:${query.toLowerCase()}:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  // Coba semua strategi secara berurutan sampai ada yang berhasil
  const strategies = [
    () => fetchHtmx(query, page),
    () => fetchMainPage(query, page),
    () => fetchWithScraperApi(query, page),
  ];

  let lastError = null;

  for (const strategy of strategies) {
    try {
      const html = await strategy();
      if (!html) continue;

      const results = parseResults(html);
      if (results.length === 0) continue;   // coba strategi berikutnya

      const payload = { query, page, total: results.length, results };
      await cacheSet(cacheKey, payload, 300);
      return successResponse(payload, { source: 'komiku.org' });
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  console.error('[manga/search] Semua strategi gagal:', lastError?.message);
  return gatewayError('Gagal mengambil hasil pencarian manga.');
}

// ─────────────────────────────────────────────────────────────────
// STRATEGI 1 — Hit HTMX endpoint langsung (api.komiku.org)
// Ini cara yang benar karena komiku.org lazy-load via HTMX
// ─────────────────────────────────────────────────────────────────

async function fetchHtmx(query, page) {
  const url = new URL(`${KOMIKU_API}/`);
  url.searchParams.set('post_type', 'manga');
  url.searchParams.set('s', query);
  if (page > 1) url.searchParams.set('page', page);

  const res = await fetchWithTimeout(url.toString(), HEADERS, 10000);
  return res;
}

// ─────────────────────────────────────────────────────────────────
// STRATEGI 2 — Hit halaman utama komiku.org (fallback)
// ─────────────────────────────────────────────────────────────────

async function fetchMainPage(query, page) {
  const url = new URL('https://komiku.org/');
  url.searchParams.set('post_type', 'manga');
  url.searchParams.set('s', query);
  if (page > 1) url.searchParams.set('page', page);

  const res = await fetchWithTimeout(url.toString(), HEADERS, 12000);
  return res;
}

// ─────────────────────────────────────────────────────────────────
// STRATEGI 3 — Via ScraperAPI (jika env SCRAPER_API_KEY tersedia)
// ─────────────────────────────────────────────────────────────────

async function fetchWithScraperApi(query, page) {
  const scraperKey = process.env.SCRAPER_API_KEY;
  if (!scraperKey) throw new Error('SCRAPER_API_KEY tidak tersedia');

  const target = new URL(`${KOMIKU_API}/`);
  target.searchParams.set('post_type', 'manga');
  target.searchParams.set('s', query);
  if (page > 1) target.searchParams.set('page', page);

  const scraperUrl = `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(target.toString())}&render=false`;
  return await fetchWithTimeout(scraperUrl, {}, 20000);
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER — dengan timeout & error handling
// ─────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal, headers });

    if (res.status === 403) throw new Error('Akses ditolak (403)');
    if (res.status === 404) throw new Error('Halaman tidak ditemukan (404)');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// PARSER
//
// Response HTMX dari api.komiku.org adalah HTML fragment.
// Struktur tiap item:
//
//   <div class="bge">
//     <div class="bgei">
//       <a href="https://komiku.org/manga/naruto/">
//         <img src="https://thumbnail.komiku.id/...Komik-Naruto.jpg" alt="..." />
//       </a>
//     </div>
//     <div class="kan">
//       <h3><a href="https://komiku.org/manga/naruto/">Naruto</a></h3>
//       <p class="jdl2">Genre: Aksi, Petualangan</p>
//       <p>Sinopsis...</p>
//       <table>
//         <tr>
//           <td>Status:</td><td>Completed</td>
//           <td>Jenis:</td><td>Manga</td>
//         </tr>
//       </table>
//     </div>
//   </div>
// ─────────────────────────────────────────────────────────────────

function parseResults(html) {
  if (!html || typeof html !== 'string') return [];

  const results = [];

  // Isolasi tiap blok .bge
  const bgeRE = /<div\s+class="bge">([\s\S]*?)(?=<div\s+class="bge"|$)/gi;
  let block;

  while ((block = bgeRE.exec(html)) !== null) {
    const item = parseItem(block[1]);
    if (item) results.push(item);
  }

  // Fallback jika struktur berbeda
  return results.length > 0 ? results : parseFallback(html);
}

function parseItem(content) {
  // URL & Judul
  const linkMatch = content.match(/<h3[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/i)
                 || content.match(/<a\s+href="(https?:\/\/komiku\.org\/manga\/[^"]+)"[^>]*>([^<]{2,})<\/a>/i);
  if (!linkMatch) return null;

  const url   = linkMatch[1];
  const title = linkMatch[2].trim();

  const slugMatch = url.match(/\/manga\/([^/]+)\/?$/i);
  const slug      = slugMatch ? slugMatch[1] : '';

  const imgMatch  = content.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"[^>]*>/i);
  const thumbnail = imgMatch ? imgMatch[1] : '';

  const genreMatch = content.match(/<p\s+class="jdl2"[^>]*>([^<]+)<\/p>/i);
  const genres     = genreMatch
    ? genreMatch[1].replace(/^Genre:\s*/i, '').split(',').map(g => g.trim()).filter(Boolean)
    : [];

  const synopsisMatch = content.match(/<p\s+class="jdl2"[^>]*>[^<]+<\/p>\s*<p[^>]*>([^<]+)<\/p>/i);
  const synopsis      = synopsisMatch ? synopsisMatch[1].trim() : '';

  const statusMatch = content.match(/Status:\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
  const typeMatch   = content.match(/Jenis:\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);

  return {
    id        : slug,
    title,
    url,
    slug,
    thumbnail,
    genres,
    synopsis,
    status    : statusMatch ? statusMatch[1].trim() : '',
    type      : typeMatch   ? typeMatch[1].trim()   : '',
  };
}

function parseFallback(html) {
  const results = [];
  const seen    = new Set();

  const linkRE = /<a\s+href="(https?:\/\/komiku\.org\/manga\/[^"]+)"[^>]*>([^<]{3,})<\/a>/gi;
  let m;

  while ((m = linkRE.exec(html)) !== null) {
    const url   = m[1];
    const title = m[2].trim();
    if (seen.has(url)) continue;
    seen.add(url);

    const before   = html.slice(Math.max(0, m.index - 400), m.index);
    const imgMatch = before.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"[^>]*/i);
    const slugM    = url.match(/\/manga\/([^/]+)\/?$/i);

    results.push({
      id        : slugM   ? slugM[1]    : '',
      title,
      url,
      slug      : slugM   ? slugM[1]    : '',
      thumbnail : imgMatch ? imgMatch[1] : '',
      genres    : [],
      synopsis  : '',
      status    : '',
      type      : '',
    });
  }

  return results;
}
