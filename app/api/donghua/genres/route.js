/**
 * app/api/donghua/genres/route.js
 * Scraper daftar genre + anime per genre — donghuafilm.com
 *
 * GET /api/donghua/genres                        → daftar semua genre
 * GET /api/donghua/genres?genre=action           → anime dalam genre tertentu
 * GET /api/donghua/genres?genre=action&page=2    → halaman berikutnya
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

const BASE_URL = 'https://donghuafilm.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
  'Referer': `${BASE_URL}/`,
  'Cache-Control': 'no-cache',
};

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const genre = (searchParams.get('genre') || '').toLowerCase().trim();
  const page  = Math.max(1, Number(searchParams.get('page') || 1));

  // Kalau ada ?genre= → ambil anime dalam genre itu
  if (genre) return handleGenreAnime(genre, page);

  // Kalau tidak ada → kembalikan daftar semua genre
  return handleGenreList();
}

// ─────────────────────────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────────────────────────

async function handleGenreList() {
  const cacheKey = `donghua:genres:list`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const html   = await fetchPage(`${BASE_URL}/`);
    const genres = parseGenreList(html);

    if (!genres.length) return errorResponse(404, 'Daftar genre tidak ditemukan.');

    // Cache 24 jam — genre jarang berubah
    await cacheSet(cacheKey, genres, 86400);
    return successResponse(genres, { total: genres.length, source: 'donghuafilm' });
  } catch (err) {
    return gatewayError(`Gagal ambil daftar genre: ${err.message}`);
  }
}

async function handleGenreAnime(genre, page) {
  const cacheKey = `donghua:genres:${genre}:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true, page });

  try {
    const url = page > 1
      ? `${BASE_URL}/genres/${genre}/page/${page}/`
      : `${BASE_URL}/genres/${genre}/`;

    const html    = await fetchPage(url);
    const results = extractArticles(html);

    if (!results.length) return errorResponse(404, `Tidak ada anime ditemukan untuk genre "${genre}".`);

    await cacheSet(cacheKey, results, 3600);
    return successResponse(results, { total: results.length, genre, page, source: 'donghuafilm' });
  } catch (err) {
    return gatewayError(`Gagal ambil anime genre ${genre}: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const scraperKey = process.env.SCRAPER_API_KEY;

  const targetUrl = scraperKey
    ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(url)}&render=false`
    : url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(targetUrl, {
      signal:  controller.signal,
      headers: scraperKey ? {} : HEADERS,
    });
    if (res.status === 403) throw new Error('Akses Ditolak (403).');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// PARSERS
// ─────────────────────────────────────────────────────────────────

// Parse daftar genre dari ul.genre
// Struktur: <ul class='genre'><li><a href="/genres/action/" title="...">Action</a></li>...
function parseGenreList(html) {
  const genres = [];

  const ulMatch = html.match(/<ul\s+class='genre'>([\s\S]*?)<\/ul>/i);
  if (!ulMatch) return genres;

  const liRE = /<li>\s*<a\s+href="([^"]+)"\s+title="([^"]+)"\s*>([^<]+)<\/a>\s*<\/li>/gi;
  let m;
  while ((m = liRE.exec(ulMatch[1])) !== null) {
    const url   = m[1];
    const slug  = url.split('/').filter(Boolean).pop();
    genres.push({
      name:  m[3].trim(),
      slug,
      url,
    });
  }

  return genres;
}

// Parse anime cards dari halaman genre (sama dengan artikel biasa)
function extractArticles(html) {
  const results = [];
  const articleRE = /<article[^>]*class="bs"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = articleRE.exec(html)) !== null) {
    const item = parseArticle(m[1]);
    if (item) results.push(item);
  }
  return results;
}

function parseArticle(block) {
  try {
    const linkMatch = block.match(/<a\s+href="([^"]+)"/i);
    if (!linkMatch) return null;
    const url  = linkMatch[1];
    const slug = url.split('/').filter(Boolean).pop();

    const imgLazy   = block.match(/data-src="(https?:\/\/[^"]+)"/i);
    const imgSrc    = block.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
    const thumbnail = imgLazy ? imgLazy[1] : (imgSrc ? imgSrc[1] : '');

    const epMatch   = block.match(/<span\s+class="epx">([^<]+)<\/span>/i);
    const subMatch  = block.match(/<span\s+class="sb\s+[^"]*">([^<]+)<\/span>/i);
    const typeMatch = block.match(/<div\s+class="typez[^"]*">([^<]+)<\/div>/i);

    const ttMatch = block.match(/<div\s+class="tt">([\s\S]*?)<\/div>/i);
    let title = 'Unknown', headline = '';
    if (ttMatch) {
      const h2 = ttMatch[1].match(/<h2[^>]*>(.*?)<\/h2>/i);
      headline = h2 ? h2[1].trim() : '';
      title = ttMatch[1].replace(/<h2[^>]*>.*?<\/h2>/gi, '').replace(/<[^>]+>/g, '').trim();
    }

    return {
      title:    title || headline,
      headline,
      slug,
      url,
      thumbnail,
      episode:  epMatch   ? epMatch[1].trim()   : 'Unknown',
      sub_type: subMatch  ? subMatch[1].trim()   : 'Sub',
      type:     typeMatch ? typeMatch[1].trim()  : '',
      source:   'donghuafilm.com',
    };
  } catch { return null; }
}
