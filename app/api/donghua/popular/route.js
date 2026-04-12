/**
 * app/api/donghua/donghuafilm/popular/route.js
 * Scraper "Popular Today" untuk donghuafilm.com
 * Adaptasi dari scraper latest/search yang sudah ada
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
  return handlePopular();
}

// ─────────────────────────────────────────────────────────────────
// POPULAR LOGIC
// ─────────────────────────────────────────────────────────────────

async function handlePopular() {
  const cacheKey = `donghuafilm:popular`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    // Popular Today ada di homepage
    const html = await fetchPage(`${BASE_URL}/`);
    const results = extractPopular(html);

    if (!results.length) {
      return errorResponse(404, 'Tidak ada data popular ditemukan.');
    }

    // Cache 10 menit (popular jarang berubah)
    await cacheSet(cacheKey, results, 600);
    return successResponse(results, { total: results.length, source: 'donghuafilm' });
  } catch (err) {
    return gatewayError(`Gagal ambil data popular: ${err.message}`);
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
    if (res.status === 403) throw new Error('Akses Ditolak (403). Coba gunakan ScraperAPI jika di Vercel.');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// PARSER — Seksi "Popular Today"
// Struktur dari source code gambar:
//   <div class="bixbox bbnofrm">
//     <div class="releases hothome">
//       <h2>Popular Today</h2>
//     </div>
//     <div class="listupd normal">
//       <div class="excstf">
//         <article class="bs" ...> ... </article>
//         ...
//       </div>
//     </div>
//   </div>
// ─────────────────────────────────────────────────────────────────

function extractPopular(html) {
  const results = [];

  // 1. Cari blok bixbox bbnofrm yang mengandung "Popular Today"
  //    Pakai regex greedy terbatas agar tidak salah blok
  const bixboxRE = /<div[^>]*class="[^"]*bixbox[^"]*bbnofrm[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let bixMatch;

  while ((bixMatch = bixboxRE.exec(html)) !== null) {
    const block = bixMatch[1];

    // Pastikan blok ini adalah "Popular Today"
    if (!/<h2[^>]*>\s*Popular Today\s*<\/h2>/i.test(block)) continue;

    // 2. Ambil konten di dalam listupd
    const listMatch = block.match(/<div[^>]*class="[^"]*listupd[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const scope = listMatch ? listMatch[1] : block;

    // 3. Parse tiap article.bs
    const articleRE = /<article[^>]*class="bs"[^>]*>([\s\S]*?)<\/article>/gi;
    let m;
    while ((m = articleRE.exec(scope)) !== null) {
      const item = parseArticle(m[1]);
      if (item) results.push(item);
    }

    break; // Sudah ketemu blok Popular, tidak perlu lanjut
  }

  // Fallback: kalau regex blok gagal (HTML minified/beda indent),
  // cari langsung dari excstf di dalam area setelah "Popular Today"
  if (!results.length) {
    const popularIdx = html.search(/<h2[^>]*>\s*Popular Today\s*<\/h2>/i);
    if (popularIdx !== -1) {
      const slice = html.slice(popularIdx, popularIdx + 30000); // ambil 30k char setelahnya
      const articleRE2 = /<article[^>]*class="bs"[^>]*>([\s\S]*?)<\/article>/gi;
      let m2;
      while ((m2 = articleRE2.exec(slice)) !== null) {
        const item = parseArticle(m2[1]);
        if (item) results.push(item);
        if (results.length >= 20) break; // batasi 20 item
      }
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────
// ARTICLE PARSER (sama persis dengan scraper utama)
// ─────────────────────────────────────────────────────────────────

function parseArticle(block) {
  try {
    // 1. URL & Slug
    const linkMatch = block.match(/<a\s+href="([^"]+)"/i);
    if (!linkMatch) return null;
    const url = linkMatch[1];
    const slug = url.split('/').filter(Boolean).pop();

    // 2. Thumbnail — ambil data-src (lazy-load) dulu, fallback ke src
    const imgLazyMatch = block.match(/data-src="(https?:\/\/[^"]+)"/i);
    const imgSrcMatch  = block.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
    const thumbnail = imgLazyMatch ? imgLazyMatch[1] : (imgSrcMatch ? imgSrcMatch[1] : '');

    // 3. Episode / Status (span.epx)
    const epMatch = block.match(/<span\s+class="epx">([^<]+)<\/span>/i);
    const episode = epMatch ? epMatch[1].trim() : 'Unknown';

    // 4. Sub Type (span.sb)
    const subMatch = block.match(/<span\s+class="sb\s+([^"]+)">([^<]+)<\/span>/i);
    const subType = subMatch ? subMatch[2].trim() : 'Sub';

    // 5. Title & Headline dari div.tt
    const ttMatch = block.match(/<div\s+class="tt">([\s\S]*?)<\/div>/i);
    let title    = 'Unknown Title';
    let headline = '';

    if (ttMatch) {
      const rawText = ttMatch[1];
      const h2Match = rawText.match(/<h2[^>]*>(.*?)<\/h2>/i);
      headline = h2Match ? h2Match[1].trim() : '';
      title = rawText
        .replace(/<h2[^>]*>.*?<\/h2>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
    }

    // 6. Type badge (div.typez) — contoh: "Donghua"
    const typeMatch = block.match(/<div\s+class="typez[^"]*">([^<]+)<\/div>/i);
    const type = typeMatch ? typeMatch[1].trim() : '';

    return {
      title:     title || headline,
      headline,
      slug,
      url,
      thumbnail,
      episode,   // "Ep 194", "Ongoing", dll
      sub_type:  subType,
      type,      // "Donghua", dll
      source:    'donghuafilm.com',
    };
  } catch {
    return null;
  }
}
