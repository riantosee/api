/**
 * app/api/anime/search/route.js
 * Search anime — Samehadaku only
 *
 * SEARCH:
 *   GET /api/anime/search?q=Naruto
 *   GET /api/anime/search?q=Naruto&page=2
 *
 * Source: https://v2.samehadaku.how
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

  const cacheKey = `anime:search:samehadaku:${query.toLowerCase()}:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const results = await searchSamehadaku(query, page);
    const payload = { query, page, source: 'samehadaku', total: results.length, results };
    await cacheSet(cacheKey, payload, 300);
    return successResponse(payload);
  } catch (err) {
    console.error('[anime/search][samehadaku]', err.message);
    return gatewayError(`Gagal mengambil hasil pencarian: ${err.message}`);
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
// SEARCH — https://v2.samehadaku.how/?s=query&page=N
// ─────────────────────────────────────────────────────────────────

async function searchSamehadaku(query, page) {
  const target = new URL('https://v2.samehadaku.how/');
  target.searchParams.set('s', query);
  if (page > 1) target.searchParams.set('page', page);

  const html = await fetchHtml(target.toString());
  return parseSamehadakuHtml(html);
}

// ─────────────────────────────────────────────────────────────────
// HTML PARSER — struktur animepost dari v2.samehadaku.how
//
// <article id="post-37451" class="animpost post-37451 ...">
//   <div class="animepost">
//     <div class="animosx">
//       <a rel="37451" href="https://v2.samehadaku.how/anime/slug/">
//         <div class="content-thumb">
//           <div class="ply"><i class="fa fa-play"></i></div>
//           <img src="https://v2.samehadaku.how/.../cover.jpg" />
//           <div class="score"><i class="...fa-star"></i> 7.5</div>
//         </div>
//         <div class="data">
//           <div class="title"><h2>Judul Anime</h2></div>
//           <div class="type">Completed</div>
//         </div>
//       </a>
//     </div>
//     <div class="stooltip">
//       <div class="title"><h4>Judul Anime</h4></div>
//       <div class="metadata"><span class="skor">...</span></div>
//       <div class="ttls">Synopsis singkat...</div>
//       <div class="genres">
//         <div class="mta"><a href="...">Action</a> ...</div>
//       </div>
//     </div>
//   </div>
// </article>
// ─────────────────────────────────────────────────────────────────

function parseSamehadakuHtml(html) {
  if (!html || typeof html !== 'string') return [];

  const results = [];

  // Pisahkan per <article class="animpost ...">
  const articleRE = /<article\s[^>]*class="[^"]*animpost[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let block;

  while ((block = articleRE.exec(html)) !== null) {
    const item = parseSamehadakuItem(block[1]);
    if (item) results.push(item);
  }

  return results.length > 0 ? results : parseSamehadakuFallback(html);
}

function parseSamehadakuItem(content) {
  // ── URL & rel (id) dari tag <a rel="ID" href="...">
  const linkMatch = content.match(
    /<a\s+rel="(\d+)"\s+href="(https?:\/\/v2\.samehadaku\.how\/anime\/([^/"]+)\/?)"[^>]*>/i
  );
  if (!linkMatch) return null;

  const animeId = linkMatch[1] || '';
  const url     = linkMatch[2];
  const slug    = linkMatch[3] || '';

  // ── Judul: prioritas <div class="title"><h2> → <div class="stooltip"> h4
  const h2Match  = content.match(/<div\s+class="title"[^>]*>\s*<h2[^>]*>\s*([^<]+?)\s*<\/h2>/i);
  const h4Match  = content.match(/<div\s+class="stooltip"[\s\S]*?<h4[^>]*>\s*([^<]+?)\s*<\/h4>/i);
  const title    = (h2Match?.[1] || h4Match?.[1] || slug).trim();
  if (!title) return null;

  // ── Thumbnail: <img src="..."> dalam div.content-thumb
  const imgMatch  = content.match(/<div\s+class="content-thumb"[^>]*>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);
  const thumbnail = imgMatch?.[1] || '';

  // ── Score: <div class="score">...<i ...></i> 7.5</div>
  const scoreMatch = content.match(/<div\s+class="score"[^>]*>[\s\S]*?<\/i>\s*([\d.]+)\s*<\/div>/i);
  const score      = scoreMatch ? parseFloat(scoreMatch[1]) || null : null;

  // ── Status/Type: <div class="type">Completed</div>
  const typeMatch = content.match(/<div\s+class="type"[^>]*>\s*([^<]+?)\s*<\/div>/i);
  const status    = typeMatch ? typeMatch[1].trim() : '';

  // ── Synopsis: <div class="ttls">...</div> dalam stooltip
  const synopsisMatch = content.match(/<div\s+class="ttls"[^>]*>\s*([\s\S]*?)\s*<\/div>/i);
  const synopsis      = synopsisMatch ? synopsisMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // ── Genres: <div class="genres"><div class="mta"><a>Genre</a>...
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
    id          : animeId || slug,
    title,
    slug,
    url,
    thumbnail,
    type        : 'Anime',
    status,
    score,
    synopsis,
    genres,
    author      : '',
    year        : null,
  };
}

function parseSamehadakuFallback(html) {
  // Fallback minimal: scan semua link /anime/slug/
  const results = [];
  const seen    = new Set();
  const linkRE  = /<a\s+(?:rel="\d+"\s+)?href="(https?:\/\/v2\.samehadaku\.how\/anime\/([^/"?#]+)\/?)"[^>]*>/gi;
  let m;

  while ((m = linkRE.exec(html)) !== null) {
    const url  = m[1];
    const slug = m[2];
    if (!slug || seen.has(url)) continue;
    seen.add(url);

    // Thumbnail: cari di area sekitar link
    const before    = html.slice(Math.max(0, m.index - 800), m.index);
    const imgMatch  = before.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);
    const thumbnail = imgMatch?.[1] || '';

    const after      = html.slice(m.index, m.index + 600);
    const h2Match    = after.match(/<h2[^>]*>\s*([^<]+?)\s*<\/h2>/i);
    const typeMatch  = after.match(/<div\s+class="type"[^>]*>\s*([^<]+?)\s*<\/div>/i);
    const scoreMatch = after.match(/<div\s+class="score"[^>]*>[\s\S]*?<\/i>\s*([\d.]+)/i);

    results.push({
      id          : slug,
      title       : (h2Match?.[1] || slug).trim(),
      slug,
      url,
      thumbnail,
      type        : 'Anime',
      status      : typeMatch ? typeMatch[1].trim() : '',
      score       : scoreMatch ? parseFloat(scoreMatch[1]) || null : null,
      synopsis    : '',
      genres      : [],
      author      : '',
      year        : null,
    });
  }

  return results;
}
