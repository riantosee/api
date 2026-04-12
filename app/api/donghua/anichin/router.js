/**
 * app/api/donghua/anichin/route.js
 * Status: Fixed 403 Forbidden Error
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

const BASE = 'https://anichin.cafe';

// Header diperkuat untuk melewati proteksi bot (WAF/Cloudflare)
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://anichin.cafe/',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q    = (searchParams.get('q') || searchParams.get('query') || '').trim();
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const mode = searchParams.get('mode') || 'search';

  if (mode === 'latest') return handleLatest();

  if (!q) {
    return errorResponse(400, [
      'Parameter "q" wajib diisi.',
      'Contoh: /api/donghua/anichin?q=shrouding+the+heavens',
      'Latest : /api/donghua/anichin?mode=latest',
    ].join(' | '));
  }

  return handleSearch(q, page);
}

// ─────────────────────────────────────────────────────────────────
// SEARCH LOGIC
// ─────────────────────────────────────────────────────────────────

async function handleSearch(q, page) {
  const cacheKey = `anichin:search:${q}:${page}`;

  const hit = await cacheGet(cacheKey);
  if (hit) {
    return successResponse(hit, { source: 'anichin', fromCache: true, total: hit.length, page });
  }

  try {
    const url = page > 1
      ? `${BASE}/page/${page}/?s=${encodeURIComponent(q)}`
      : `${BASE}/?s=${encodeURIComponent(q)}`;

    const html    = await fetchPage(url);
    const results = extractArticles(html);

    if (results.length > 0) {
      await cacheSet(cacheKey, results, 180); // cache 3 menit
    }

    return successResponse(results, {
      source   : 'anichin',
      fromCache: false,
      total    : results.length,
      page,
    });
  } catch (err) {
    console.error('[anichin/search] Error:', err.message);
    return gatewayError(`Anichin.cafe tidak bisa diakses: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// LATEST LOGIC
// ─────────────────────────────────────────────────────────────────

async function handleLatest() {
  const cacheKey = 'anichin:latest';

  const hit = await cacheGet(cacheKey);
  if (hit) {
    return successResponse(hit, { source: 'anichin', fromCache: true, total: hit.length });
  }

  try {
    const html    = await fetchPage(BASE);
    const results = extractArticles(html).slice(0, 30);

    if (results.length > 0) {
      await cacheSet(cacheKey, results, 120); // cache 2 menit
    }

    return successResponse(results, {
      source   : 'anichin',
      fromCache: false,
      total    : results.length,
    });
  } catch (err) {
    console.error('[anichin/latest] Error:', err.message);
    return gatewayError(`Gagal ambil episode terbaru: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH CORE (The Fix)
// ─────────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 15000); // 15 detik timeout

  try {
    const res = await fetch(url, { 
      signal: controller.signal, 
      headers: HEADERS,
      method: 'GET',
      redirect: 'follow'
    });

    if (res.status === 403) {
      throw new Error('Akses ditolak (403). Server memblokir request bot.');
    }
    
    if (res.status === 404) throw new Error('Halaman tidak ditemukan (404)');
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

    return await res.text();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout saat menghubungi Anichin');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// PARSER (Regex Based)
// ─────────────────────────────────────────────────────────────────

function extractArticles(html) {
  const results = [];

  // Isolasi area konten agar tidak mengambil sidebar
  const listMatch = html.match(/<div[^>]*class="[^"]*\blistupd\b[^"]*"[^>]*>([\s\S]*?)(?:<div[^>]*class="pagination"|<\/section>|$)/i);
  const scope = listMatch ? listMatch[1] : html;

  const articleRE = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let m;

  while ((m = articleRE.exec(scope)) !== null) {
    try {
      const item = parseArticle(m[1]);
      if (item) results.push(item);
    } catch (e) {
      continue;
    }
  }

  return results;
}

function parseArticle(block) {
  // 1. Link & Slug
  const linkMatch = block.match(/<a\s+href="(https?:\/\/anichin\.cafe\/([^"]+))"/i);
  if (!linkMatch) return null;

  const url  = linkMatch[1];
  const slug = linkMatch[2].replace(/^seri\//, '').replace(/\/$/, '');

  // 2. Judul (Mencari di dalam div class tt)
  const ttMatch = block.match(/<div[^>]*class="tt"[^>]*>([\s\S]*?)<\/div>/i);
  const title   = ttMatch ? decode(ttMatch[1].replace(/<[^>]+>/g, '')) : 'Unknown Title';

  // 3. Thumbnail (Mendukung lazy load data-src)
  const imgMatch  = block.match(/(?:data-src|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif)[^"]*)"/i);
  const thumbnail = imgMatch ? imgMatch[1] : null;

  // 4. Episode / Label
  const epMatch      = block.match(/<span[^>]*class="epx"[^>]*>([^<]+)<\/span>/i);
  const episodeLabel = epMatch ? decode(epMatch[1]) : null;

  // 5. Tipe (Sub/Dub)
  const subMatch = block.match(/<span[^>]*class="sb\s+([^"]+)"[^>]*>([^<]+)<\/span>/i);
  const subType  = subMatch ? decode(subMatch[2]) : null;

  // 6. Status
  const statusMatch = block.match(/<div[^>]*class="status\s+([^"]+)"[^>]*>/i);
  const status      = statusMatch ? statusMatch[1].trim() : null;

  return {
    id: slug,
    title,
    url,
    thumbnail,
    episode_label: episodeLabel,
    sub_type: subType,
    status: status,
    source: 'anichin.cafe',
  };
}

// ─────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────

function decode(s = '') {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
