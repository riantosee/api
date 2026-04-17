/**
 * app/api/manga/latest/route.js
 * Manga chapter terbaru — via API resmi api.komiku.org
 *
 * GET /api/manga/latest
 * GET /api/manga/latest?page=2
 *
 * Sumber API:
 *   https://api.komiku.org/manga/type/manga/order/update/page/[page]/
 *
 * Tidak perlu ScraperAPI — api.komiku.org adalah REST API resmi,
 * tidak memblokir IP datacenter Vercel.
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

const BASE = 'https://api.komiku.org';

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  const cacheKey = `manga:latest:komiku:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const results = await fetchLatestKomiku(page);

    const payload = {
      page,
      source  : 'komiku',
      total   : results.length,
      results,
    };

    // Cache 3 menit — chapter bisa sering berubah
    await cacheSet(cacheKey, payload, 180);
    return successResponse(payload);

  } catch (err) {
    console.error('[manga/latest][komiku]', err.message);
    return gatewayError(`Gagal mengambil chapter terbaru: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCHER — pakai API resmi api.komiku.org
// Endpoint: /manga/type/manga/order/update/page/{page}/
// Response JSON langsung, tidak perlu scraping HTML
// ─────────────────────────────────────────────────────────────────

async function fetchLatestKomiku(page) {
  const url = `${BASE}/manga/type/manga/order/update/page/${page}/`;

  const res = await fetchWithTimeout(url, {
    'Accept'     : 'application/json',
    'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  }, 10000);

  const json = JSON.parse(res);

  // api.komiku.org mengembalikan array di field "data"
  const list = json?.data || json || [];
  if (!Array.isArray(list)) throw new Error('Format respons tidak dikenal dari api.komiku.org');

  return list.map(normalizeItem);
}

// ─────────────────────────────────────────────────────────────────
// NORMALIZER — seragamkan field dari api.komiku.org
//
// Contoh item dari API:
// {
//   "title"    : "Boruto: Two Blue Vortex",
//   "image"    : "https://thumbnail.komiku.org/...",
//   "desc"     : "Boruto melangkah dalam dunia ninjutsu...",
//   "type"     : "Manga",
//   "endpoint" : "/manga/boruto-two-blue-vortex/"
// }
// ─────────────────────────────────────────────────────────────────

function normalizeItem(m) {
  const endpoint = m.endpoint || '';
  const slugMatch = endpoint.match(/\/manga\/([^/]+)\/?$/i);
  const slug      = slugMatch ? slugMatch[1] : '';
  const mangaUrl  = slug ? `https://komiku.org/manga/${slug}/` : '';

  return {
    id        : slug,
    title     : m.title     || '',
    slug,
    url       : mangaUrl,
    endpoint,                          // raw endpoint, berguna untuk hit API lain
    thumbnail : m.image     || '',
    synopsis  : (m.desc     || '').slice(0, 300),
    type      : m.type      || '',
    // Field update time kadang ada di "desc" sebagai prefix "Update X lalu."
    lastUpdate: parseUpdateTime(m.desc || ''),
  };
}

// ─────────────────────────────────────────────────────────────────
// HELPER — ekstrak waktu update dari string deskripsi
// Contoh desc: "Update 18 menit lalu. Boruto melangkah..."
// ─────────────────────────────────────────────────────────────────

function parseUpdateTime(desc) {
  const match = desc.match(/^Update\s+(.+?)\.\s*/i);
  return match ? match[1].trim() : '';  // "18 menit lalu", "5 hari lalu", dst.
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (res.status === 403) throw new Error('Akses ditolak (403)');
    if (!res.ok)            throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
