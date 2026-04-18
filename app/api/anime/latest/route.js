/**
 * app/api/anime/latest/route.js
 * Latest episode anime — Samehadaku only
 *
 * LATEST:
 *   GET /api/anime/latest
 *   GET /api/anime/latest?page=2
 *
 * Source: https://v2.samehadaku.how/anime-terbaru/
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get('page') || 1);

  const cacheKey = `anime:latest:samehadaku:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const results = await fetchLatestSamehadaku(page);
    const payload = { page, source: 'samehadaku', total: results.length, results };
    await cacheSet(cacheKey, payload, 120); // cache 2 menit — data cepat berubah
    return successResponse(payload);
  } catch (err) {
    console.error('[anime/latest][samehadaku]', err.message);
    return gatewayError(`Gagal mengambil episode terbaru: ${err.message}`);
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
// FETCH — https://v2.samehadaku.how/anime-terbaru/?page=N
// ─────────────────────────────────────────────────────────────────

async function fetchLatestSamehadaku(page) {
  const target = new URL('https://v2.samehadaku.how/anime-terbaru/');
  if (page > 1) target.searchParams.set('page', page);

  const html = await fetchHtml(target.toString());
  return parseSamehadakuLatest(html);
}

// ─────────────────────────────────────────────────────────────────
// HTML PARSER — struktur post-show dari anime-terbaru
//
// <div class="post-show"><ul>
//   <li itemscope="itemscope" itemtype="http://schema.org/...">
//     <div class="thumb">
//       <div class="loader"></div>
//       <a href="https://v2.samehadaku.how/anime/slug-episode-N/">
//         <img src="https://v2.samehadaku.how/wp-content/.../thumb.jpg" />
//       </a>
//     </div>
//     <div class="dtla">
//       <h2 class="entry-title" itemprop="headline">
//         <a href="...">Judul Anime Episode N</a>
//       </h2>
//       <span><i class="dashicons dashicons-controls-play"></i> Episode N</span>
//       <span itemprop="author" itemscope itemtype="...">
//         <span><i class="dashicons dashicons-..."></i> Studio / Author</span>
//       </span>
//     </div>
//   </li>
//   ...
// </ul></div>
// ─────────────────────────────────────────────────────────────────

function parseSamehadakuLatest(html) {
  if (!html || typeof html !== 'string') return [];

  const results = [];

  // Ambil section post-show dulu supaya regex tidak salah scan area lain
  const sectionMatch = html.match(/<div\s+class="post-show">([\s\S]*?)<\/div>\s*<\/div>/i)
                    || html.match(/<div\s+class="post-show">([\s\S]*)/i);
  const section = sectionMatch ? sectionMatch[1] : html;

  // Pisah per <li itemscope>
  const liRE = /<li\s+itemscope[^>]*>([\s\S]*?)<\/li>/gi;
  let block;

  while ((block = liRE.exec(section)) !== null) {
    const item = parseSamehadakuLatestItem(block[1]);
    if (item) results.push(item);
  }

  return results.length > 0 ? results : parseSamehadakuLatestFallback(html);
}

function parseSamehadakuLatestItem(content) {
  // ── URL episode dari div.thumb > a
  const thumbLinkMatch = content.match(
    /<div\s+class="thumb"[^>]*>[\s\S]*?<a\s+href="(https?:\/\/v2\.samehadaku\.how\/anime\/([^/"]+)\/?)"[^>]*>/i
  );
  if (!thumbLinkMatch) return null;

  const episodeUrl = thumbLinkMatch[1];
  const rawSlug    = thumbLinkMatch[2] || '';

  // ── Thumbnail dari div.thumb > a > img
  const imgMatch  = content.match(/<div\s+class="thumb"[^>]*>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);
  const thumbnail = imgMatch?.[1] || '';

  // ── Judul & URL canonical dari div.dtla > h2 > a
  const titleMatch = content.match(/<h2\s[^>]*class="entry-title"[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/i);
  const fullTitle  = (titleMatch?.[2] || rawSlug).trim();
  const animeUrl   = titleMatch?.[1] || episodeUrl;

  if (!fullTitle) return null;

  // ── Pisah judul anime & nomor episode
  // Pola umum: "Judul Anime Episode 12" / "Judul Anime Ep. 12" / "Judul Anime Sub Indo"
  const epNumMatch  = fullTitle.match(/(?:Episode|Ep\.?)\s*(\d+(?:\.\d+)?)/i);
  const episodeNum  = epNumMatch ? epNumMatch[1] : null;
  const animeTitle  = epNumMatch
    ? fullTitle.slice(0, epNumMatch.index).trim().replace(/[-–]\s*$/, '').trim()
    : fullTitle;

  // ── Slug anime bersih (tanpa "-episode-N")
  const animeSlug = rawSlug
    .replace(/-episode-[\d-]+$/i, '')
    .replace(/-ep-[\d-]+$/i, '')
    .trim();

  // ── Author / Studio dari span[itemprop="author"]
  const authorMatch = content.match(/<span\s[^>]*itemprop="author"[^>]*>[\s\S]*?<\/i>\s*([^<]+?)\s*<\/span>/i);
  const author      = authorMatch ? authorMatch[1].trim() : '';

  // ── Label episode dari span sebelum author: "Episode N" / "Movie" dll
  const epLabelMatch = content.match(/<span[^>]*>\s*<i\s+class="dashicons[^"]*controls-play[^"]*"[^>]*><\/i>\s*([^<]+?)\s*<\/span>/i);
  const episodeLabel = epLabelMatch ? epLabelMatch[1].trim() : (episodeNum ? `Episode ${episodeNum}` : '');

  return {
    id           : rawSlug,
    animeTitle,
    animeSlug,
    animeUrl     : `https://v2.samehadaku.how/anime/${animeSlug}/`,
    episodeUrl,
    episodeNum,
    episodeLabel,
    thumbnail,
    author,
    type         : 'Anime',
  };
}

function parseSamehadakuLatestFallback(html) {
  // Fallback minimal: scan semua link /anime/slug/ di area post-show
  const results = [];
  const seen    = new Set();
  const linkRE  = /<a\s+href="(https?:\/\/v2\.samehadaku\.how\/anime\/([^/"?#]+)\/?)"[^>]*>/gi;
  let m;

  while ((m = linkRE.exec(html)) !== null) {
    const url  = m[1];
    const slug = m[2];
    if (!slug || seen.has(url)) continue;
    seen.add(url);

    const after      = html.slice(m.index, m.index + 500);
    const titleMatch = after.match(/<h2[^>]*>[\s\S]*?<a[^>]*>\s*([^<]+?)\s*<\/a>/i);
    const imgBefore  = html.slice(Math.max(0, m.index - 600), m.index);
    const imgMatch   = imgBefore.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);

    const fullTitle  = (titleMatch?.[1] || slug).trim();
    const epNumMatch = fullTitle.match(/(?:Episode|Ep\.?)\s*(\d+(?:\.\d+)?)/i);
    const animeTitle = epNumMatch
      ? fullTitle.slice(0, epNumMatch.index).trim().replace(/[-–]\s*$/, '').trim()
      : fullTitle;
    const animeSlug  = slug.replace(/-episode-[\d-]+$/i, '').replace(/-ep-[\d-]+$/i, '').trim();

    results.push({
      id           : slug,
      animeTitle,
      animeSlug,
      animeUrl     : `https://v2.samehadaku.how/anime/${animeSlug}/`,
      episodeUrl   : url,
      episodeNum   : epNumMatch?.[1] || null,
      episodeLabel : epNumMatch ? `Episode ${epNumMatch[1]}` : '',
      thumbnail    : imgMatch?.[1] || '',
      author       : '',
      type         : 'Anime',
    });
  }

  return results;
}
