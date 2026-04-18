/**
 * app/api/anime/genres/route.js
 * List genre anime — Samehadaku
 *
 * GET /api/anime/genres
 *
 * Genre diambil dari halaman filter /daftar-anime-2/
 * Source: https://v2.samehadaku.how
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// GENRE STATIS — dari halaman daftar-anime-2 (jarang berubah)
// Digunakan sebagai fallback jika scraping gagal
// ─────────────────────────────────────────────────────────────────

const STATIC_GENRES = [
  'Fantasy',
  'Action',
  'Adventure',
  'Comedy',
  'Shounen',
  'School',
  'Romance',
  'Drama',
  'Supernatural',
  'Isekai',
  'Sci-Fi',
  'Seinen',
  'Reincarnation',
  'Historical',
  'Mystery',
  'Super Power',
  'Harem',
  'Slice of Life',
  'Ecchi',
  'Sports',
];

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const cacheKey = 'anime:genres:samehadaku';
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const genres = await fetchGenresSamehadaku();
    const payload = {
      source : 'samehadaku',
      total  : genres.length,
      genres,
    };
    await cacheSet(cacheKey, payload, 3600); // cache 1 jam — genre jarang berubah
    return successResponse(payload);
  } catch (err) {
    console.error('[anime/genres][samehadaku]', err.message);

    // Fallback ke daftar statis jika scraping gagal
    const payload = {
      source   : 'samehadaku',
      total    : STATIC_GENRES.length,
      genres   : STATIC_GENRES.map(name => ({ name, slug: toSlug(name) })),
      fallback : true,
    };
    return successResponse(payload);
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH & PARSE GENRE dari halaman daftar-anime-2
//
// Struktur HTML filter genre:
// <div class="filter-genre"> / <div class="gnr"> / <ul class="genre">
//   <li><label><input type="checkbox" value="fantasy" />Fantasy</label></li>
//   ...
// </ul>
//
// Atau link genre langsung:
// <a href="https://v2.samehadaku.how/genre/fantasy/">Fantasy</a>
// ─────────────────────────────────────────────────────────────────

async function fetchGenresSamehadaku() {
  const html = await fetchHtml('https://v2.samehadaku.how/daftar-anime-2/?title&status&type&order=popular');
  return parseGenres(html);
}

function parseGenres(html) {
  if (!html || typeof html !== 'string') throw new Error('HTML kosong');

  const genres = [];
  const seen   = new Set();

  // Strategi 1: input checkbox genre
  // <input type="checkbox" name="genre[]" value="fantasy"> Fantasy
  const checkboxRE = /<input[^>]+name="genre(?:\[\])?\"[^>]+value="([^"]+)"[^>]*>[\s\S]*?([A-Za-z][A-Za-z\s\-]*?)(?=\s*<|\s*$)/gi;
  let m;
  while ((m = checkboxRE.exec(html)) !== null) {
    const slug = m[1].trim().toLowerCase();
    const name = m[2].trim();
    if (slug && name && !seen.has(slug)) {
      seen.add(slug);
      genres.push({ name, slug });
    }
  }

  if (genres.length > 0) return genres;

  // Strategi 2: link /genre/slug/
  const linkRE = /<a\s+href="https?:\/\/v2\.samehadaku\.how\/genre\/([^/"]+)\/"[^>]*>([^<]+)<\/a>/gi;
  while ((m = linkRE.exec(html)) !== null) {
    const slug = m[1].trim().toLowerCase();
    const name = m[2].trim();
    if (slug && name && !seen.has(slug) && !slug.includes('page')) {
      seen.add(slug);
      genres.push({ name, slug });
    }
  }

  if (genres.length > 0) return genres;

  // Strategi 3: label dalam form filter
  const labelRE = /<label[^>]*>\s*(?:<input[^>]*>\s*)?([A-Z][a-z\s\-]+)\s*<\/label>/gi;
  while ((m = labelRE.exec(html)) !== null) {
    const name = m[1].trim();
    const slug = toSlug(name);
    if (name.length > 2 && !seen.has(slug)) {
      seen.add(slug);
      genres.push({ name, slug });
    }
  }

  if (genres.length > 0) return genres;

  // Fallback ke daftar statis
  throw new Error('Tidak bisa parse genre dari HTML — gunakan fallback statis');
}

// ─────────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────────

function toSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
