/**
 * app/api/manga/genres/route.js
 * Daftar genre manga — Komikstation only
 *
 * GET /api/manga/genres
 *
 * Source  : https://komikstation.org
 * Scrape  : https://komikstation.org/manga (halaman filter)
 * Selector: ul.dropdown-menu.c4.genrez > li > input.genre-item + label
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
    const genres  = await fetchGenresKomikstation();
    const payload = { source: 'komikstation', total: genres.length, genres };
    await cacheSet(cacheKey, payload, 3600); // cache 1 jam (genre jarang berubah)
    return successResponse(payload);
  } catch (err) {
    console.error('[manga/genres][komikstation]', err.message);
    return gatewayError(`Gagal mengambil daftar genre: ${err.message}`);
  }
}

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
// FETCH GENRES — scrape dari halaman filter komikstation
// ─────────────────────────────────────────────────────────────────

async function fetchGenresKomikstation() {
  const html = await fetchHtml('https://komikstation.org/manga/');
  return parseGenres(html);
}

// ─────────────────────────────────────────────────────────────────
// PARSER
//
// Struktur HTML target:
// <ul class="dropdown-menu c4 genrez">
//   <li>
//     <input class="genre-item" type="checkbox" id="genre-15" name="genre[]" value="15">
//     <label for="genre-15">Action</label>
//   </li>
//   <li>
//     <input class="genre-item" type="checkbox" id="genre-16" name="genre[]" value="16">
//     <label for="genre-16">Adventure</label>
//   </li>
//   ...
// </ul>
//
// Output per item:
// { id: "15", name: "Action", slug: "action", url: "https://komikstation.org/manga/?genre[]=15" }
// ─────────────────────────────────────────────────────────────────

function parseGenres(html) {
  if (!html || typeof html !== 'string') return [];

  // Ambil blok <ul class="dropdown-menu c4 genrez">...</ul>
  const ulMatch = html.match(
    /<ul\s+class="dropdown-menu\s+c4\s+genrez"[^>]*>([\s\S]*?)<\/ul>/i
  );
  if (!ulMatch) return parseGenresFallback(html);

  const ulContent = ulMatch[1];
  const genres    = [];

  // Match setiap pasang <input ... value="N"> + <label ...>Nama</label>
  // dalam satu blok <li>
  const liRE = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let li;

  while ((li = liRE.exec(ulContent)) !== null) {
    const block = li[1];

    const inputM = block.match(
      /<input[^>]+class="genre-item"[^>]+value="(\d+)"[^>]*>/i
    );
    const labelM = block.match(
      /<label[^>]+>\s*([^<]+?)\s*<\/label>/i
    );

    if (!inputM || !labelM) continue;

    const id   = inputM[1].trim();
    const name = labelM[1].trim();
    if (!id || !name) continue;

    genres.push({
      id,
      name,
      slug : name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      url  : `https://komikstation.org/manga/?genre[]=${id}`,
    });
  }

  return genres.sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────
// FALLBACK — jika <ul class="genrez"> tidak ketemu, scan global
// ─────────────────────────────────────────────────────────────────

function parseGenresFallback(html) {
  const genres = [];
  const seen   = new Set();

  // Cari semua <input class="genre-item" ... value="N"> diikuti <label>Nama</label>
  const re = /<input[^>]+class="genre-item"[^>]+value="(\d+)"[^>]*>[\s\S]{0,200}?<label[^>]+>\s*([^<]+?)\s*<\/label>/gi;
  let m;

  while ((m = re.exec(html)) !== null) {
    const id   = m[1].trim();
    const name = m[2].trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);

    genres.push({
      id,
      name,
      slug : name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      url  : `https://komikstation.org/manga/?genre[]=${id}`,
    });
  }

  return genres.sort((a, b) => a.name.localeCompare(b.name));
}
