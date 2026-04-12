/**
 * app/api/donghua/donghuafilm/latest/route.js
 * Scraper "Latest Release" untuk donghuafilm.com
 * Seksi: div.bixbox.bbnofrm > div.releases.latesthome > h3 "Latest Release"
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
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  return handleLatest(page);
}

// ─────────────────────────────────────────────────────────────────
// LATEST LOGIC
// ─────────────────────────────────────────────────────────────────

async function handleLatest(page) {
  const cacheKey = `donghuafilm:latest:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true, page });

  try {
    // Dari source code: link "View All" mengarah ke /anime/?status=&type=&order=update
    // Homepage juga tampilkan latest, tapi untuk page > 1 pakai endpoint anime
    const url = page > 1
      ? `${BASE_URL}/anime/page/${page}/?status=&type=&order=update`
      : `${BASE_URL}/`;

    const html = await fetchPage(url);
    const results = page > 1
      ? extractArticlesFromListupd(html)   // halaman /anime/ — ambil semua article
      : extractLatestFromHome(html);        // homepage — ambil seksi latesthome saja

    if (!results.length) return errorResponse(404, 'Tidak ada data latest ditemukan.');

    await cacheSet(cacheKey, results, 300);
    return successResponse(results, { total: results.length, page, source: 'donghuafilm' });
  } catch (err) {
    return gatewayError(`Gagal ambil latest release: ${err.message}`);
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
    if (res.status === 403) throw new Error('Akses Ditolak (403).');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// PARSER — Seksi "Latest Release" dari homepage
// Struktur dari source code gambar:
//   <div class="bixbox bbnofrm">
//     <div class="releases latesthome">
//       <h3>Latest Release</h3>
//       <a class="vl" href="/anime/?status=&type=&order=update">View All</a>
//     </div>
//     <div class="listupd normal">
//       <div class="excstf">
//         <article class="bs"> ... </article>
//       </div>
//     </div>
//   </div>
// ─────────────────────────────────────────────────────────────────

function extractLatestFromHome(html) {
  const results = [];

  // Cari posisi "Latest Release" heading
  const latestIdx = html.search(/<h3[^>]*>\s*Latest Release\s*<\/h3>/i);
  if (latestIdx === -1) return results;

  // Slice dari titik itu, ambil cukup besar untuk seluruh seksi
  const slice = html.slice(latestIdx, latestIdx + 50000);

  // Ambil article.bs di dalam area tersebut
  const articleRE = /<article[^>]*class="bs"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = articleRE.exec(slice)) !== null) {
    const item = parseArticle(m[1]);
    if (item) results.push(item);
    if (results.length >= 30) break; // max 30 item dari homepage
  }

  return results;
}

// Parser untuk halaman /anime/ (page > 1) — ambil semua article di listupd
function extractArticlesFromListupd(html) {
  const results = [];

  const listMatch = html.match(/<div[^>]*class="[^"]*listupd[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  const scope = listMatch ? listMatch[1] : html;

  const articleRE = /<article[^>]*class="bs"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = articleRE.exec(scope)) !== null) {
    const item = parseArticle(m[1]);
    if (item) results.push(item);
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────
// ARTICLE PARSER
// ─────────────────────────────────────────────────────────────────

function parseArticle(block) {
  try {
    // 1. URL & Slug
    const linkMatch = block.match(/<a\s+href="([^"]+)"/i);
    if (!linkMatch) return null;
    const url  = linkMatch[1];
    const slug = url.split('/').filter(Boolean).pop();

    // 2. Thumbnail — data-src (lazy) dulu, fallback src
    const imgLazy = block.match(/data-src="(https?:\/\/[^"]+)"/i);
    const imgSrc  = block.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
    const thumbnail = imgLazy ? imgLazy[1] : (imgSrc ? imgSrc[1] : '');

    // 3. Episode (span.epx)
    const epMatch = block.match(/<span\s+class="epx">([^<]+)<\/span>/i);

    // 4. Sub type (span.sb)
    const subMatch = block.match(/<span\s+class="sb\s+[^"]*">([^<]+)<\/span>/i);

    // 5. Type badge (div.typez) — "Donghua"
    const typeMatch = block.match(/<div\s+class="typez[^"]*">([^<]+)<\/div>/i);

    // 6. Title & Headline (div.tt)
    const ttMatch = block.match(/<div\s+class="tt">([\s\S]*?)<\/div>/i);
    let title = 'Unknown Title', headline = '';
    if (ttMatch) {
      const h2 = ttMatch[1].match(/<h2[^>]*>(.*?)<\/h2>/i);
      headline = h2 ? h2[1].trim() : '';
      title = ttMatch[1]
        .replace(/<h2[^>]*>.*?<\/h2>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
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
