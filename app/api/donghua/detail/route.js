/**
 * app/api/donghua/detail/route.js
 * Detail anime + video server — donghuafilm.com
 *
 * GET /api/donghua/detail?slug=renegade-immortal-episode-135-subtitle-indonesia
 * GET /api/donghua/detail?url=https://donghuafilm.com/renegade-immortal-episode-135-subtitle-indonesia/
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

  const targetUrl = url || `${BASE_URL}/${slug}/`;

  const cacheKey = `donghua:detail:${targetUrl}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const html   = await fetchPage(targetUrl);
    const result = parseDetail(html, targetUrl);
    if (!result) return errorResponse(404, 'Gagal parse halaman detail.');
    await cacheSet(cacheKey, result, 600);
    return successResponse(result, { source: 'donghuafilm' });
  } catch (err) {
    return gatewayError(`Gagal ambil detail: ${err.message}`);
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
// PARSERS
// ─────────────────────────────────────────────────────────────────

function parseDetail(html, pageUrl) {
  try {
    return {
      url: pageUrl,
      ...parseInfoBox(html),
      video:      parseVideo(html),
      navigation: parseNavigation(html),
    };
  } catch { return null; }
}

function parseInfoBox(html) {
  const imgMatch = html.match(/<img[^>]+data-src="(https?:\/\/[^"]+)"[^>]*itemprop="image"/i)
                || html.match(/<img[^>]+src="(https?:\/\/[^"]+)"[^>]*itemprop="image"/i);
  const thumbnail = imgMatch ? imgMatch[1] : '';

  const titleMatch = html.match(/<h2[^>]*itemprop="partOfSeries"[^>]*>(.*?)<\/h2>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : '';

  const ratingMatch = html.match(/<strong>\s*Rating\s*([\d.]+)\s*<\/strong>/i);
  const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

  const speMatch = html.match(/<div\s+class="spe">([\s\S]*?)<\/div>/i);
  const speBlock = speMatch ? speMatch[1] : '';

  const genreMatch = html.match(/<div\s+class="genxed">([\s\S]*?)<\/div>/i);
  const genres = genreMatch
    ? [...genreMatch[1].matchAll(/<a[^>]*rel="tag"[^>]*>([^<]+)<\/a>/gi)].map(m => m[1].trim())
    : [];

  const descMatch = html.match(/<div\s+class="desc\s+mindes">([\s\S]*?)<span\s+class="colap"/i)
                 || html.match(/<div\s+class="desc[^"]*">([\s\S]*?)<\/div>/i);
  const synopsis = descMatch ? stripTags(descMatch[1]).trim() : '';

  return {
    title,
    thumbnail,
    rating,
    status:   extractSpeField(speBlock, 'Status'),
    network:  extractSpeFieldLink(speBlock, 'Network'),
    studio:   extractSpeFieldLink(speBlock, 'Studio'),
    released: extractSpeField(speBlock, 'Released'),
    duration: extractSpeField(speBlock, 'Duration'),
    season:   extractSpeFieldLink(speBlock, 'Season'),
    country:  extractSpeFieldLink(speBlock, 'Country'),
    type:     extractSpeField(speBlock, 'Type'),
    episodes: extractSpeField(speBlock, 'Episodes'),
    fansub:   extractSpeField(speBlock, 'Fansub'),
    censor:   extractSpeField(speBlock, 'Censor'),
    genres,
    synopsis,
  };
}

function extractSpeField(block, label) {
  const m = block.match(new RegExp(`<b>${label}:<\\/b>\\s*([^<]+)`, 'i'));
  return m ? m[1].trim() : '';
}

function extractSpeFieldLink(block, label) {
  const m = block.match(new RegExp(`<b>${label}:<\\/b>\\s*<a[^>]*>([^<]+)<\\/a>`, 'i'));
  return m ? m[1].trim() : extractSpeField(block, label);
}

function parseVideo(html) {
  const videoSrcMatch = html.match(/<source\s+src="(https?:\/\/[^"]+)"\s+type="video\/mp4"/i);
  const iframeMatch   = html.match(/<iframe[^>]+src="(https?:\/\/[^"]+)"[^>]*>/i);

  const servers = [];
  const selectMatch = html.match(/<select[^>]*class="mirror"[^>]*>([\s\S]*?)<\/select>/i);
  if (selectMatch) {
    const optionRE = /<option\s+value="([^"]+)"\s+data-index="(\d+)"[^>]*>([^<]+)<\/option>/gi;
    let om;
    while ((om = optionRE.exec(selectMatch[1])) !== null) {
      servers.push({ index: parseInt(om[2], 10), name: om[3].trim(), encoded: om[1] });
    }
  }

  return {
    direct:  videoSrcMatch ? videoSrcMatch[1] : null,
    iframe:  iframeMatch   ? iframeMatch[1]   : null,
    servers,
  };
}

function parseNavigation(html) {
  const prevMatch  = html.match(/<a[^>]+href="([^"]+)"[^>]*rel="prev"[^>]*>/i);
  const nextMatch  = html.match(/<a[^>]+href="([^"]+)"[^>]*rel="next"[^>]*>/i);
  const allEpMatch = html.match(/<a[^>]+href='([^']+)'[^>]*aria-label='All Episodes'[^>]*>/i)
                  || html.match(/<a[^>]+href="([^"]+)"[^>]*aria-label="All Episodes"[^>]*>/i);
  return {
    prev_episode: prevMatch  ? prevMatch[1]  : null,
    next_episode: nextMatch  ? nextMatch[1]  : null,
    all_episodes: allEpMatch ? allEpMatch[1] : null,
  };
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#8230;/g, '…').trim();
}
