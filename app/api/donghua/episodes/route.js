/**
 * app/api/donghua/episodes/route.js
 * Daftar semua episode dari halaman anime — donghuafilm.com
 *
 * GET /api/donghua/episodes?slug=renegade-immortal
 * GET /api/donghua/episodes?url=https://donghuafilm.com/anime/renegade-immortal/
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
  const slug = (searchParams.get('slug') || '').trim();
  const url  = (searchParams.get('url')  || '').trim();

  if (!slug && !url) return errorResponse(400, 'Parameter "slug" atau "url" diperlukan.');

  const targetUrl = url || `${BASE_URL}/anime/${slug}/`;

  const cacheKey = `donghua:episodes:${targetUrl}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const html   = await fetchPage(targetUrl);
    const result = parseEpisodes(html, targetUrl);
    if (!result.episodes.length) return errorResponse(404, 'Tidak ada episode ditemukan.');
    await cacheSet(cacheKey, result, 600);
    return successResponse(result, { total: result.episodes.length, source: 'donghuafilm' });
  } catch (err) {
    return gatewayError(`Gagal ambil episode: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH
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
// PARSER
// Struktur: <li data-id="218"> <a href="..."> thumbnail + playinfo </a> </li>
// ─────────────────────────────────────────────────────────────────

function parseEpisodes(html, pageUrl) {
  const episodes = [];

  const liRE = /<li\s+data-id="(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRE.exec(html)) !== null) {
    const dataId = m[1];
    const block  = m[2];

    const linkMatch = block.match(/<a\s+href="([^"]+)"\s+itemprop="url"/i);
    if (!linkMatch) continue;
    const epUrl  = linkMatch[1];
    const epSlug = epUrl.split('/').filter(Boolean).pop();

    const imgLazy = block.match(/data-src="(https?:\/\/[^"]+)"/i);
    const imgSrc  = block.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
    const thumbnail = imgLazy ? imgLazy[1] : (imgSrc ? imgSrc[1] : '');

    const h3Match   = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title     = h3Match ? stripTags(h3Match[1]).trim() : '';

    const spanMatch = block.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
    const info      = spanMatch ? stripTags(spanMatch[1]).trim() : '';

    const epsNumMatch = info.match(/Eps\s+([\d.]+)/i);
    const dateMatch   = info.match(/-\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})\s*$/i)
                     || info.match(/-\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*$/i);

    episodes.push({
      data_id:        dataId,
      episode_number: epsNumMatch ? epsNumMatch[1] : '',
      title,
      info,
      date:      dateMatch ? dateMatch[1].trim() : '',
      url:       epUrl,
      slug:      epSlug,
      thumbnail,
    });
  }

  // Urutkan ascending (ep 1 → terakhir)
  episodes.sort((a, b) => parseInt(a.data_id) - parseInt(b.data_id));

  return { page_url: pageUrl, episodes };
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
}
