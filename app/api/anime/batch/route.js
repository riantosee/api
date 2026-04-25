/**
 * app/api/anime/batch/route.js
 * Daftar batch anime — Samehadaku
 *
 * BATCH:
 *   GET /api/anime/batch
 *   GET /api/anime/batch?page=2
 *
 * Source: https://v2.samehadaku.how/daftar-batch/
 * Paginasi: WordPress style /daftar-batch/page/N/
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  const cacheKey = `anime:batch:samehadaku:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const results = await fetchBatchSamehadaku(page);
    const payload = { page, source: 'samehadaku', total: results.length, results };
    await cacheSet(cacheKey, payload, 600); // cache 10 menit
    return successResponse(payload);
  } catch (err) {
    console.error('[anime/batch][samehadaku]', err.message);
    return gatewayError(`Gagal mengambil daftar batch: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────────

const BASE_HEADERS = {
  'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'     : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer'    : 'https://v2.samehadaku.how/',
};

async function fetchHtml(targetUrl) {
  const scraperKey = process.env.SCRAPER_API_KEY;

  const fetchUrl = scraperKey
    ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(targetUrl)}&render=false`
    : targetUrl;

  const headers = scraperKey ? {} : BASE_HEADERS;

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
// FETCH — https://v2.samehadaku.how/daftar-batch/
//          page > 1 → /daftar-batch/page/N/ (WordPress style)
// ─────────────────────────────────────────────────────────────────

async function fetchBatchSamehadaku(page) {
  const basePath = page > 1
    ? `https://v2.samehadaku.how/daftar-batch/page/${page}/`
    : 'https://v2.samehadaku.how/daftar-batch/';

  const html = await fetchHtml(basePath);
  return parseSamehadakuBatch(html);
}

// ─────────────────────────────────────────────────────────────────
// HTML PARSER — struktur animepost (sama dengan popular/genre)
//
// <div class='relat'>
//   <article id="post-49466" class="animpost ...">
//     <div class="animepost">
//       <div class="animposx">
//         <a rel="49466" href="https://v2.samehadaku.how/anime/slug/">
//           <div class="content-thumb">
//             <div class="ply"><i class="fa fa-play"></i></div>
//             <img src="..." />
//             <div class="score"><i class="fa f..."></i> 7.5</div>
//           </div>
//           <div class="data">
//             <div class="title"><h2>Yuusha-kei...</h2></div>
//             <div class="type">Completed</div>
//           </div>
//         </a>
//       </div>
//       <div class="stooltip">
//         <div class="title"><h4>Yuusha-kei ni Shosu...</h4></div>
//         <div class="metadata"><span class="sko...">...</span></div>
//         <div class="ttls"></div>
//         <div class="genres">
//           <div class="mta"><a href="...">Genre</a></div>
//         </div>
//       </div>
//     </div>
//   </article>
// </div>
// ─────────────────────────────────────────────────────────────────

function parseSamehadakuBatch(html) {
  if (!html || typeof html !== 'string') return [];

  const results = [];

  const articleRE = /<article\s[^>]*class="[^"]*animpost[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let block;

  while ((block = articleRE.exec(html)) !== null) {
    const item = parseSamehadakuBatchItem(block[1]);
    if (item) results.push(item);
  }

  return results.length > 0 ? results : parseSamehadakuBatchFallback(html);
}

function parseSamehadakuBatchItem(content) {
  // ── URL & id
  const linkMatch = content.match(
    /<a\s+rel="(\d+)"\s+href="(https?:\/\/v2\.samehadaku\.how\/(?:anime|batch)\/([^/"]+)\/?)"[^>]*>/i
  );
  if (!linkMatch) return null;

  const animeId = linkMatch[1] || '';
  const url     = linkMatch[2];
  const slug    = linkMatch[3] || '';

  // ── Judul
  const h2Match = content.match(/<div\s+class="title"[^>]*>\s*<h2[^>]*>\s*([^<]+?)\s*<\/h2>/i);
  const h4Match = content.match(/<div\s+class="stooltip"[\s\S]*?<h4[^>]*>\s*([^<]+?)\s*<\/h4>/i);
  const title   = (h2Match?.[1] || h4Match?.[1] || slug).trim();
  if (!title) return null;

  // ── Thumbnail
  const imgMatch  = content.match(/<div\s+class="content-thumb"[^>]*>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);
  const thumbnail = imgMatch?.[1] || '';

  // ── Score
  const scoreMatch = content.match(/<div\s+class="score"[^>]*>[\s\S]*?<\/i>\s*([\d.]+)\s*<\/div>/i);
  const score      = scoreMatch ? parseFloat(scoreMatch[1]) || null : null;

  // ── Status
  const typeMatch = content.match(/<div\s+class="type"[^>]*>\s*([^<]+?)\s*<\/div>/i);
  const status    = typeMatch ? typeMatch[1].trim() : '';

  // ── Synopsis
  const synopsisMatch = content.match(/<div\s+class="ttls"[^>]*>\s*([\s\S]*?)\s*<\/div>/i);
  const synopsis      = synopsisMatch ? synopsisMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // ── Genres
  const genresMatch = content.match(/<div\s+class="genres"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  const genres      = [];
  if (genresMatch) {
    const genreRE = /<a[^>]*>([^<]+)<\/a>/gi;
    let gm;
    while ((gm = genreRE.exec(genresMatch[1])) !== null) {
      genres.push(gm[1].trim());
    }
  }

  return {
    id        : animeId || slug,
    title,
    slug,
    url,
    thumbnail,
    type      : 'Batch',
    status,
    score,
    synopsis,
    genres,
    author    : '',
    year      : null,
  };
}

function parseSamehadakuBatchFallback(html) {
  const results = [];
  const seen    = new Set();
  const linkRE  = /<a\s+rel="\d+"\s+href="(https?:\/\/v2\.samehadaku\.how\/(?:anime|batch)\/([^/"?#]+)\/?)"[^>]*>/gi;
  let m;

  while ((m = linkRE.exec(html)) !== null) {
    const url  = m[1];
    const slug = m[2];
    if (!slug || seen.has(url)) continue;
    seen.add(url);

    const after      = html.slice(m.index, m.index + 800);
    const imgBefore  = html.slice(Math.max(0, m.index - 200), m.index + 200);
    const imgMatch   = imgBefore.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);
    const h2Match    = after.match(/<h2[^>]*>\s*([^<]+?)\s*<\/h2>/i);
    const typeMatch  = after.match(/<div\s+class="type"[^>]*>\s*([^<]+?)\s*<\/div>/i);
    const scoreMatch = after.match(/<div\s+class="score"[^>]*>[\s\S]*?<\/i>\s*([\d.]+)/i);

    results.push({
      id        : slug,
      title     : (h2Match?.[1] || slug).trim(),
      slug,
      url,
      thumbnail : imgMatch?.[1] || '',
      type      : 'Batch',
      status    : typeMatch ? typeMatch[1].trim() : '',
      score     : scoreMatch ? parseFloat(scoreMatch[1]) || null : null,
      synopsis  : '',
      genres    : [],
      author    : '',
      year      : null,
    });
  }

  return results;
}
