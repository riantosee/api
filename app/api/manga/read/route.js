/**
 * app/api/manga/read/route.js
 * Baca chapter manga — ambil daftar halaman/gambar
 *
 * USAGE:
 *   GET /api/manga/read?slug=one-punch-man-chapter-228
 *   GET /api/manga/read?slug=naruto-sasukes-story-the-uchiha-and-the-heavenly-stardust-chapter-10
 *
 * Source : https://komikstation.org
 * URL    : https://komikstation.org/{chapter-slug}/
 *
 * Catatan:
 *   - Slug chapter diambil dari field "slug" di response /api/manga/detail
 *   - Format URL: komikstation.org/{manga-slug}-chapter-{N}/
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);

  const raw  = (searchParams.get('slug') || '').trim();
  const slug = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-.]/g, '');

  if (!slug) {
    return errorResponse(400, [
      'Parameter "slug" diperlukan.',
      'Contoh: /api/manga/read?slug=one-punch-man-chapter-228',
    ].join(' '));
  }

  const cacheKey = `manga:read:komikstation:${slug}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const result = await fetchChapterPages(slug);
    if (!result) return errorResponse(404, `Chapter "${slug}" tidak ditemukan.`);

    await cacheSet(cacheKey, result, 3600); // cache 1 jam (isi chapter tidak berubah)
    return successResponse(result);
  } catch (err) {
    console.error('[manga/read][komikstation]', err.message);
    return gatewayError(`Gagal mengambil halaman chapter: ${err.message}`);
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
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// MAIN FETCH
// ─────────────────────────────────────────────────────────────────

async function fetchChapterPages(slug) {
  const url  = `https://komikstation.org/${slug}/`;
  const html = await fetchHtml(url);
  if (!html) return null;
  return parseChapter(html, slug, url);
}

// ─────────────────────────────────────────────────────────────────
// PARSER
//
// Struktur HTML halaman baca:
//
// <div id="readerarea" class="rdminimal">
//   <p>
//     <noscript>
//       <img decoding="async"
//            src="https://img.klikcdn.com/data-manga/manga_4454c95ca.../001_8cbdd1055e7c...jpg"
//            alt="One Punch-Man Chapter 228 - Page 1 of 16"
//            title="One Punch-Man Chapter 228 - Page 1 of 16">
//     </noscript>
//     <img src="data:image/svg+xml,..."
//          class="lazyload"
//          decoding="async"
//          data-src="https://img.klikcdn.com/data-manga/manga_4454c95ca.../001_8cbdd1055e7c...jpg"
//          alt="One Punch-Man Chapter 228 - Page 1 of 16"
//          title="One Punch-Man Chapter 228 - Page 1 of 16">
//   </p>
//   ...
// </div>
//
// Strategi:
// 1. Ambil blok #readerarea
// 2. Prioritas src dari <noscript><img src="..."> (gambar asli, pasti ada)
// 3. Fallback ke data-src="..." (lazy load)
// 4. Dedupe URL, urutkan berdasarkan nomor halaman dari alt/title/nama file
// ─────────────────────────────────────────────────────────────────

function parseChapter(html, slug, url) {
  // ── Meta chapter dari <title> atau heading
  const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title  = titleM
    ? titleM[1].replace(/\s*[-–|]\s*komikstation.*$/i, '').trim()
    : slug;

  // ── Navigasi prev/next
  const prevM = html.match(/<link\s+rel="prev"\s+href="([^"]+)"/i);
  const nextM = html.match(/<link\s+rel="next"\s+href="([^"]+)"/i);
  const prevUrl = prevM ? prevM[1] : null;
  const nextUrl = nextM ? nextM[1] : null;

  // ── Ambil blok readerarea
  const readerM = html.match(/<div[^>]+id="readerarea"[^>]*>([\s\S]*?)<\/div>\s*(?=<div|<script|$)/i)
               || html.match(/<div[^>]+id="readerarea"[^>]*>([\s\S]*)/i);
  const readerHtml = readerM ? readerM[1] : html;

  // ── Kumpulkan semua gambar
  const pages = parsePages(readerHtml);

  // ── Prev/next chapter slug dari URL navigasi
  const prevSlug = prevUrl ? extractSlugFromUrl(prevUrl) : null;
  const nextSlug = nextUrl ? extractSlugFromUrl(nextUrl) : null;

  return {
    slug,
    url,
    title,
    totalPages : pages.length,
    pages,
    navigation : {
      prev : prevSlug ? { slug: prevSlug, url: prevUrl } : null,
      next : nextSlug ? { slug: nextSlug, url: nextUrl } : null,
    },
    source     : 'komikstation',
  };
}

// ─────────────────────────────────────────────────────────────────
// PARSE PAGES — kumpulkan URL gambar dari readerarea
// ─────────────────────────────────────────────────────────────────

function parsePages(html) {
  const seen  = new Set();
  const pages = [];

  // ── Pass 1: <noscript><img src="..."> — paling akurat, gambar asli
  const noscriptRE = /<noscript[^>]*>([\s\S]*?)<\/noscript>/gi;
  let ns;
  while ((ns = noscriptRE.exec(html)) !== null) {
    const imgM = ns[1].match(
      /<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i
    );
    if (!imgM) continue;

    const imgUrl = imgM[1].trim();
    if (seen.has(imgUrl)) continue;
    seen.add(imgUrl);

    const altM  = ns[1].match(/\balt="([^"]+)"/i);
    const pageN = extractPageNumber(altM?.[1] || imgUrl);
    pages.push({ page: pageN, url: imgUrl });
  }

  // ── Pass 2: data-src="..." (lazy load) — ambil yang belum ada
  const dataSrcRE = /<img[^>]+data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/gi;
  let ds;
  while ((ds = dataSrcRE.exec(html)) !== null) {
    const imgUrl = ds[1].trim();
    if (seen.has(imgUrl)) continue;
    seen.add(imgUrl);

    const altM  = ds[0].match(/\balt="([^"]+)"/i);
    const pageN = extractPageNumber(altM?.[1] || imgUrl);
    pages.push({ page: pageN, url: imgUrl });
  }

  // ── Pass 3: <img src="..."> biasa — fallback terakhir
  if (pages.length === 0) {
    const srcRE = /<img[^>]+src="(https?:\/\/(?:img\.klikcdn\.com|cdn\.komikstation\.org|i\.[^"]+)[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/gi;
    let sm;
    while ((sm = srcRE.exec(html)) !== null) {
      const imgUrl = sm[1].trim();
      if (seen.has(imgUrl)) continue;
      seen.add(imgUrl);

      const altM  = sm[0].match(/\balt="([^"]+)"/i);
      const pageN = extractPageNumber(altM?.[1] || imgUrl);
      pages.push({ page: pageN, url: imgUrl });
    }
  }

  // Urutkan berdasarkan nomor halaman
  return pages
    .sort((a, b) => (a.page ?? 9999) - (b.page ?? 9999))
    .map((p, i) => ({ page: p.page ?? i + 1, url: p.url }));
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

// Ekstrak nomor halaman dari alt text atau nama file
// "One Punch-Man Chapter 228 - Page 1 of 16" → 1
// "001_8cbdd1055e7c...jpg" → 1
function extractPageNumber(str) {
  if (!str) return null;

  // Dari alt: "Page N of M" atau "Page N"
  const pageM = str.match(/\bpage\s+(\d+)/i);
  if (pageM) return parseInt(pageM[1], 10);

  // Dari nama file: "001_..." atau "page-001..."
  const fileM = str.match(/(?:^|[/_-])0*(\d+)[_.-]/);
  if (fileM) return parseInt(fileM[1], 10);

  return null;
}

// Ekstrak slug dari URL komikstation
// "https://komikstation.org/one-punch-man-chapter-227/" → "one-punch-man-chapter-227"
function extractSlugFromUrl(url) {
  try {
    const path  = new URL(url).pathname;
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch {
    return null;
  }
}
