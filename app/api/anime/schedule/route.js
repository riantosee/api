/**
 * app/api/anime/schedule/route.js
 * Jadwal rilis anime — Samehadaku
 *
 * SCHEDULE:
 *   GET /api/anime/schedule          → semua jadwal
 *   GET /api/anime/schedule?day=Monday
 *   GET /api/anime/schedule?day=tuesday  (case-insensitive)
 *
 * Query params opsional:
 *   day — filter hari: Monday | Tuesday | Wednesday | Thursday | Friday | Saturday | Sunday
 *
 * Source API: https://v2.samehadaku.how/wp-json/custom/v1/all-schedule
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

const API_URL = 'https://v2.samehadaku.how/wp-json/custom/v1/all-schedule';

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const dayParam = (searchParams.get('day') || '').trim();

  // Validasi & normalize hari
  let day = '';
  if (dayParam) {
    day = VALID_DAYS.find(d => d.toLowerCase() === dayParam.toLowerCase());
    if (!day) {
      return errorResponse(400, `Hari tidak valid: "${dayParam}". Gunakan: ${VALID_DAYS.join(', ')}`);
    }
  }

  const cacheKey = `anime:schedule:samehadaku:${day || 'all'}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const raw     = await fetchSchedule();
    const grouped = groupByDay(raw);

    // Filter per hari jika ada
    const data = day
      ? { [day]: grouped[day] || [] }
      : grouped;

    const payload = {
      source   : 'samehadaku',
      day      : day || 'all',
      schedule : data,
    };

    await cacheSet(cacheKey, payload, 600); // cache 10 menit
    return successResponse(payload);
  } catch (err) {
    console.error('[anime/schedule][samehadaku]', err.message);
    return gatewayError(`Gagal mengambil jadwal: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH — langsung dari WP REST API (JSON, tidak perlu scraping)
// ─────────────────────────────────────────────────────────────────

const BASE_HEADERS = {
  'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'     : 'application/json',
  'Referer'    : 'https://v2.samehadaku.how/',
};

async function fetchSchedule() {
  const scraperKey = process.env.SCRAPER_API_KEY;

  const fetchUrl = scraperKey
    ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(API_URL)}&render=false`
    : API_URL;

  const headers = scraperKey ? { 'Accept': 'application/json' } : BASE_HEADERS;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(fetchUrl, { signal: controller.signal, headers });
    if (res.status === 403) throw new Error('Akses ditolak (403) — coba set SCRAPER_API_KEY');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    if (!Array.isArray(json)) throw new Error('Response bukan array JSON');
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// TRANSFORM & GROUP BY DAY
//
// Raw JSON field dari WP API:
// {
//   id, slug, date, author, type, title, url, content,
//   featured_img_src, genre, east_score, east_type,
//   east_schedule (hari), east_time
// }
// ─────────────────────────────────────────────────────────────────

function groupByDay(items) {
  // Init semua hari supaya urutan tetap konsisten
  const result = Object.fromEntries(VALID_DAYS.map(d => [d, []]));

  for (const item of items) {
    const anime = transformItem(item);
    if (!anime) continue;

    const day = normalizeDay(item.east_schedule);
    if (!day) continue;

    result[day].push(anime);
  }

  // Sort per hari berdasarkan east_time ascending
  for (const day of VALID_DAYS) {
    result[day].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }

  return result;
}

function transformItem(raw) {
  if (!raw || !raw.id) return null;

  return {
    id          : String(raw.id),
    slug        : raw.slug        || '',
    title       : raw.title       || '',
    url         : raw.url         || '',
    thumbnail   : raw.featured_img_src || '',
    type        : raw.east_type   || raw.type || 'TV',
    genre       : raw.genre       || '',
    score       : raw.east_score  ? parseFloat(raw.east_score) || null : null,
    day         : normalizeDay(raw.east_schedule) || raw.east_schedule || '',
    time        : raw.east_time   || '',
    synopsis    : raw.content
      ? raw.content.replace(/\\r\\n/g, ' ').replace(/\s+/g, ' ').trim()
      : '',
    author      : raw.author      || '',
    updatedAt   : raw.date        || '',
  };
}

function normalizeDay(raw) {
  if (!raw) return null;
  return VALID_DAYS.find(d => d.toLowerCase() === raw.toLowerCase()) || null;
}
