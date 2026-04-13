/**
 * app/api/donghua/schedule/route.js
 * Scraper jadwal rilis mingguan — donghuafilm.com
 *
 * GET /api/donghua/schedule              → semua hari
 * GET /api/donghua/schedule?day=sunday   → hari tertentu
 * GET /api/donghua/schedule?refresh=true → clear cache
 */

import { cacheGet, cacheSet, cacheDel }                 from '../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../lib/response-utils.js';

const BASE_URL  = 'https://donghuafilm.com';
const SCHED_URL = `${BASE_URL}/segera-tayang/`;

const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

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
  const day     = (searchParams.get('day') || '').toLowerCase().trim();
  const refresh = searchParams.get('refresh') === 'true';

  if (day && !DAYS.includes(day)) {
    return errorResponse(400, `Parameter "day" tidak valid. Pilihan: ${DAYS.join(', ')}`);
  }

  const cacheKey = `donghua:schedule:${day || 'all'}`;

  // Clear cache jika refresh=true
  if (refresh && cacheDel) await cacheDel(cacheKey);

  if (!refresh) {
    const hit = await cacheGet(cacheKey);
    if (hit) {
      // Jangan pakai cache kalau semua hari kosong (cache rusak dari block sebelumnya)
      const hasData = Object.values(hit).some(arr => Array.isArray(arr) && arr.length > 0);
      if (hasData) return successResponse(hit, { fromCache: true });
    }
  }

  try {
    const html = await fetchPage(SCHED_URL);

    // Validasi HTML — kalau tidak ada konten schedule berarti di-block
    if (!html.includes('schedulepage') && !html.includes('Schedule')) {
      throw new Error('HTML tidak valid — site mungkin memblokir Vercel. Tambahkan SCRAPER_API_KEY di env.');
    }

    const schedule = parseSchedule(html);
    const result   = day ? { [day]: schedule[day] ?? [] } : schedule;

    // Hanya cache kalau ada data
    const hasData = Object.values(result).some(arr => Array.isArray(arr) && arr.length > 0);
    if (hasData) await cacheSet(cacheKey, result, 3600);

    return successResponse(result, { days: Object.keys(result), source: 'donghuafilm' });
  } catch (err) {
    return gatewayError(`Gagal ambil jadwal: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH
// Otomatis pakai ScraperAPI jika SCRAPER_API_KEY ada di env.
// Daftar gratis di: https://www.scraperapi.com (1000 req/bulan)
// Tambah di Vercel: Settings → Environment Variables → SCRAPER_API_KEY
// ─────────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const scraperKey = process.env.SCRAPER_API_KEY;

  const targetUrl = scraperKey
    ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(url)}&render=false`
    : url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(targetUrl, {
      signal:  controller.signal,
      headers: scraperKey ? {} : HEADERS,
    });
    if (res.status === 403) throw new Error('Akses Ditolak (403) — aktifkan SCRAPER_API_KEY di env.');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// PARSER
// ─────────────────────────────────────────────────────────────────

function parseSchedule(html) {
  const schedule = {};

  for (const day of DAYS) {
    const capDay = day.charAt(0).toUpperCase() + day.slice(1);

    // Cari heading hari
    const headingRE = new RegExp(`<h3[^>]*>\\s*<span>\\s*${capDay}\\s*<\\/span>\\s*<\\/h3>`, 'i');
    const idx = html.search(headingRE);
    if (idx === -1) { schedule[day] = []; continue; }

    // Slice sampai heading hari berikutnya
    const nextDay = DAYS[DAYS.indexOf(day) + 1];
    const nextCap = nextDay ? nextDay.charAt(0).toUpperCase() + nextDay.slice(1) : null;
    const nextRE  = nextCap
      ? new RegExp(`<h3[^>]*>\\s*<span>\\s*${nextCap}\\s*<\\/span>\\s*<\\/h3>`, 'i')
      : null;

    let endIdx = html.length;
    if (nextRE) {
      const nextMatch = html.slice(idx + 10).search(nextRE);
      if (nextMatch !== -1) endIdx = idx + 10 + nextMatch;
    }

    const scope = html.slice(idx, endIdx);
    const items = [];

    const bsRE = /<div\s+class="bsx"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    let m;
    while ((m = bsRE.exec(scope)) !== null) {
      const item = parseItem(m[1]);
      if (item) items.push(item);
    }

    schedule[day] = items;
  }

  return schedule;
}

function parseItem(block) {
  try {
    const linkMatch = block.match(/<a\s+href="([^"]+)"\s+title="([^"]+)"/i);
    if (!linkMatch) return null;
    const url   = linkMatch[1];
    const title = linkMatch[2];
    const slug  = url.split('/').filter(Boolean).pop();

    const imgLazy   = block.match(/data-src="(https?:\/\/[^"]+)"/i);
    const imgSrc    = block.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
    const thumbnail = imgLazy ? imgLazy[1] : (imgSrc ? imgSrc[1] : '');

    const timeMatch   = block.match(/class='epx\s+cndwn'[^>]*data-cndwn='([^']*)'[^>]*data-rlsdt='([^']*)'[^>]*>([^<]+)</i);
    const releaseTime = timeMatch ? timeMatch[3].trim() : '';
    const cndwn       = timeMatch ? timeMatch[1] : '';
    const rlsdt       = timeMatch ? timeMatch[2] : '';

    const subMatch = block.match(/<span[^>]*class="sb[^"]*">([^<]+)<\/span>/i);
    const episode  = subMatch ? subMatch[1].trim() : '';

    const ttMatch    = block.match(/<div\s+class="tt">([^<]+)<\/div>/i);
    const titleClean = ttMatch ? ttMatch[1].trim() : title;

    return {
      title:        titleClean,
      url,
      slug,
      thumbnail,
      release_time: releaseTime,
      countdown:    cndwn,
      release_date: rlsdt,
      episode,
      source:       'donghuafilm.com',
    };
  } catch { return null; }
}
