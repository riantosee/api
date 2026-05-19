/**
 * app/api/anime/ongoing/route.js
 * Daftar anime ongoing — Otakudesu via Sankavollerei API
 *
 * ONGOING:
 *   GET /api/anime/ongoing          → page 1
 *   GET /api/anime/ongoing?page=2   → page berikutnya
 *
 * Source: https://www.sankavollerei.com/anime/ongoing-anime?page=N
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────

const API_URL   = 'https://www.sankavollerei.com/anime/ongoing-anime';
const CACHE_TTL = 600; // 10 menit

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get('page') || 1);

  if (!Number.isInteger(page) || page < 1) {
    return errorResponse(400, 'Parameter "page" harus berupa angka positif. Contoh: ?page=2');
  }

  const cacheKey = `anime:ongoing:sankavollerei:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const data = await fetchOngoing(page);
    await cacheSet(cacheKey, data, CACHE_TTL);
    return successResponse(data);
  } catch (err) {
    console.error('[anime/ongoing][sankavollerei]', err.message);
    return gatewayError(`Gagal mengambil daftar anime ongoing: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────────

async function fetchOngoing(page) {
  const url        = `${API_URL}?page=${page}`;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      signal  : controller.signal,
      headers : { 'Accept': 'application/json' },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();

    if (json.statusCode !== 200 || !json.data) {
      throw new Error(json.message || 'Response tidak valid dari Sankavollerei');
    }

    return parseOngoing(page, json.data);
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// PARSER
//
// json.data shape:
// {
//   animeList: [
//     {
//       title, poster, episodes, releaseDay,
//       latestReleaseDate, animeId, href, otakudesuUrl
//     },
//     ...
//   ]
// }
// ─────────────────────────────────────────────────────────────────

function parseOngoing(page, data) {
  const animeList = (data.animeList || []).map(parseAnimeItem);

  return {
    source    : 'sankavollerei',
    page,
    total     : animeList.length,
    animeList,
  };
}

function parseAnimeItem(item) {
  return {
    animeId           : item.animeId           || '',
    title             : item.title             || '',
    poster            : item.poster            || '',
    episodes          : item.episodes          ?? null,
    releaseDay        : item.releaseDay        || '',
    latestReleaseDate : item.latestReleaseDate || '',
    href              : item.href              || '',
  };
}
