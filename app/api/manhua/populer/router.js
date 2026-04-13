/**
 * app/api/manhua/popular/route.js
 * Scraper "Terpopuler Hari Ini" — 01.komiku.asia
 *
 * GET /api/manhua/popular
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

export async function GET() {
  const cacheKey = `manhua:popular`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const html    = await fetchPage(`${BASE_URL}/`);
    const results = extractPopular(html);

    if (!results.length) return errorResponse(404, 'Data popular tidak ditemukan.');

    await cacheSet(cacheKey, results, 600);
    return successResponse(results, { total: results.length, source: 'komiku.asia' });
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
//   <div class="releases"><h2>Terpopuler Hari Ini</h2></div>
//   <div class="listupd popularslider">
//     <div class="popconslide">
//       <div class="bs">
//         <div class="bsx">
//           <a href="https://01.komiku.asia/manga/only-i-have-an-ex-grade-summon/" title="...">
//             <div class="limit">
//               <div class="ply"></div>
//               <span class="type Manhwa"></span>
//               <span class="colored"><i class="fas fa-palette"></i> Warna</span>
//             </div>
//             <img src="https://...webp" class="ts-post-image..." title="..." alt="..." />
//             <div class="bigor">
//               <div class="tt">Only I Have An EX-Grade Summon</div>
//               <div class="adds">
//                 <div class="epxs">Chapter 20</div>
//                 <div class="rt">
//                   <div class="rating">
//                     <div class="rating-prc"><div class="rtp"><div class="rtb"><span style="width:70%"></span></div></div></div>
//                     <div class="numscore">7.00</div>
//                   </div>
//                 </div>
//               </div>
//             </div>
//           </a>
//         </div>
//       </div>
//     </div>
//   </div>
// ─────────────────────────────────────────────────────────────────

function extractPopular(html) {
  const results = [];

  // Cari seksi "Terpopuler Hari Ini"
  const idx = html.search(/<h2[^>]*>\s*Terpopuler Hari Ini\s*<\/h2>/i);
  if (idx === -1) return results;

  // Ambil dari situ, cukup 40k char
  const slice = html.slice(idx, idx + 40000);

  // Parse tiap div.bs
  const bsRE = /<div\s+class="bs"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let m;
  while ((m = bsRE.exec(slice)) !== null) {
    const item = parseItem(m[1]);
    if (item) results.push(item);
    if (results.length >= 20) break;
  }

  return results;
}

function parseItem(block) {
  try {
    // URL & title dari <a>
    const linkMatch = block.match(/<a\s+href="([^"]+)"\s+title="([^"]+)"/i);
    if (!linkMatch) return null;
    const url   = linkMatch[1];
    const title = linkMatch[2];
    const slug  = url.split('/').filter(Boolean).pop();

    // Thumbnail — src langsung (bukan lazy)
    const imgMatch = block.match(/<img\s+src="(https?:\/\/[^"]+)"[^>]*class="ts-post-image[^"]*"/i)
                  || block.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
    const thumbnail = imgMatch ? imgMatch[1] : '';

    // Type badge — span.type (Manhwa / Manhua / Manga)
    const typeMatch = block.match(/<span\s+class="type\s+([^"]+)"><\/span>/i);
    const type      = typeMatch ? typeMatch[1].trim() : '';

    // Colored badge
    const isColored = /class="colored"/i.test(block);

    // Title bersih dari div.tt
    const ttMatch    = block.match(/<div\s+class="tt">([^<]+)<\/div>/i);
    const titleClean = ttMatch ? ttMatch[1].trim() : title;

    // Chapter terbaru dari div.epxs
    const chapterMatch = block.match(/<div\s+class="epxs">([^<]+)<\/div>/i);
    const chapter      = chapterMatch ? chapterMatch[1].trim() : '';

    // Rating dari div.numscore
    const ratingMatch = block.match(/<div\s+class="numscore">([^<]+)<\/div>/i);
    const rating      = ratingMatch ? parseFloat(ratingMatch[1]) : null;

    // Rating bar width dari span style
    const barMatch = block.match(/class="rtb"><span\s+style="width:([^"]+)"/i);
    const ratingBar = barMatch ? barMatch[1] : '';

    return {
      title:    titleClean,
      slug,
      url,
      thumbnail,
      type,           // "Manhwa", "Manhua", dll
      is_colored: isColored,
      chapter,        // "Chapter 20"
      rating,         // 7.00
      rating_bar: ratingBar, // "70%"
      source:     'komiku.asia',
    };
  } catch { return null; }
}
