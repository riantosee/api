/**
 * app/api/anime/complete/route.js
 * Daftar anime selesai — Otakudesu via Sankavollerei API
 *
 * COMPLETE:
 *   GET /api/anime/complete          → page 1
 *   GET /api/anime/complete?page=2   → page berikutnya
 *
 * Source: https://www.sankavollerei.com/anime/complete-anime?page=N
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────

const API_URL   = 'https://www.sankavollerei.com/anime/complete-anime';
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

  const cacheKey = `anime:complete:sankavollerei:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const data = await fetchComplete(page);
    await cacheSet(cacheKey, data, CACHE_TTL);
    return successResponse(data);
  } catch (err) {
    console.error('[anime/complete][sankavollerei]', err.message);
    return gatewayError(`Gagal mengambil daftar anime selesai: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────────

async function fetchComplete(page) {
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

    return parseComplete(page, json.data);
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
//       title, poster, episodes, score,
//       lastReleaseDate, animeId, href, otakudesuUrl
//     },
//     ...
//   ]
// }
// ─────────────────────────────────────────────────────────────────

function parseComplete(page, data) {
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
    animeId         : item.animeId         || '',
    title           : item.title           || '',
    poster          : item.poster          || '',
    episodes        : item.episodes        ?? null,
    score           : item.score           ? parseFloat(item.score) || null : null,
    lastReleaseDate : item.lastReleaseDate  || '',
    href            : item.href            || '',
  };
}
