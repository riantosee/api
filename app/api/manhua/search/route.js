/**
 * app/api/manhua/search/route.js
 * Scraper Search — manhwaindo.my
 *
 * GET /api/manhua/search?q=solo+leveling
 * GET /api/manhua/search?q=solo+leveling&page=2
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

const BASE_URL = 'https://www.manhwaindo.my';

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
  const q    = (searchParams.get('q') || searchParams.get('query') || '').trim();
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  if (!q) return errorResponse(400, 'Parameter "q" diperlukan untuk pencarian.');

  const cacheKey = `manhua:search:${q}:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit && Array.isArray(hit) && hit.length > 0)
    return successResponse(hit, { fromCache: true, page, query: q });

  try {
    const url = page > 1
      ? `${BASE_URL}/page/${page}/?s=${encodeURIComponent(q)}`
      : `${BASE_URL}/?s=${encodeURIComponent(q)}`;

    const html    = await fetchPage(url);
    const results = extractSearch(html);

    if (!results.length) return errorResponse(404, `Tidak ada hasil untuk "${q}".`);

    await cacheSet(cacheKey, results, 300);
    return successResponse(results, { total: results.length, page, query: q, source: 'manhwaindo.my' });
  } catch (err) {
    return gatewayError(`Gagal search manhua: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const scraperKey = process.env.SCRAPER_API_KEY;
  const targetUrl  = scraperKey
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
  } finally { clearTimeout(timer); }
}

// ─────────────────────────────────────────────────────────────────
// PARSER
//
// Struktur dari gambar (/?s=Solo+leveling):
//   <div class="releases"><h1>Search 'Solo leveling'</h1></div>
//   <div class="listupd">
//     <div class="bs"><div class="bsx">
//       <a href="/series/solo-leveling-side-story/" title="Solo Leveling: Side Story">
//         <div class="limit">
//           <div class="ply"></div>
//           <span class="status Completed">Completed</span>
//           <span class="typename Manhwa">Manhwa</span>
//           <span class="colored"><i class="fas fa-palette"></i> Color</span>
//           <span class="hotx"><i class="fab fa-hotjar"></i></span>
//         </div>
//         <noscript><img src="http://kacu.gmbr.pro/.../thumbnail.jpg" .../></noscript>
//         <img src="data:image/svg..." data-src="http://kacu.gmbr.pro/.../thumbnail.jpg" class="lazyload..." />
//         <div class="bigor">
//           <div class="tt">Solo Leveling: Side Story</div>
//           <div class="adds">
//             <div class="epxs">Chapter 21 END</div>
//             <div class="rt">
//               <div class="rating">
//                 <div class="rating-prc"><div class="rtp"><div class="rtb"><span style="width:88%"></span></div></div></div>
//                 <div class="numscore">8.8</div>
//               </div>
//             </div>
//           </div>
//         </div>
//       </a>
//     </div></div>
//   </div>
// ─────────────────────────────────────────────────────────────────

function extractSearch(html) {
  const results = [];

  const articleRE = /<div\s+class="bsx"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let m;
  while ((m = articleRE.exec(html)) !== null) {
    const item = parseItem(m[1]);
    if (item) results.push(item);
  }

  return results;
}

function parseItem(block) {
  try {
    // URL & title
    const linkMatch = block.match(/<a\s+href="([^"]+)"\s+title="([^"]+)"/i);
    if (!linkMatch) return null;
    const url     = linkMatch[1];
    const title   = linkMatch[2];
    const slug    = url.split('/').filter(Boolean).pop();
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;

    // Thumbnail — data-src dulu, fallback noscript
    const lazySrc     = block.match(/data-src="(https?:\/\/[^"]+)"/i);
    const noscriptSrc = block.match(/<noscript>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+)"/i);
    const thumbnail   = lazySrc ? lazySrc[1] : (noscriptSrc ? noscriptSrc[1] : '');

    // Status — span.status (Completed / Ongoing)
    const statusMatch = block.match(/<span\s+class="status\s+([^"]+)">([^<]+)<\/span>/i);
    const status      = statusMatch ? statusMatch[2].trim() : '';

    // Type — span.typename
    const typeMatch = block.match(/<span\s+class="typename\s+([^"]+)">([^<]+)<\/span>/i);
    const type      = typeMatch ? typeMatch[2].trim() : '';

    // Colored & Hot
    const isColored = /class="colored"/i.test(block);
    const isHot     = /class="hotx"/i.test(block);

    // Title bersih dari div.tt
    const ttMatch    = block.match(/<div\s+class="tt">([^<]+)<\/div>/i);
    const titleClean = ttMatch ? ttMatch[1].trim() : title;

    // Chapter terbaru dari div.epxs
    const chapterMatch = block.match(/<div\s+class="epxs">([^<]+)<\/div>/i);
    const chapter      = chapterMatch ? chapterMatch[1].trim() : '';

    // Rating
    const ratingMatch = block.match(/<div\s+class="numscore">([^<]+)<\/div>/i);
    const rating      = ratingMatch ? parseFloat(ratingMatch[1]) : null;

    // Rating bar
    const barMatch  = block.match(/class="rtb"><span\s+style="width:([^"]+)"/i);
    const ratingBar = barMatch ? barMatch[1] : '';

    return {
      title:      titleClean,
      slug,
      url:        fullUrl,
      thumbnail,
      status,       // "Completed", "Ongoing"
      type,         // "Manhwa", "Manhua", dll
      is_colored:  isColored,
      is_hot:      isHot,
      chapter,      // "Chapter 21 END"
      rating,       // 8.8
      rating_bar:  ratingBar, // "88%"
      source:      'manhwaindo.my',
    };
  } catch { return null; }
}
