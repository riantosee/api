/**
 * app/api/manhua/latest/route.js
 * Scraper "Rilisan Terbaru" — 01.komiku.asia
 *
 * GET /api/manhua/latest          → halaman 1
 * GET /api/manhua/latest?page=2   → halaman berikutnya
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

const BASE_URL = 'https://01.komiku.asia';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
  'Referer': `${BASE_URL}/`,
  'Cache-Control': 'no-cache',
};

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  const cacheKey = `manhua:latest:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true, page });

  try {
    // page 1 → homepage, page > 1 → /manga/?order=update&page=N
    const url = page > 1
      ? `${BASE_URL}/manga/?order=update&page=${page}`
      : `${BASE_URL}/`;

    const html    = await fetchPage(url);
    const results = page > 1
      ? extractFromMangaPage(html)
      : extractLatestFromHome(html);

    if (!results.length) return errorResponse(404, 'Data latest tidak ditemukan.');

    await cacheSet(cacheKey, results, 300);
    return successResponse(results, { total: results.length, page, source: 'komiku.asia' });
  } catch (err) {
    return gatewayError(`Gagal ambil latest manhua: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const scraperKey = process.env.SCRAPER_API_KEY;

  const targetUrl = scraperKey
    ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(url)}&render=false`
    : url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(targetUrl, {
      signal:  controller.signal,
      headers: scraperKey ? {} : HEADERS,
    });
    if (res.status === 403) throw new Error('Akses Ditolak (403).');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// PARSER — Homepage (seksi "Rilisan Terbaru")
//
// Struktur dari gambar:
//   <div class="releases"><h2>Rilisan Terbaru</h2>
//     <a class="vl" href="/manga/?order=update">View All</a>
//   </div>
//   <div class="listupd">
//     <div class="utao styletwo">
//       <div class="uta">
//         <div class="imgu">
//           <a rel="180502" href="/manga/the-youngest-son-of-a-rich-family/" class="series" title="...">
//             <img src="https://...jpg" loading="lazy" ... />
//             <span class="type Manhwa"></span>
//           </a>
//         </div>
//         <div class="luf">
//           <a class="series" href="/manga/..." title="...">
//             <h4>The Youngest Son Of A Rich Family</h4>
//           </a>
//           <ul class="Manhwa">
//             <li><a href="/the-youngest-son-of-a-rich-family-chapter-198/">Chapter 198</a><span>12 jam lalu</span></li>
//             <li><a href="/...chapter-197/">Chapter 197</a><span>12 jam lalu</span></li>
//             <li><a href="/...chapter-196/">Chapter 196</a><span>2 minggu lalu</span></li>
//           </ul>
//           <span class="statusind Ongoing">...</span>
//         </div>
//       </div>
//     </div>
//   </div>
// ─────────────────────────────────────────────────────────────────

function extractLatestFromHome(html) {
  const results = [];

  const idx = html.search(/<h2[^>]*>\s*Rilisan Terbaru\s*<\/h2>/i);
  if (idx === -1) return results;

  const slice = html.slice(idx, idx + 80000);
  return parseUtaoItems(slice);
}

// Parser untuk halaman /manga/?order=update
function extractFromMangaPage(html) {
  return parseUtaoItems(html);
}

function parseUtaoItems(html) {
  const results = [];

  // Ambil tiap div.uta
  const utaRE = /<div\s+class="uta"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let m;
  while ((m = utaRE.exec(html)) !== null) {
    const item = parseUtaItem(m[1]);
    if (item) results.push(item);
  }

  return results;
}

function parseUtaItem(block) {
  try {
    // URL & title dari a.series di div.imgu
    const linkMatch = block.match(/<a[^>]+class="series"[^>]+href="([^"]+)"[^>]+title="([^"]+)"/i)
                   || block.match(/<a[^>]+href="([^"]+)"[^>]+class="series"[^>]+title="([^"]+)"/i);
    if (!linkMatch) return null;
    const url   = linkMatch[1];
    const title = linkMatch[2];
    const slug  = url.split('/').filter(Boolean).pop();

    // Pastikan URL lengkap
    const fullUrl = url.startsWith('http') ? url : `https://01.komiku.asia${url}`;

    // rel (ID manga)
    const relMatch = block.match(/rel="(\d+)"/i);
    const mangaId  = relMatch ? relMatch[1] : '';

    // Thumbnail
    const imgMatch = block.match(/<img\s+src="(https?:\/\/[^"]+)"[^>]*class="ts-post-image[^"]*"/i)
                  || block.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
    const thumbnail = imgMatch ? imgMatch[1] : '';

    // Type badge — span.type
    const typeMatch = block.match(/<span\s+class="type\s+([^"]+)"><\/span>/i);
    const type      = typeMatch ? typeMatch[1].trim() : '';

    // Title bersih dari h4
    const h4Match    = block.match(/<h4[^>]*>([^<]+)<\/h4>/i);
    const titleClean = h4Match ? h4Match[1].trim() : title;

    // Chapter list dari ul (class bisa "Manhwa", "Manhua", dll)
    const ulMatch = block.match(/<ul\s+class="[^"]*">([\s\S]*?)<\/ul>/i);
    const chapters = [];
    if (ulMatch) {
      const liRE = /<li>\s*<a\s+href="([^"]+)">([^<]+)<\/a>\s*<span>([^<]+)<\/span>\s*<\/li>/gi;
      let lm;
      while ((lm = liRE.exec(ulMatch[1])) !== null) {
        const chUrl = lm[1].startsWith('http') ? lm[1] : `https://01.komiku.asia${lm[1]}`;
        chapters.push({
          url:      chUrl,
          chapter:  lm[2].trim(),  // "Chapter 198"
          time_ago: lm[3].trim(),  // "12 jam lalu"
        });
      }
    }

    // Status dari span.statusind
    const statusMatch = block.match(/<span\s+class="statusind\s+([^"]+)">/i);
    const status      = statusMatch ? statusMatch[1].trim() : '';

    return {
      title:    titleClean,
      slug,
      url:      fullUrl,
      manga_id: mangaId,
      thumbnail,
      type,     // "Manhwa", "Manhua", dll
      status,   // "Ongoing", "Completed"
      chapters, // 3 chapter terbaru
      source:   'komiku.asia',
    };
  } catch { return null; }
}
