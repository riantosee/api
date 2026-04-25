/**
 * app/api/anime/detail/[slug]/route.js
 * Detail anime + list episode — Samehadaku
 *
 * DETAIL:
 *   GET /api/anime/detail/one-punch-man
 *   GET /api/anime/detail/naruto
 *
 * Source: https://v2.samehadaku.how/anime/{slug}/
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req, { params }) {
  const slug = (params.slug || '').trim().toLowerCase();
  if (!slug) return errorResponse(400, 'Slug tidak boleh kosong');

  const cacheKey = `anime:detail:samehadaku:${slug}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const detail = await fetchDetailSamehadaku(slug);
    await cacheSet(cacheKey, detail, 600); // cache 10 menit
    return successResponse(detail);
  } catch (err) {
    console.error(`[anime/detail/${slug}][samehadaku]`, err.message);
    return gatewayError(`Gagal mengambil detail anime: ${err.message}`);
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
    if (res.status === 404) throw new Error('Anime tidak ditemukan (404)');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH & PARSE DETAIL
// ─────────────────────────────────────────────────────────────────

async function fetchDetailSamehadaku(slug) {
  const html = await fetchHtml(`https://v2.samehadaku.how/anime/${slug}/`);
  return parseDetail(html, slug);
}

// ─────────────────────────────────────────────────────────────────
// PARSER
//
// ── INFO (div.infoanime) ──────────────────────────────────────────
// <div class="infoanime widget_senction">
//   <h2 class="entry-title">Nonton Anime One Punch Man</h2>
//   <div class="thumb">
//     <img src="https://v2.samehadaku.how/.../76049.jpg" />
//   </div>
//   <div class="infox">
//     <div class="desc">
//       <div class="entry-content entry-content-single">
//         <p>Synopsis...</p>
//       </div>
//     </div>
//     <div class="genre-info">
//       <a href=".../genre/action">Action</a>
//       <a href=".../genre/comedy">Comedy</a>
//     </div>
//   </div>
// </div>
//
// ── SPESIFIKASI (div.spe) ─────────────────────────────────────────
// <div class="spe">
//   <span><b>Japanese</b> ワンパンマン</span>
//   <span><b>Status</b> Completed</span>
//   <span><b>Type</b> TV</span>
//   <span><b>Source</b> Web manga</span>
//   <span><b>Duration</b> 24</span>
//   <span><b>Total Episode</b> 12+1+6</span>
//   <span><b>Season</b> <a href="...">Fall 2015</a></span>
//   <span><b>Studio</b> <a href="...">Madhouse</a></span>
//   <span><b>Producers</b> <a href="...">Prod1</a>, ...</span>
//   <span><b>Released:</b> Oct 5, 2015 to Dec 21, 2015</span>
// </div>
//
// ── EPISODE LIST (ul > li) ────────────────────────────────────────
// <li>
//   <div class="epsright">
//     <span class="eps"><a href="https://v2.samehadaku.how/one-punch-man-episode-12/">12</a></span>
//   </div>
//   <div class="epsleft">
//     <span class="lchx"><a href="...">One Punch Man Episode 12</a></span>
//     <span class="date">24 July 2023</span>
//   </div>
// </li>
// ─────────────────────────────────────────────────────────────────

function parseDetail(html, slug) {
  // ── Judul ──────────────────────────────────────────────────────
  const titleMatch = html.match(/<h2\s+class="entry-title"[^>]*>\s*([^<]+?)\s*<\/h2>/i);
  const rawTitle   = titleMatch ? titleMatch[1].trim() : '';
  // Hapus prefix "Nonton Anime " jika ada
  const title      = rawTitle.replace(/^Nonton\s+Anime\s+/i, '').trim();

  // ── Thumbnail ──────────────────────────────────────────────────
  const infoIdx    = html.indexOf('infoanime');
  const infoBlock  = infoIdx > -1 ? html.slice(infoIdx, infoIdx + 8000) : html;
  const imgMatch   = infoBlock.match(/<div\s+class="thumb"[^>]*>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);
  const thumbnail  = imgMatch?.[1] || '';

  // ── Synopsis ───────────────────────────────────────────────────
  const descMatch  = infoBlock.match(/<div\s+class="entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const synopsis   = descMatch
    ? descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : '';

  // ── Genres ─────────────────────────────────────────────────────
  const genreBlock = infoBlock.match(/<div\s+class="genre-info"[^>]*>([\s\S]*?)<\/div>/i);
  const genres     = [];
  if (genreBlock) {
    const gRE = /<a[^>]+>([^<]+)<\/a>/gi;
    let gm;
    while ((gm = gRE.exec(genreBlock[1])) !== null) {
      genres.push(gm[1].trim());
    }
  }

  // ── Spesifikasi dari div.spe ───────────────────────────────────
  const speMatch = infoBlock.match(/<div\s+class="spe"[^>]*>([\s\S]*?)<\/div>/i);
  const spe      = {};
  if (speMatch) {
    const spanRE = /<span[^>]*>\s*<b>([^<]+)<\/b>\s*([\s\S]*?)\s*<\/span>/gi;
    let sm;
    while ((sm = spanRE.exec(speMatch[1])) !== null) {
      const key = sm[1].replace(/:$/, '').trim().toLowerCase().replace(/\s+/g, '_');
      // Ambil text, strip HTML tags
      const val = sm[2].replace(/<[^>]+>/g, ', ').replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim();
      spe[key]  = val;
    }
  }

  // ── Episode List ───────────────────────────────────────────────
  // Cari area ul yang mengandung epsright/epsleft
  const epsIdx   = html.indexOf('class="eps"');
  const epsBlock = epsIdx > -1 ? html.slice(Math.max(0, epsIdx - 500), epsIdx + 50000) : '';
  const episodes = parseEpisodes(epsBlock);

  return {
    slug,
    title,
    url         : `https://v2.samehadaku.how/anime/${slug}/`,
    thumbnail,
    synopsis,
    genres,
    // Spesifikasi
    japanese    : spe['japanese']      || '',
    synonyms    : spe['synonyms']      || '',
    english     : spe['english']       || '',
    status      : spe['status']        || '',
    type        : spe['type']          || '',
    source      : spe['source']        || '',
    duration    : spe['duration']      || '',
    totalEpisode: spe['total_episode'] || '',
    season      : spe['season']        || '',
    studio      : spe['studio']        || '',
    producers   : spe['producers']     || '',
    released    : spe['released']      || '',
    // Episode
    episodeCount: episodes.length,
    episodes,
  };
}

// ─────────────────────────────────────────────────────────────────
// EPISODE PARSER
// ─────────────────────────────────────────────────────────────────

function parseEpisodes(block) {
  if (!block) return [];

  const episodes = [];
  const liRE     = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let li;

  while ((li = liRE.exec(block)) !== null) {
    const content = li[1];

    // Nomor episode dari span.eps > a
    const numMatch = content.match(/<span\s+class="eps"[^>]*>\s*<a[^>]+>(\d+(?:\.\d+)?)<\/a>/i);
    if (!numMatch) continue;
    const epNum = numMatch[1];

    // URL & judul dari span.lchx > a
    const lchxMatch = content.match(/<span\s+class="lchx"[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
    const epUrl     = lchxMatch?.[1] || '';
    const epTitle   = lchxMatch?.[2]?.trim() || '';

    // Tanggal dari span.date
    const dateMatch = content.match(/<span\s+class="date"[^>]*>([^<]+)<\/span>/i);
    const epDate    = dateMatch?.[1]?.trim() || '';

    if (!epUrl) continue;

    episodes.push({
      number : epNum,
      title  : epTitle,
      url    : epUrl,
      date   : epDate,
    });
  }

  return episodes;
}
