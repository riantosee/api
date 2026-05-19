/**
 * app/api/anime/detail/route.js
 * Detail anime — Otakudesu via Sankavollerei API
 *
 * DETAIL:
 *   GET /api/anime/detail?animeId=jujutsu-kaisen-s2-sub-indo
 *
 * Source: https://www.sankavollerei.com/anime/anime/:animeId
 */

import { cacheGet, cacheSet }                           from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────

const BASE_URL  = 'https://www.sankavollerei.com/anime/anime';
const CACHE_TTL = 600; // 10 menit

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const animeId = (searchParams.get('slug') || '').trim();

  if (!animeId) {
    return errorResponse(400, 'Parameter "animeId" diperlukan. Contoh: ?slug=jujutsu-kaisen-s2-sub-indo');
  }

  const cacheKey = `anime:detail:sankavollerei:${animeId}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const data = await fetchDetail(animeId);
    await cacheSet(cacheKey, data, CACHE_TTL);
    return successResponse(data);
  } catch (err) {
    console.error('[anime/detail][sankavollerei]', err.message);
    return gatewayError(`Gagal mengambil detail anime: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────────

async function fetchDetail(animeId) {
  const url        = `${BASE_URL}/${animeId}`;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      signal  : controller.signal,
      headers : { 'Accept': 'application/json' },
    });

    if (res.status === 404) throw new Error(`Anime "${animeId}" tidak ditemukan`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();

    if (json.statusCode !== 200 || !json.data) {
      throw new Error(json.message || 'Response tidak valid dari Sankavollerei');
    }

    return parseDetail(animeId, json.data);
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// PARSER
//
// json.data shape:
// {
//   title, poster, japanese, score, producers, type, status,
//   episodes, duration, aired, studios, batch,
//   synopsis      : { paragraphs: [], connections: [] },
//   genreList     : [{ title, genreId, href, otakudesuUrl }],
//   episodeList   : [{ title, eps, date, episodeId, href, otakudesuUrl }],
//   recommendedAnimeList : [{ title, poster, animeId, href, otakudesuUrl }]
// }
// ─────────────────────────────────────────────────────────────────

function parseDetail(animeId, d) {
  return {
    animeId,
    title     : d.title     || '',
    japanese  : d.japanese  || '',
    poster    : d.poster    || '',
    score     : d.score     ? parseFloat(d.score) || null : null,
    type      : d.type      || '',
    status    : d.status    || '',
    episodes  : d.episodes  ?? null,
    duration  : d.duration  || '',
    aired     : d.aired     || '',
    studios   : d.studios   || '',
    producers : d.producers || '',
    batch     : d.batch     || null,

    synopsis : {
      paragraphs  : d.synopsis?.paragraphs  || [],
      connections : d.synopsis?.connections || [],
    },

    genreList : (d.genreList || []).map(g => ({
      title       : g.title   || '',
      genreId     : g.genreId || '',
      href        : g.href    || '',
    })),

    episodeList : (d.episodeList || []).map(e => ({
      title     : e.title     || '',
      eps       : e.eps       ?? null,
      date      : e.date      || '',
      episodeId : e.episodeId || '',
      href      : e.href      || '',
    })),

    recommendedAnimeList : (d.recommendedAnimeList || []).map(r => ({
      title   : r.title   || '',
      poster  : r.poster  || '',
      animeId : r.animeId || '',
      href    : r.href    || '',
    })),
  };
}
