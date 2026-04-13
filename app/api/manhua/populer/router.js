/**7
 * app/api/manhua/populer/route.js
 * Scraper "Popular Today" — manhwaindo.my
 *
 * GET /api/manhua/populer
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

export async function GET() {
  const cacheKey = `manhua:populer`;
  const hit = await cacheGet(cacheKey);
  if (hit) {
    const hasData = Array.isArray(hit) && hit.length > 0;
    if (hasData) return successResponse(hit, { fromCache: true });
  }

  try {
    const html    = await fetchPage(`${BASE_URL}/`);
    const results = extractPopular(html);

    if (!results.length) return errorResponse(404, 'Data popular tidak ditemukan.');

    await cacheSet(cacheKey, results, 600);
    return successResponse(results, { total: results.length, source: 'manhwaindo.my' });
  } catch (err) {
    return gatewayError(`Gagal ambil popular manhua: ${err.message}`);
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
// PARSER
//
// Struktur dari gambar:
//   <div class="bixbox hothome full">
//     <div class="releases"><h2>Popular Today</h2></div>
//     <div class="listupd popularslider">
//       <div class="popconslide">
//         <div class="bs"><div class="bsx">
//           <a href="https://www.manhwaindo.my/series/..." title="...">
//             <div class="limit">
//               <div class="ply"></div>
//               <span class="typename Manhwa">Manhwa</span>
//               <span class="colored"><i class="fas fa-palette"></i> Color</span>
//               <span class="hotx"><i class="fab fa-hotjar"></i></span>
//             </div>
//             <noscript>
//               <img src="http://kacu.gmbr.pro/uploads/manga-images/s/..." class="ts-post-image..." loading="lazy" />
//             </noscript>
//             <img src="data:image/svg..." data-src="http://kacu.gmbr.pro/uploads/..." class="lazyload ts-post-image..." />
//             <div class="bigor">
//               <div class="tt">Standard of Reincarnation ID</div>
//               <div class="adds">
//                 <div class="epxs">Chapter 176</div>
//                 <div class="rt">
//                   <div class="rating">
//                     <div class="rating-prc"><div class="rtp"><div class="rtb"><span style="width:80%"></span></div></div></div>
//                     <div class="numscore">8</div>
//                   </div>
//                 </div>
//               </div>
//             </div>
//           </a>
//         </div></div>
//       </div>
//     </div>
//   </div>
// ─────────────────────────────────────────────────────────────────

function extractPopular(html) {
  const results = [];

  // Cari seksi Popular Today
  const idx = html.search(/<h2[^>]*>\s*Popular Today\s*<\/h2>/i);
  if (idx === -1) return results;

  const slice = html.slice(idx, idx + 50000);

  // Parse tiap div.bsx
  const bsxRE = /<div\s+class="bsx"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let m;
  while ((m = bsxRE.exec(slice)) !== null) {
    const item = parseItem(m[1]);
    if (item) results.push(item);
    if (results.length >= 20) break;
  }

  return results;
}

function parseItem(block) {
  try {
    // URL & title
    const linkMatch = block.match(/<a\s+href="([^"]+)"\s+title="([^"]+)"/i);
    if (!linkMatch) return null;
    const url   = linkMatch[1];
    const title = linkMatch[2];
    const slug  = url.split('/').filter(Boolean).pop();

    // Thumbnail — prioritas: data-src (lazyload) → noscript img src
    const lazySrc    = block.match(/data-src="(https?:\/\/[^"]+)"/i);
    const noscriptSrc = block.match(/<noscript>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+)"/i);
    const thumbnail  = lazySrc ? lazySrc[1] : (noscriptSrc ? noscriptSrc[1] : '');

    // Type — span.typename
    const typeMatch = block.match(/<span\s+class="typename\s+([^"]+)">([^<]+)<\/span>/i);
    const type      = typeMatch ? typeMatch[2].trim() : '';

    // Colored
    const isColored = /class="colored"/i.test(block);

    // Hot badge
    const isHot = /class="hotx"/i.test(block);

    // Title bersih dari div.tt
    const ttMatch    = block.match(/<div\s+class="tt">([^<]+)<\/div>/i);
    const titleClean = ttMatch ? ttMatch[1].trim() : title;

    // Chapter terbaru
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
      url,
      thumbnail,
      type,         // "Manhwa", "Manhua", dll
      is_colored:  isColored,
      is_hot:      isHot,
      chapter,      // "Chapter 176"
      rating,       // 8
      rating_bar:  ratingBar, // "80%"
      source:      'manhwaindo.my',
    };
  } catch { return null; }
}
