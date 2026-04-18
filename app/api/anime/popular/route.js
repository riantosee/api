/**
 * app/api/anime/popular/route.js
 * Popular anime — Samehadaku only
 *
 * POPULAR:
 *   GET /api/anime/popular
 *   GET /api/anime/popular?page=2
 *
 * Source: https://v2.samehadaku.how/daftar-anime-{page}/?title&status&type&order=popular
 * Paginasi: ganti angka di path /daftar-anime-N/
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get('page') || 1);

  if (page < 1) return errorResponse(400, 'Parameter "page" harus >= 1');

  const cacheKey = `anime:popular:samehadaku:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const results = await fetchPopularSamehadaku(page);
    const payload = { page, source: 'samehadaku', total: results.length, results };
    await cacheSet(cacheKey, payload, 600); // cache 10 menit
    return successResponse(payload);
  } catch (err) {
    console.error('[anime/popular][samehadaku]', err.message);
    return gatewayError(`Gagal mengambil anime populer: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER — shared headers & timeout
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
// FETCH — https://v2.samehadaku.how/daftar-anime-{page}/
//          ?title&status&type&order=popular
// Paginasi via path: /daftar-anime-2/, /daftar-anime-3/, dst.
// ─────────────────────────────────────────────────────────────────

async function fetchPopularSamehadaku(page) {
  // Path tetap /daftar-anime-2/, halaman berikutnya pakai ?page=N
  const target = new URL('https://v2.samehadaku.how/daftar-anime-2/');
  target.searchParams.set('title', '');
  target.searchParams.set('status', '');
  target.searchParams.set('type', '');
  target.searchParams.set('order', 'popular');
  if (page > 1) target.searchParams.set('page', page);

  const html = await fetchHtml(target.toString());
  return parseSamehadakuPopular(html);
}

// ─────────────────────────────────────────────────────────────────
// HTML PARSER — struktur animepost (sama dengan halaman search)
//
// <div class='relat'>
//   <article id="post-460" class="animpost ...">
//     <div class="animepost">
//       <div class="animosx">
//         <a rel="460" href="https://v2.samehadaku.how/anime/slug/">
//           <div class="content-thumb">
//             <div class="ply"><i class="fa fa-play"></i></div>
//             <img src="https://v2.samehadaku.how/.../cover.jpg" />
//             <div class="score"><i class="fa f..."></i> 8.5</div>
//           </div>
//           <div class="data">
//             <div class="title"><h2>One Piece</h2></div>
//             <div class="type">Ongoing</div>
//           </div>
//         </a>
//       </div>
//       <div class="stooltip">
//         <div class="title"><h4>One Piece</h4></div>
//         <div class="metadata"><span class="sko...">...</span></div>
//         <div class="ttls">Gol D. Roger dikenal...</div>
//         <div class="genres">
//           <div class="mta"><a href="...">Action</a> ...</div>
//         </div>
//       </div>
//     </div>
//   </article>
// </div>
// ─────────────────────────────────────────────────────────────────

function parseSamehadakuPopular(html) {
  if (!html || typeof html !== 'string') return [];

  const results = [];

  // Scan per <article class="animpost ...">
  const articleRE = /<article\s[^>]*class="[^"]*animpost[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let block;

  while ((block = articleRE.exec(html)) !== null) {
    const item = parseSamehadakuPopularItem(block[1]);
    if (item) results.push(item);
  }

  return results.length > 0 ? results : parseSamehadakuPopularFallback(html);
}

function parseSamehadakuPopularItem(content) {
  // ── URL & id dari <a rel="ID" href="...">
  const linkMatch = content.match(
    /<a\s+rel="(\d+)"\s+href="(https?:\/\/v2\.samehadaku\.how\/anime\/([^/"]+)\/?)"[^>]*>/i
  );
  if (!linkMatch) return null;

  const animeId = linkMatch[1] || '';
  const url     = linkMatch[2];
  const slug    = linkMatch[3] || '';

  // ── Judul: div.data > div.title > h2 → stooltip h4
  const h2Match = content.match(/<div\s+class="title"[^>]*>\s*<h2[^>]*>\s*([^<]+?)\s*<\/h2>/i);
  const h4Match = content.match(/<div\s+class="stooltip"[\s\S]*?<h4[^>]*>\s*([^<]+?)\s*<\/h4>/i);
  const title   = (h2Match?.[1] || h4Match?.[1] || slug).trim();
  if (!title) return null;

  // ── Thumbnail dari div.content-thumb > img
  const imgMatch  = content.match(/<div\s+class="content-thumb"[^>]*>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);
  const thumbnail = imgMatch?.[1] || '';

  // ── Score dari div.score
  const scoreMatch = content.match(/<div\s+class="score"[^>]*>[\s\S]*?<\/i>\s*([\d.]+)\s*<\/div>/i);
  const score      = scoreMatch ? parseFloat(scoreMatch[1]) || null : null;

  // ── Status dari div.type
  const typeMatch = content.match(/<div\s+class="type"[^>]*>\s*([^<]+?)\s*<\/div>/i);
  const status    = typeMatch ? typeMatch[1].trim() : '';

  // ── Synopsis dari div.ttls dalam stooltip
  const synopsisMatch = content.match(/<div\s+class="ttls"[^>]*>\s*([\s\S]*?)\s*<\/div>/i);
  const synopsis      = synopsisMatch ? synopsisMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // ── Genres dari div.genres > div.mta > a
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
    type      : 'Anime',
    status,
    score,
    synopsis,
    genres,
    author    : '',
    year      : null,
  };
}

function parseSamehadakuPopularFallback(html) {
  // Fallback minimal: scan semua link /anime/slug/
  const results = [];
  const seen    = new Set();
  const linkRE  = /<a\s+rel="\d+"\s+href="(https?:\/\/v2\.samehadaku\.how\/anime\/([^/"?#]+)\/?)"[^>]*>/gi;
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
      type      : 'Anime',
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

