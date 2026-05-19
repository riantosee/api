/**
 * app/api/anime/schedule/route.js
 * Jadwal tayang anime — Otakudesu via Sankavollerei API
 *
 * SCHEDULE:
 *   GET /api/anime/schedule           → semua hari
 *   GET /api/anime/schedule?day=Senin → filter hari tertentu
 *
 * Source: https://www.sankavollerei.com/anime/schedule
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────

const API_URL   = 'https://www.sankavollerei.com/anime/schedule';
const CACHE_TTL = 3600; // 1 jam — jadwal jarang berubah

const VALID_DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const day = (searchParams.get('day') || '').trim();

  // Validasi param ?day= jika ada
  if (day && !VALID_DAYS.includes(day)) {
    return errorResponse(
      400,
      `Parameter "day" tidak valid. Pilihan: ${VALID_DAYS.join(', ')}`
    );
  }

  const cacheKey = `anime:schedule:sankavollerei${day ? `:${day.toLowerCase()}` : ''}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const schedule = await fetchSchedule();

    const filtered = day
      ? schedule.filter(s => s.day === day)
      : schedule;

    const payload = {
      source   : 'sankavollerei',
      total    : filtered.length,
      schedule : filtered,
    };

    await cacheSet(cacheKey, payload, CACHE_TTL);
    return successResponse(payload);
  } catch (err) {
    console.error('[anime/schedule][sankavollerei]', err.message);
    return gatewayError(`Gagal mengambil jadwal anime: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────────

async function fetchSchedule() {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(API_URL, {
      signal  : controller.signal,
      headers : { 'Accept': 'application/json' },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();

    if (!Array.isArray(json.data)) {
      throw new Error('Format response tidak valid dari Sankavollerei');
    }

    return json.data.map(parseDay);
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// PARSER
//
// json.data shape:
// [
//   {
//     day        : "Senin",
//     anime_list : [
//       { title, slug, url, poster },
//       ...
//     ]
//   },
//   ...
// ]
// ─────────────────────────────────────────────────────────────────

function parseDay(item) {
  return {
    day       : item.day        || '',
    animeList : (item.anime_list || []).map(parseAnimeItem),
  };
}

function parseAnimeItem(item) {
  return {
    title  : item.title  || '',
    slug   : item.slug   || '',
    href   : item.url    || '',
    poster : item.poster || '',
  };
}
