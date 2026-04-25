/**
 * app/api/anime/watch/route.js
 * Info episode + server/mirror list — Samehadaku
 *
 * WATCH:
 *   GET /api/anime/watch?slug=one-punch-man-episode-12
 *   GET /api/anime/watch?slug=one-punch-man-episode-12&mirror=2
 *
 * Query params:
 *   slug   — slug episode (required)
 *   mirror — nomor mirror untuk fetch embed URL (optional, default: semua server)
 *
 * Source: https://v2.samehadaku.how/{slug}/
 * Video: POST https://v2.samehadaku.how/wp-admin/admin-ajax.php
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const slug   = (searchParams.get('slug') || '').trim().toLowerCase();
  const mirror = searchParams.get('mirror') ? Number(searchParams.get('mirror')) : null;

  if (!slug) return errorResponse(400, 'Parameter "slug" diperlukan. Contoh: ?slug=one-punch-man-episode-12');

  const cacheKey = `anime:watch:samehadaku:${slug}:${mirror ?? 'all'}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    // Step 1: fetch halaman episode → ambil postId, nonce, server list, info episode
    const { postId, nonce, servers, episodeInfo } = await fetchEpisodePage(slug);

    // Step 2: fetch embed URL per mirror
    let streams = [];
    if (mirror !== null) {
      // Fetch satu mirror saja
      const server = servers.find(s => s.nume === mirror);
      if (!server) return errorResponse(404, `Mirror ${mirror} tidak ditemukan`);
      const embedUrl = await fetchEmbedUrl({ postId, nonce, nume: mirror, type: server.type });
      streams = [{ ...server, embedUrl }];
    } else {
      // Fetch semua mirror secara paralel
      streams = await Promise.all(
        servers.map(async s => {
          const embedUrl = await fetchEmbedUrl({ postId, nonce, nume: s.nume, type: s.type })
            .catch(() => null);
          return { ...s, embedUrl };
        })
      );
    }

    const payload = {
      source : 'samehadaku',
      slug,
      ...episodeInfo,
      streams,
    };

    await cacheSet(cacheKey, payload, 300); // cache 5 menit
    return successResponse(payload);
  } catch (err) {
    console.error(`[anime/watch/${slug}][samehadaku]`, err.message);
    return gatewayError(`Gagal mengambil data episode: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────────

const BASE_HEADERS = {
  'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'     : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer'    : 'https://v2.samehadaku.how/',
};

async function fetchHtml(targetUrl) {
  const scraperKey = process.env.SCRAPER_API_KEY;
  const fetchUrl   = scraperKey
    ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(targetUrl)}&render=false`
    : targetUrl;

  const headers    = scraperKey ? {} : BASE_HEADERS;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(fetchUrl, { signal: controller.signal, headers });
    if (res.status === 403) throw new Error('Akses ditolak (403)');
    if (res.status === 404) throw new Error('Episode tidak ditemukan (404)');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// STEP 1 — Parse halaman episode
//
// Ambil:
// - postId  : data-post="35355"
// - nonce   : easthemeajax = { nonce: "0854d2c17b" }
// - servers : div.east_player_option[data-post][data-nume][data-type]
// - info    : judul, thumbnail, tanggal, navigasi prev/next
// ─────────────────────────────────────────────────────────────────

async function fetchEpisodePage(slug) {
  const html = await fetchHtml(`https://v2.samehadaku.how/${slug}/`);

  // ── Post ID
  const postIdMatch = html.match(/data-post="(\d+)"/);
  const postId      = postIdMatch?.[1] || null;
  if (!postId) throw new Error('Tidak bisa menemukan post ID');

  // ── Nonce dari easthemeajax
  const nonceMatch = html.match(/easthemeajax\s*=\s*\{[^}]*"nonce"\s*:\s*"([a-f0-9]+)"/i)
                  || html.match(/"nonce"\s*:\s*"([a-f0-9]+)"/i);
  const nonce      = nonceMatch?.[1] || '';

  // ── Server list dari div.east_player_option
  const servers  = [];
  const serverRE = /<div\s+id="player-option-(\d+)"\s+class="east_player_option"\s+data-post="\d+"\s+data-nume="(\d+)"\s+data-type="([^"]+)"[^>]*>\s*<span>([^<]+)<\/span>/gi;
  let sm;
  while ((sm = serverRE.exec(html)) !== null) {
    servers.push({
      id    : Number(sm[1]),
      nume  : Number(sm[2]),
      type  : sm[3],
      label : sm[4].trim(),
    });
  }

  // ── Info episode
  const titleMatch = html.match(/<h1\s+class="entry-title"[^>]*>\s*([^<]+)\s*<\/h1>/i)
                  || html.match(/<title>([^<]+)\s*-\s*Samehadaku<\/title>/i);
  const title      = titleMatch?.[1]?.trim().replace(/\s*Sub(?:title)?\s*Indonesia/i, '').trim() || slug;

  // Thumbnail dari og:image
  const thumbMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  const thumbnail  = thumbMatch?.[1] || '';

  // Tanggal publish
  const dateMatch  = html.match(/<meta\s+property="article:published_time"\s+content="([^"]+)"/i);
  const publishedAt = dateMatch?.[1] || '';

  // Navigasi prev/next episode
  const prevMatch  = html.match(/<a[^>]+class="[^"]*prev[^"]*"[^>]+href="(https?:\/\/v2\.samehadaku\.how\/([^/"]+)\/)"[^>]*>/i);
  const nextMatch  = html.match(/<a[^>]+class="[^"]*next[^"]*"[^>]+href="(https?:\/\/v2\.samehadaku\.how\/([^/"]+)\/)"[^>]*>/i);

  const episodeInfo = {
    title,
    thumbnail,
    publishedAt,
    url       : `https://v2.samehadaku.how/${slug}/`,
    prevEpisode : prevMatch ? { url: prevMatch[1], slug: prevMatch[2] } : null,
    nextEpisode : nextMatch ? { url: nextMatch[1], slug: nextMatch[2] } : null,
  };

  return { postId, nonce, servers, episodeInfo };
}

// ─────────────────────────────────────────────────────────────────
// STEP 2 — Fetch embed URL via admin-ajax.php
//
// POST https://v2.samehadaku.how/wp-admin/admin-ajax.php
// Body (form): action=player_ajax&post={postId}&nume={nume}&type={type}
// Header: X-Requested-With: XMLHttpRequest, Referer: episode URL
//
// Response: HTML string berisi <iframe src="..."> atau embed code
// ─────────────────────────────────────────────────────────────────

const AJAX_URL = 'https://v2.samehadaku.how/wp-admin/admin-ajax.php';
const AJAX_ACTIONS = ['player_ajax', 'action_iframe', 'east_player_ajax', 'wp_manga_chapter_ajax'];

async function fetchEmbedUrl({ postId, nonce, nume, type }) {
  const scraperKey = process.env.SCRAPER_API_KEY;

  // Coba beberapa action yang umum dipakai tema WordPress anime
  for (const action of AJAX_ACTIONS) {
    try {
      const body = new URLSearchParams({ action, post: postId, nume, type, nonce });

      const fetchUrl = scraperKey
        ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(AJAX_URL)}&render=false`
        : AJAX_URL;

      const res = await fetch(fetchUrl, {
        method  : 'POST',
        headers : {
          'Content-Type'     : 'application/x-www-form-urlencoded',
          'X-Requested-With' : 'XMLHttpRequest',
          'Referer'          : 'https://v2.samehadaku.how/',
          'User-Agent'       : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...(scraperKey ? {} : {}),
        },
        body    : body.toString(),
      });

      const text = await res.text();
      if (!text || text === '0' || text === '-1') continue;

      // Parse embed URL dari response HTML
      const embedUrl = extractEmbedUrl(text);
      if (embedUrl) return embedUrl;

      // Kembalikan raw response jika tidak bisa parse
      return text.slice(0, 500);
    } catch {
      continue;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────
// EXTRACT EMBED URL dari response HTML ajax
// ─────────────────────────────────────────────────────────────────

function extractEmbedUrl(html) {
  if (!html) return null;

  // iframe src
  const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"/i);
  if (iframeMatch) return iframeMatch[1];

  // source src (video tag)
  const sourceMatch = html.match(/<source[^>]+src="([^"]+)"/i);
  if (sourceMatch) return sourceMatch[1];

  // file: "..." (jwplayer style)
  const fileMatch = html.match(/file\s*:\s*["']([^"']+\.(?:mp4|m3u8|mkv)[^"']*)["']/i);
  if (fileMatch) return fileMatch[1];

  // URL langsung dalam response
  const urlMatch = html.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)/i);
  if (urlMatch) return urlMatch[0];

  return null;
}
