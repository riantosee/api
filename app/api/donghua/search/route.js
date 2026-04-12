/**
 * app/api/donghua/donghuafilm/route.js
 * Scraper untuk donghuafilm.com berdasarkan gambar source code
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
  const q = (searchParams.get('q') || searchParams.get('query') || '').trim();
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const mode = searchParams.get('mode') || (q ? 'search' : 'latest');

  if (mode === 'latest') return handleLatest(page);
  return handleSearch(q, page);
}

// ─────────────────────────────────────────────────────────────────
// SEARCH & LATEST LOGIC
// ─────────────────────────────────────────────────────────────────

async function handleSearch(q, page) {
  if (!q) return errorResponse(400, 'Parameter "q" diperlukan untuk pencarian.');
  
  const cacheKey = `donghuafilm:search:${q}:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true, page });

  try {
    const url = page > 1 
      ? `${BASE_URL}/page/${page}/?s=${encodeURIComponent(q)}` 
      : `${BASE_URL}/?s=${encodeURIComponent(q)}`;

    const html = await fetchPage(url);
    const results = extractArticles(html);

    await cacheSet(cacheKey, results, 300);
    return successResponse(results, { total: results.length, page, source: 'donghuafilm' });
  } catch (err) {
    return gatewayError(`Gagal akses Donghuafilm: ${err.message}`);
  }
}

async function handleLatest(page) {
  const cacheKey = `donghuafilm:latest:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true, page });

  try {
    // Biasanya list terbaru ada di /anime/ atau homepage
    const url = page > 1 ? `${BASE_URL}/anime/page/${page}/` : `${BASE_URL}/anime/`;
    const html = await fetchPage(url);
    const results = extractArticles(html);

    await cacheSet(cacheKey, results, 300);
    return successResponse(results, { total: results.length, page });
  } catch (err) {
    return gatewayError(`Gagal ambil update terbaru: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH CORE
// ─────────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, { signal: controller.signal, headers: HEADERS });
    if (res.status === 403) throw new Error("Akses Ditolak (403). Coba gunakan ScraperAPI jika di Vercel.");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// PARSER (Sesuai Gambar Source Code)
// ─────────────────────────────────────────────────────────────────

function extractArticles(html) {
  const results = [];
  
  // Ambil konten di dalam listupd bixbox
  const containerMatch = html.match(/<div[^>]*class="listupd"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  const scope = containerMatch ? containerMatch[1] : html;

  const articleRE = /<article[^>]*class="bs"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;

  while ((m = articleRE.exec(scope)) !== null) {
    const item = parseArticle(m[1]);
    if (item) results.push(item);
  }
  return results;
}

function parseArticle(block) {
  try {
    // 1. URL & Slug
    const linkMatch = block.match(/<a\s+href="([^"]+)"/i);
    if (!linkMatch) return null;
    const url = linkMatch[1];
    const slug = url.split('/').filter(Boolean).pop();

    // 2. Thumbnail
    const imgMatch = block.match(/<img\s+src="([^"]+)"/i);
    const thumbnail = imgMatch ? imgMatch[1] : "";

    // 3. Episode / Status (span class epx)
    const epMatch = block.match(/<span\s+class="epx">([^<]+)<\/span>/i);
    const episode = epMatch ? epMatch[1].trim() : "Unknown";

    // 4. Sub Type (span class sb)
    const subMatch = block.match(/<span\s+class="sb\s+([^"]+)">([^<]+)<\/span>/i);
    const subType = subMatch ? subMatch[2].trim() : "Sub";

    // 5. Title & Headline
    // Di gambar, judul ada di dalam <div class="tt">. Kadang ada <h2> di dalamnya.
    const ttMatch = block.match(/<div\s+class="tt">([\s\S]*?)<\/div>/i);
    let title = "Unknown Title";
    let headline = "";

    if (ttMatch) {
      const rawText = ttMatch[1];
      // Ambil headline dari <h2> jika ada
      const h2Match = rawText.match(/<h2[^>]*>(.*?)<\/h2>/i);
      headline = h2Match ? h2Match[1].trim() : "";
      
      // Bersihkan title dari tag h2 dan whitespace
      title = rawText.replace(/<h2[^>]*>.*?<\/h2>/gi, '').replace(/<[^>]+>/g, '').trim();
    }

    return {
      title: title || headline, // Fallback ke headline jika title kosong
      slug,
      url,
      thumbnail,
      status: episode, // "Ongoing" atau "Episode 12"
      sub_type: subType,
      headline: headline,
      source: 'donghuafilm.com'
    };
  } catch (e) {
    return null;
  }
}
