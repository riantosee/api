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

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// API per hari — endpoint all-schedule hanya return data hari aktif saja
// Gunakan endpoint per hari: ?day=Monday, ?day=Tuesday, dst.
const SCHEDULE_API = (day) =>
  `https://v2.samehadaku.how/wp-json/custom/v1/all-schedule?day=${day}`;

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
    let schedule;

    if (day) {
      // Fetch satu hari saja
      const raw = await fetchScheduleByDay(day);
      schedule  = { [day]: raw };
    } else {
      // Fetch semua hari secara paralel
      const results = await Promise.all(
        VALID_DAYS.map(d => fetchScheduleByDay(d).then(items => [d, items]))
      );
      schedule = Object.fromEntries(results);
    }

    const payload = {
      source   : 'samehadaku',
      day      : day || 'all',
      schedule,
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

async function fetchScheduleByDay(day) {
  const targetUrl  = SCHEDULE_API(day);
  const scraperKey = process.env.SCRAPER_API_KEY;

  const fetchUrl = scraperKey
    ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(targetUrl)}&render=false`
    : targetUrl;

  const headers = scraperKey ? { 'Accept': 'application/json' } : BASE_HEADERS;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(fetchUrl, { signal: controller.signal, headers });
    if (!res.ok) return []; // hari kosong tidak throw error
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    return json.map(transformItem).filter(Boolean);
  } catch {
    return []; // jangan sampai satu hari gagal bikin semua gagal
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
