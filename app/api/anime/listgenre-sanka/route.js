/**
 * app/api/anime/genre/route.js
 * Daftar genre anime — Otakudesu via Sankavollerei API
 *
 * GENRE LIST:
 *   GET /api/anime/genre
 *
 * Source: https://www.sankavollerei.com/anime/genre
 */

import { cacheGet, cacheSet }                from '../../../lib/cache.js';
import { successResponse, gatewayError }     from '../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────

const API_URL   = 'https://www.sankavollerei.com/anime/genre';
const CACHE_TTL = 3600; // 1 jam — genre list jarang berubah

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET() {
  const cacheKey = 'anime:genre:sankavollerei';
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const data = await fetchGenre();
    await cacheSet(cacheKey, data, CACHE_TTL);
    return successResponse(data);
  } catch (err) {
    console.error('[anime/genre][sankavollerei]', err.message);
    return gatewayError(`Gagal mengambil daftar genre: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────────

async function fetchGenre() {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(API_URL, {
      signal  : controller.signal,
      headers : { 'Accept': 'application/json' },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();

    if (json.statusCode !== 200 || !json.data) {
      throw new Error(json.message || 'Response tidak valid dari Sankavollerei');
    }

    return parseGenre(json.data);
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// PARSER
//
// json.data shape:
// {
//   genreList: [
//     { title, genreId, href, otakudesuUrl },
//     ...
//   ]
// }
// ─────────────────────────────────────────────────────────────────

function parseGenre(data) {
  const genreList = (data.genreList || []).map(g => ({
    title   : g.title   || '',
    genreId : g.genreId || '',
    href    : g.href    || '',
  }));

  return {
    source    : 'sankavollerei',
    total     : genreList.length,
    genreList,
  };
}
