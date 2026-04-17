/**
 * app/api/manga/latest/route.js
 * Manga chapter terbaru — scrape dari komiku.org
 *
 * GET /api/manga/latest
 * GET /api/manga/latest?page=2
 *
 * Halaman sumber:
 *   https://komiku.org/pustaka/?orderby=modified&tipe=manga&genre=&genre2=&status=
 *
 * CATATAN DEPLOYMENT:
 *   komiku.org memblokir IP datacenter Vercel.
 *   Tambahkan SCRAPER_API_KEY di env Vercel agar endpoint ini bisa berjalan.
 *   Di local / VPS tanpa block, endpoint berjalan langsung tanpa proxy.
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

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

    // Cache 3 menit — data chapter cukup sering berubah
    await cacheSet(cacheKey, payload, 180);
    return successResponse(payload);

  } catch (err) {
    console.error('[manga/latest][komiku]', err.message);
    return gatewayError(`Gagal mengambil chapter terbaru: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCHER — Komiku latest update
// ─────────────────────────────────────────────────────────────────

async function fetchLatestKomiku(page) {
  const scraperKey = process.env.SCRAPER_API_KEY;

  // URL halaman latest — page 1 tidak perlu query page
  const target = new URL('https://komiku.org/pustaka/');
  target.searchParams.set('orderby', 'modified');
  target.searchParams.set('tipe',    'manga');
  target.searchParams.set('genre',   '');
  target.searchParams.set('genre2',  '');
  target.searchParams.set('status',  '');
  if (page > 1) target.searchParams.set('page', page);

  let fetchUrl, fetchHeaders;

  if (scraperKey) {
    // Pakai ScraperAPI untuk bypass IP block di Vercel
    fetchUrl     = `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(target.toString())}&render=false`;
    fetchHeaders = {};
  } else {
    // Tanpa proxy — hanya work di local / VPS
    fetchUrl     = target.toString();
    fetchHeaders = {
      'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer'    : 'https://komiku.org/',
      'Accept'     : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };
  }

  const html = await fetchWithTimeout(fetchUrl, fetchHeaders, 20000);
  return parseLatestKomiku(html);
}

// ─────────────────────────────────────────────────────────────────
// PARSER — ambil setiap kartu manga dari halaman latest
// Struktur HTML:
//   <div class="bge">
//     <div class="bgei">
//       <a href="/manga/SLUG/"><img src="THUMBNAIL" ...></a>
//     </div>
//     <div class="kan">
//       <a href="/manga/SLUG/"><h3>JUDUL</h3></a>
//       <span class="judul2">5jt pembaca | 18 menit lalu</span>
//       <p>SINOPSIS...</p>
//       <div class="new1"><a href="/SLUG-chapter-01/">Awal: Chapter 01</a></div>
//       <div class="new1"><a href="/SLUG-chapter-33/">Terbaru: Chapter 33</a></div>
//     </div>
//   </div>
// ─────────────────────────────────────────────────────────────────

function parseLatestKomiku(html) {
  if (!html || typeof html !== 'string') return [];

  const results = [];

  // Pecah per blok <div class="bge"> ... </div>
  // Pakai look-ahead agar blok tidak overlap
  const bgeRE = /<div\s+class="bge">([\s\S]*?)(?=<div\s+class="bge"|<div\s+id="pagination"|<\/main|$)/gi;
  let block;

  while ((block = bgeRE.exec(html)) !== null) {
    const item = parseLatestItem(block[1]);
    if (item) results.push(item);
  }

  return results;
}

function parseLatestItem(content) {
  // ── Judul & URL manga ──────────────────────────────────────────
  const h3Match = content.match(/<h3[^>]*>\s*([\s\S]*?)\s*<\/h3>/i);
  const title   = h3Match ? stripTags(h3Match[1]).trim() : '';
  if (!title) return null;

  // URL manga bisa ada di link <h3> atau di <a href="/manga/...">
  const mangaUrlMatch =
    content.match(/<a\s+href="(https?:\/\/komiku\.org\/manga\/[^"]+)"[^>]*>\s*<h3/i) ||
    content.match(/href="(https?:\/\/komiku\.org\/manga\/[^"]+)"/i);
  const mangaUrl = mangaUrlMatch ? mangaUrlMatch[1] : '';
  const slugMatch = mangaUrl.match(/\/manga\/([^/]+)\/?$/i);
  const slug      = slugMatch ? slugMatch[1] : '';

  // ── Thumbnail ──────────────────────────────────────────────────
  const imgMatch = content.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
  const thumbnail = imgMatch ? imgMatch[1] : '';

  // ── Tipe & Genre (dari <div class="tpe1_inf">) ─────────────────
  // contoh: <b>Manga</b> Fantasi
  const tpeMatch = content.match(/<div\s+class="tpe1_inf"[^>]*>\s*<b>([^<]+)<\/b>\s*([^<]*)/i);
  const type     = tpeMatch ? tpeMatch[1].trim() : '';
  const genre    = tpeMatch ? tpeMatch[2].trim() : '';

  // ── Badge update (Up 1, Up 2, dst.) ───────────────────────────
  const upMatch  = content.match(/<span\s+class="up"[^>]*>([^<]+)<\/span>/i);
  const upBadge  = upMatch ? upMatch[1].trim() : '';

  // ── Sinopsis ──────────────────────────────────────────────────
  const synopsisMatch = content.match(/<p>([^<]{10,})<\/p>/i);
  const synopsis      = synopsisMatch ? synopsisMatch[1].trim() : '';

  // ── Jumlah pembaca & waktu update ─────────────────────────────
  // contoh: "5jt pembaca | 18 menit lalu"
  const judul2Match = content.match(/<span\s+class="judul2"[^>]*>([\s\S]*?)<\/span>/i);
  const judul2Raw   = judul2Match ? stripTags(judul2Match[1]).trim() : '';

  let readers    = '';
  let lastUpdate = '';
  if (judul2Raw) {
    const parts = judul2Raw.split('|');
    readers    = (parts[0] || '').replace(/pembaca/i, '').trim(); // "5jt"
    lastUpdate = (parts[1] || '').trim();                          // "18 menit lalu"
  }

  // ── Chapter awal & terbaru ────────────────────────────────────
  // Ada dua <div class="new1">: index-0 = awal, index-1 = terbaru
  const new1RE    = /<div\s+class="new1"[^>]*>([\s\S]*?)<\/div>/gi;
  const new1Blocks = [];
  let nm;
  while ((nm = new1RE.exec(content)) !== null) {
    new1Blocks.push(nm[1]);
  }

  const parseChapter = (block) => {
    if (!block) return null;
    const aMatch     = block.match(/<a\s+href="([^"]+)"[^>]*title="([^"]+)"[^>]*>/i);
    const spanTexts  = [...block.matchAll(/<span[^>]*>([^<]+)<\/span>/gi)].map(s => s[1].trim());
    return {
      url   : aMatch        ? 'https://komiku.org' + aMatch[1] : '',
      title : aMatch        ? aMatch[2]                         : (spanTexts.join(' ') || ''),
      label : spanTexts[0]  || '',   // "Awal:" atau "Terbaru:"
      chapter: spanTexts[1] || '',   // "Chapter 01" atau "Chapter 33"
    };
  };

  const firstChapter  = parseChapter(new1Blocks[0]);
  const latestChapter = parseChapter(new1Blocks[1]);

  return {
    id             : slug,
    title,
    slug,
    url            : mangaUrl,
    thumbnail,
    type,
    genre,
    synopsis       : synopsis.slice(0, 300),
    readers,
    lastUpdate,
    upBadge,
    firstChapter,
    latestChapter,
  };
}

// ─────────────────────────────────────────────────────────────────
// HELPER — buang semua tag HTML dari string
// ─────────────────────────────────────────────────────────────────

function stripTags(str) {
  return (str || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER (sama persis dengan search/route.js)
// ─────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (res.status === 403) throw new Error('Akses ditolak (403) — tambahkan SCRAPER_API_KEY');
    if (!res.ok)            throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
