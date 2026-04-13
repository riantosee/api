/**
 * app/api/manhua/chapter/route.js
 * Scraper isi chapter (gambar) — manhwaindo.my
 *
 * GET /api/manhua/chapter?url=https://www.manhwaindo.my/only-i-have-an-ex-grade-summon-chapter-16/
 * GET /api/manhua/chapter?slug=only-i-have-an-ex-grade-summon-chapter-16
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

const BASE_URL = 'https://www.manhwaindo.my';

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
  const slug = (searchParams.get('slug') || '').trim();
  const url  = (searchParams.get('url')  || '').trim();

  if (!slug && !url) return errorResponse(400, 'Parameter "slug" atau "url" diperlukan.');

  // Contoh URL chapter: https://www.manhwaindo.my/only-i-have-an-ex-grade-summon-chapter-16/
  const targetUrl = url || `${BASE_URL}/${slug}/`;

  const cacheKey = `manhua:chapter:${targetUrl}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const html   = await fetchPage(targetUrl);
    const result = parseChapter(html, targetUrl);
    if (!result || result.images.length === 0)
      return errorResponse(404, 'Gagal parse gambar chapter atau tidak ada gambar ditemukan.');

    await cacheSet(cacheKey, result, 600);
    return successResponse(result, { source: 'manhwaindo.my' });
  } catch (err) {
    return gatewayError(`Gagal ambil chapter: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const scraperKey = process.env.SCRAPER_API_KEY;
  const targetUrl  = scraperKey
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
  } finally { clearTimeout(timer); }
}

// ─────────────────────────────────────────────────────────────────
// MAIN PARSER
// ─────────────────────────────────────────────────────────────────

function parseChapter(html, pageUrl) {
  try {
    return {
      url: pageUrl,
      ...parseChapterMeta(html),
      images: parseImages(html),
      navigation: parseNavigation(html),
    };
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────
// 1. META CHAPTER
//
// Dari HTML:
//   <span itemprop="name">Only I Have An EX-Grade Summon Chapter 16</span>
//   <select name="chapter" id="chapter" onchange="...">
//     <option value="https://...chapter-17/">Chapter 17</option>
//     <option value="https://...chapter-16/" selected>Chapter 16</option>
//     ...
//   </select>
// ─────────────────────────────────────────────────────────────────

function parseChapterMeta(html) {
  // Judul chapter
  const titleMatch = html.match(/<span[^>]+itemprop="name">([^<]+)<\/span>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Nomor chapter dari title (misal "Chapter 16" → 16)
  const numMatch = title.match(/chapter\s+([\d.]+)/i);
  const chapterNumber = numMatch ? parseFloat(numMatch[1]) : null;

  // Daftar chapter dari <select> dropdown navigasi
  const selectMatch = html.match(/<select[^>]+name="chapter"[^>]*>([\s\S]*?)<\/select>/i);
  const chapterList = [];
  if (selectMatch) {
    const optRE = /<option\s+value="([^"]+)"([^>]*)>([^<]+)<\/option>/gi;
    let m;
    while ((m = optRE.exec(selectMatch[1])) !== null) {
      chapterList.push({
        url:      m[1],
        label:    m[3].trim(),
        selected: /selected/i.test(m[2]),
      });
    }
  }

  return { title, chapter_number: chapterNumber, chapter_list: chapterList };
}

// ─────────────────────────────────────────────────────────────────
// 2. IMAGES — Scrape gambar dari div#readerarea
//
// Dari screenshot HTML:
//   <div id="readerarea" class="rdminimal">
//     <p>
//       <noscript><img src='http://kacu.gmbr.pro/uploads/manga-images/o/only-i-have-an-ex-grade-summon/chapter-16/1.jpg' /></noscript>
//       <img src='data:image/svg+xml,...' class="lazyload"
//            data-src='http://kacu.gmbr.pro/uploads/manga-images/o/only-i-have-an-ex-grade-summon/chapter-16/1.jpg' />
//       <br />
//       ...
//     </p>
//   </div>
//
// Prioritas:
//   1. data-src (lazy load — URL asli gambar)
//   2. src dari <noscript> (fallback)
//   3. src langsung jika bukan data:URI
// ─────────────────────────────────────────────────────────────────

function parseImages(html) {
  // Isolasi hanya konten div#readerarea
  const readerMatch = html.match(/<div[^>]+id="readerarea"[^>]*>([\s\S]*?)<\/div>/i);
  const readerHtml  = readerMatch ? readerMatch[1] : html;

  const images = [];
  const seen   = new Set();

  // Strategi 1: ambil semua data-src yang merupakan URL gambar
  const dataSrcRE = /data-src='(https?:\/\/[^']+\.(?:jpg|jpeg|png|webp|gif))'/gi;
  let m;
  while ((m = dataSrcRE.exec(readerHtml)) !== null) {
    const url = m[1].trim();
    if (!seen.has(url)) { seen.add(url); images.push(url); }
  }

  // Strategi 2: fallback dari <noscript><img src='...'>
  if (images.length === 0) {
    const noscriptRE = /<noscript><img[^>]+src='(https?:\/\/[^']+\.(?:jpg|jpeg|png|webp|gif))'/gi;
    while ((m = noscriptRE.exec(readerHtml)) !== null) {
      const url = m[1].trim();
      if (!seen.has(url)) { seen.add(url); images.push(url); }
    }
  }

  // Strategi 3: fallback src langsung (bukan data:URI)
  if (images.length === 0) {
    const srcRE = /<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif))"/gi;
    while ((m = srcRE.exec(readerHtml)) !== null) {
      const url = m[1].trim();
      if (!seen.has(url)) { seen.add(url); images.push(url); }
    }
  }

  // Urutkan berdasarkan nomor halaman yang ada di URL (1.jpg, 2.jpg, dst.)
  images.sort((a, b) => {
    const numA = extractPageNumber(a);
    const numB = extractPageNumber(b);
    return numA - numB;
  });

  return images.map((url, index) => ({
    page:  extractPageNumber(url) || index + 1,
    url,
  }));
}

// Ambil nomor halaman dari URL gambar, misal: "/chapter-16/7.jpg" → 7
function extractPageNumber(url) {
  const m = url.match(/\/(\d+)\.(?:jpg|jpeg|png|webp|gif)(?:\?.*)?$/i);
  return m ? parseInt(m[1], 10) : 0;
}

// ─────────────────────────────────────────────────────────────────
// 3. NAVIGASI PREV / NEXT CHAPTER
//
// Dari screenshot HTML:
//   <a class="ch-prev-btn" href="#/prev/" rel="prev"> <i class="fas fa-angle-left"></i> Prev </a>
//   <a class="ch-next-btn" href="#/next/" rel="next"> Next <i class="fas fa-angle-right"></i> </a>
//
// Catatan: href bisa berisi "#/prev/" (placeholder) atau URL asli chapter.
// ─────────────────────────────────────────────────────────────────

function parseNavigation(html) {
  const prevMatch = html.match(/<a[^>]+class="ch-prev-btn"[^>]+href="([^"]+)"/i)
                 || html.match(/<a[^>]+href="([^"]+)"[^>]+class="ch-prev-btn"/i);
  const nextMatch = html.match(/<a[^>]+class="ch-next-btn"[^>]+href="([^"]+)"/i)
                 || html.match(/<a[^>]+href="([^"]+)"[^>]+class="ch-next-btn"/i);

  const resolveUrl = (href) => {
    if (!href) return null;
    // Jika masih placeholder atau hash, kembalikan null
    if (/^#/.test(href)) return null;
    // Jika sudah URL lengkap
    if (/^https?:\/\//i.test(href)) return href;
    // Relatif → absolute
    return `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
  };

  return {
    prev_chapter_url: resolveUrl(prevMatch ? prevMatch[1] : null),
    next_chapter_url: resolveUrl(nextMatch ? nextMatch[1] : null),
  };
}
