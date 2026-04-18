/**
 * app/api/manga/genres/route.js
 * Daftar genre manga — Komikstation only
 *
 * GET /api/manga/genres
 *
 * Source : https://komikstation.org
 * URL    : https://komikstation.org/genres/{slug}/
 *
 * Catatan: Halaman /manga/ mengembalikan 403 sehingga tidak bisa di-scrape.
 * Genre di-hardcode berdasarkan daftar resmi dari UI komikstation.org,
 * dengan URL mengikuti pola /genres/{slug}/ yang terlihat di halaman detail.
 */

import { cacheGet, cacheSet }            from '../../../../lib/cache.js';
import { successResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET() {
  const cacheKey = 'manga:genres:komikstation';
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    // Coba scrape dulu untuk mendapatkan data terbaru
    // Jika gagal (403/timeout), fallback ke hardcoded list
    let genres = [];
    try {
      genres = await scrapeGenres();
    } catch {
      // intentionally silent — gunakan hardcoded
    }

    if (!genres || genres.length === 0) {
      genres = HARDCODED_GENRES;
    }

    const payload = { source: 'komikstation', total: genres.length, genres };
    await cacheSet(cacheKey, payload, 3600); // cache 1 jam
    return successResponse(payload);
  } catch (err) {
    console.error('[manga/genres][komikstation]', err.message);
    return gatewayError(`Gagal mengambil daftar genre: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// HARDCODED GENRES
// Diambil dari UI filter resmi komikstation.org (screenshot)
// URL pola: https://komikstation.org/genres/{slug}/
// ─────────────────────────────────────────────────────────────────

const HARDCODED_GENRES = [
  { name: 'Action',        slug: 'action',        url: 'https://komikstation.org/genres/action/' },
  { name: 'Adventure',     slug: 'adventure',     url: 'https://komikstation.org/genres/adventure/' },
  { name: 'Comedy',        slug: 'comedy',        url: 'https://komikstation.org/genres/comedy/' },
  { name: 'Doujinshi',     slug: 'doujinshi',     url: 'https://komikstation.org/genres/doujinshi/' },
  { name: 'Drama',         slug: 'drama',         url: 'https://komikstation.org/genres/drama/' },
  { name: 'Ecchi',         slug: 'ecchi',         url: 'https://komikstation.org/genres/ecchi/' },
  { name: 'Fantasy',       slug: 'fantasy',       url: 'https://komikstation.org/genres/fantasy/' },
  { name: 'Gender Bender', slug: 'gender-bender', url: 'https://komikstation.org/genres/gender-bender/' },
  { name: 'Harem',         slug: 'harem',         url: 'https://komikstation.org/genres/harem/' },
  { name: 'Historical',    slug: 'historical',    url: 'https://komikstation.org/genres/historical/' },
  { name: 'Horror',        slug: 'horror',        url: 'https://komikstation.org/genres/horror/' },
  { name: 'Isekai',        slug: 'isekai',        url: 'https://komikstation.org/genres/isekai/' },
  { name: 'Josei',         slug: 'josei',         url: 'https://komikstation.org/genres/josei/' },
  { name: 'Martial Arts',  slug: 'martial-arts',  url: 'https://komikstation.org/genres/martial-arts/' },
  { name: 'Mature',        slug: 'mature',        url: 'https://komikstation.org/genres/mature/' },
  { name: 'Mecha',         slug: 'mecha',         url: 'https://komikstation.org/genres/mecha/' },
  { name: 'Mystery',       slug: 'mystery',       url: 'https://komikstation.org/genres/mystery/' },
  { name: 'Oneshot',       slug: 'oneshot',       url: 'https://komikstation.org/genres/oneshot/' },
  { name: 'Psychological', slug: 'psychological', url: 'https://komikstation.org/genres/psychological/' },
  { name: 'Romance',       slug: 'romance',       url: 'https://komikstation.org/genres/romance/' },
  { name: 'School Life',   slug: 'school-life',   url: 'https://komikstation.org/genres/school-life/' },
  { name: 'Sci-fi',        slug: 'sci-fi',        url: 'https://komikstation.org/genres/sci-fi/' },
  { name: 'Seinen',        slug: 'seinen',        url: 'https://komikstation.org/genres/seinen/' },
  { name: 'Shoujo',        slug: 'shoujo',        url: 'https://komikstation.org/genres/shoujo/' },
  { name: 'Shoujo Ai',     slug: 'shoujo-ai',     url: 'https://komikstation.org/genres/shoujo-ai/' },
  { name: 'Shounen',       slug: 'shounen',       url: 'https://komikstation.org/genres/shounen/' },
  { name: 'Shounen Ai',    slug: 'shounen-ai',    url: 'https://komikstation.org/genres/shounen-ai/' },
  { name: 'Slice of Life', slug: 'slice-of-life', url: 'https://komikstation.org/genres/slice-of-life/' },
  { name: 'Sports',        slug: 'sports',        url: 'https://komikstation.org/genres/sports/' },
  { name: 'Supernatural',  slug: 'supernatural',  url: 'https://komikstation.org/genres/supernatural/' },
  { name: 'Tragedy',       slug: 'tragedy',       url: 'https://komikstation.org/genres/tragedy/' },
  { name: 'Yaoi',          slug: 'yaoi',          url: 'https://komikstation.org/genres/yaoi/' },
  { name: 'Yuri',          slug: 'yuri',          url: 'https://komikstation.org/genres/yuri/' },
].sort((a, b) => a.name.localeCompare(b.name));

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────────

const BASE_HEADERS = {
  'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'     : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer'    : 'https://komikstation.org/',
};

async function fetchHtml(targetUrl) {
  const scraperKey = process.env.SCRAPER_API_KEY;

  const fetchUrl = scraperKey
    ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(targetUrl)}&render=false`
    : targetUrl;

  const headers  = scraperKey ? {} : BASE_HEADERS;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(fetchUrl, { signal: controller.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// SCRAPE GENRES (opsional)
// Scrape dari halaman detail manga untuk mendapat slug genre terbaru.
// Pola URL genre di halaman detail:
// <a href="https://komikstation.org/genres/action/" rel="tag">Action</a>
// ─────────────────────────────────────────────────────────────────

async function scrapeGenres() {
  const html = await fetchHtml('https://komikstation.org/manga/one-piece/');
  if (!html) return [];

  const genres = new Map();
  const re     = /<a\s+href="https?:\/\/komikstation\.org\/genres\/([^/"]+)\/?"\s+rel="tag"[^>]*>\s*([^<]+?)\s*<\/a>/gi;
  let m;

  while ((m = re.exec(html)) !== null) {
    const slug = m[1].trim();
    const name = m[2].trim();
    if (slug && name && !genres.has(slug)) {
      genres.set(slug, {
        name,
        slug,
        url: `https://komikstation.org/genres/${slug}/`,
      });
    }
  }

  return [...genres.values()].sort((a, b) => a.name.localeCompare(b.name));
}
