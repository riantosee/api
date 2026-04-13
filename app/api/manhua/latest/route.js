/**
 * app/api/manhua/latest/route.js
 * Scraper "Latest Update" — manhwaindo.my
 *
 * GET /api/manhua/latest        → halaman 1
 * GET /api/manhua/latest?page=2 → halaman berikutnya
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

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  const cacheKey = `manhua:latest:${page}`;
  const hit = await cacheGet(cacheKey);
  if (hit && Array.isArray(hit) && hit.length > 0)
    return successResponse(hit, { fromCache: true, page });

  try {
    const url = page > 1
      ? `${BASE_URL}/series/?order=update&page=${page}`
      : `${BASE_URL}/`;

    const html    = await fetchPage(url);
    const results = page > 1
      ? parseUtaItems(html)
      : extractSection(html, 'Latest Update');

    if (!results.length) return errorResponse(404, 'Data latest tidak ditemukan.');

    await cacheSet(cacheKey, results, 300);
    return successResponse(results, { total: results.length, page, source: 'manhwaindo.my' });
  } catch (err) {
    return gatewayError(`Gagal ambil latest: ${err.message}`);
  }
}

async function fetchPage(url) {
  const scraperKey = process.env.SCRAPER_API_KEY;
  const targetUrl  = scraperKey
    ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(url)}&render=false`
    : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(targetUrl, { signal: controller.signal, headers: scraperKey ? {} : HEADERS });
    if (res.status === 403) throw new Error('Akses Ditolak (403).');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

function extractSection(html, heading) {
  const idx = html.search(new RegExp(`<h2[^>]*>\\s*${heading}\\s*<\\/h2>`, 'i'));
  if (idx === -1) return [];
  return parseUtaItems(html.slice(idx, idx + 80000));
}

function parseUtaItems(html) {
  const results = [];
  const utaRE = /<div\s+class="uta"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let m;
  while ((m = utaRE.exec(html)) !== null) {
    const item = parseUtaItem(m[1]);
    if (item) results.push(item);
  }
  return results;
}

function parseUtaItem(block) {
  try {
    const linkMatch = block.match(/<a[^>]+class="series"[^>]+href="([^"]+)"[^>]+title="([^"]+)"/i)
                   || block.match(/<a[^>]+href="([^"]+)"[^>]+class="series"[^>]+title="([^"]+)"/i);
    if (!linkMatch) return null;

    const url     = linkMatch[1];
    const title   = linkMatch[2];
    const slug    = url.split('/').filter(Boolean).pop();
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;

    const relMatch    = block.match(/rel="(\d+)"/i);
    const lazySrc     = block.match(/data-src="(https?:\/\/[^"]+)"/i);
    const noscriptSrc = block.match(/<noscript>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+)"/i);
    const thumbnail   = lazySrc ? lazySrc[1] : (noscriptSrc ? noscriptSrc[1] : '');

    const h4Match      = block.match(/<h4[^>]*>([^<]+)<\/h4>/i);
    const ulClassMatch = block.match(/<ul\s+class="([^"]+)">/i);

    const chapters  = [];
    const ulContent = block.match(/<ul\s+class="[^"]*">([\s\S]*?)<\/ul>/i);
    if (ulContent) {
      const liRE = /<li>\s*<a\s+href="([^"]+)">([^<]+)<\/a>\s*<span>([^<]+)<\/span>\s*<\/li>/gi;
      let lm;
      while ((lm = liRE.exec(ulContent[1])) !== null) {
        chapters.push({
          url:      lm[1].startsWith('http') ? lm[1] : `${BASE_URL}${lm[1]}`,
          chapter:  lm[2].trim(),
          time_ago: lm[3].trim(),
        });
      }
    }

    return {
      title:    h4Match ? h4Match[1].trim() : title,
      slug,
      url:      fullUrl,
      manga_id: relMatch ? relMatch[1] : '',
      thumbnail,
      type:     ulClassMatch ? ulClassMatch[1].trim() : '',
      is_hot:   /<span\s+class="hot">/i.test(block),
      chapters,
      source:   'manhwaindo.my',
    };
  } catch { return null; }
}
