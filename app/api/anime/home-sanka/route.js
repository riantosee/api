/**
 * app/api/anime/home/route.js
 * Home anime — Otakudesu via Sankavollerei API
 *
 * HOME:
 *   GET /api/anime/home
 *
 * Source: https://www.sankavollerei.com/anime/home
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────

const API_URL    = 'https://www.sankavollerei.com/anime/home';
const CACHE_TTL  = 600; // 10 menit

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const cacheKey = 'anime:home:sankavollerei';
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const data = await fetchHome();
    await cacheSet(cacheKey, data, CACHE_TTL);
    return successResponse(data);
  } catch (err) {
    console.error('[anime/home][sankavollerei]', err.message);
    return gatewayError(`Gagal mengambil data home: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────────

async function fetchHome() {
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

    return parseHomeData(json.data);
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// PARSER
//
// json.data shape:
// {
//   ongoing   : { href, otakudesuUrl, animeList: [...] },
//   completed : { href, otakudesuUrl, animeList: [...] },
// }
//
// Each anime item:
// {
//   title, poster, episodes, releaseDay, latestReleaseDate,
//   animeId, href, otakudesuUrl
// }
// ─────────────────────────────────────────────────────────────────

function parseHomeData(data) {
  return {
    ongoing   : parseSection(data.ongoing),
    completed : parseSection(data.completed),
  };
}

function parseSection(section) {
  if (!section) return { href: '', animeList: [] };

  return {
    href      : section.href      || '',
    animeList : (section.animeList || []).map(parseAnimeItem),
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
    otakudesuUrl      : item.otakudesuUrl      || '',
  };
}
