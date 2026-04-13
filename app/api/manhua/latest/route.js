/**
 * app/api/manhua/latest/route.js
 * Scraper "Project Update" — manhwaindo.my
 *
 * GET /api/manhua/latest          → halaman 1
 * GET /api/manhua/latest?page=2   → halaman berikutnya
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
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  const cacheKey = `manhua:latest:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) {
    const hasData = Array.isArray(hit) && hit.length > 0;
    if (hasData) return successResponse(hit, { fromCache: true, page });
  }

  try {
    // page 1 → homepage, page > 1 → /project-updates/page/N/
    const url = page > 1
      ? `${BASE_URL}/project-updates/page/${page}/`
      : `${BASE_URL}/`;

    const html    = await fetchPage(url);
    const results = page > 1
      ? extractFromListPage(html)
      : extractLatestFromHome(html);

    if (!results.length) return errorResponse(404, 'Data latest tidak ditemukan.');

    await cacheSet(cacheKey, results, 300);
    return successResponse(results, { total: results.length, page, source: 'manhwaindo.my' });
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
// PARSER — Homepage seksi "Project Update"
//
// Struktur dari gambar:
//   <div class="bixbox">
//     <div class="releases">
//       <h2>Project Update</h2>
//       <a class="vl" href="/project-updates/">View All</a>
//     </div>
//     <div class="listupd">
//       <div class="utao">
//         <div class="uta">
//           <div class="imgu">
//             <a rel="259423" class="series" href="/series/the-chosen-sss-rank/" title="The Chosen SSS-Rank">
//               <noscript><img src="https://i1.wp.com/.../c29f4538...jpg?resize=150,210" .../></noscript>
//               <img src="data:image/svg..." data-src="https://i1.wp.com/.../c29f4538...jpg?resize=150,210" class="lazyload..." />
//               <span class="hot">H</span>
//             </a>
//           </div>
//           <div class="luf">
//             <a class="series" href="/series/the-chosen-sss-rank/" title="The Chosen SSS-Rank">
//               <h4>The Chosen SSS-Rank</h4>
//             </a>
//             <ul class="Manga">
//               <li><a href="/the-chosen-sss-rank-chapter-36/">Ch. 36</a><span>47 menit ago</span></li>
//               <li><a href="/the-chosen-sss-rank-chapter-35/">Ch. 35</a><span>48 menit ago</span></li>
//               <li><a href="/the-chosen-sss-rank-chapter-34/">Ch. 34</a><span>2 minggu ago</span></li>
//             </ul>
//           </div>
//         </div>
//       </div>
//     </div>
//   </div>
// ─────────────────────────────────────────────────────────────────

function extractLatestFromHome(html) {
  const idx = html.search(/<h2[^>]*>\s*Project Update\s*<\/h2>/i);
  if (idx === -1) return [];
  const slice = html.slice(idx, idx + 80000);
  return parseUtaItems(slice);
}

function extractFromListPage(html) {
  return parseUtaItems(html);
}

function parseUtaItems(html) {
  const results = [];
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
    // URL & title dari a.series di imgu
    const linkMatch = block.match(/<a[^>]+class="series"[^>]+href="([^"]+)"[^>]+title="([^"]+)"/i)
                   || block.match(/<a[^>]+href="([^"]+)"[^>]+class="series"[^>]+title="([^"]+)"/i);
    if (!linkMatch) return null;

    const url   = linkMatch[1];
    const title = linkMatch[2];
    const slug  = url.split('/').filter(Boolean).pop();
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;

    // Manga ID dari rel="..."
    const relMatch = block.match(/rel="(\d+)"/i);
    const mangaId  = relMatch ? relMatch[1] : '';

    // Thumbnail — data-src (lazyload) dulu, fallback noscript
    const lazySrc     = block.match(/data-src="(https?:\/\/[^"]+)"/i);
    const noscriptSrc = block.match(/<noscript>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+)"/i);
    const thumbnail   = lazySrc ? lazySrc[1] : (noscriptSrc ? noscriptSrc[1] : '');

    // Hot badge
    const isHot = /<span\s+class="hot">/i.test(block);

    // Title bersih dari h4
    const h4Match    = block.match(/<h4[^>]*>([^<]+)<\/h4>/i);
    const titleClean = h4Match ? h4Match[1].trim() : title;

    // Type dari ul class (Manga / Manhwa / Manhua)
    const ulMatch = block.match(/<ul\s+class="([^"]+)">/i);
    const type    = ulMatch ? ulMatch[1].trim() : '';

    // Chapter list
    const chapters = [];
    if (ulMatch) {
      const ulContent = block.match(/<ul\s+class="[^"]*">([\s\S]*?)<\/ul>/i);
      if (ulContent) {
        const liRE = /<li>\s*<a\s+href="([^"]+)">([^<]+)<\/a>\s*<span>([^<]+)<\/span>\s*<\/li>/gi;
        let lm;
        while ((lm = liRE.exec(ulContent[1])) !== null) {
          const chUrl = lm[1].startsWith('http') ? lm[1] : `${BASE_URL}${lm[1]}`;
          chapters.push({
            url:      chUrl,
            chapter:  lm[2].trim(),   // "Ch. 36"
            time_ago: lm[3].trim(),   // "47 menit ago"
          });
        }
      }
    }

    return {
      title:    titleClean,
      slug,
      url:      fullUrl,
      manga_id: mangaId,
      thumbnail,
      type,       // "Manga", "Manhwa", "Manhua"
      is_hot:    isHot,
      chapters,   // 3 chapter terbaru
      source:    'manhwaindo.my',
    };
  } catch { return null; }
}
