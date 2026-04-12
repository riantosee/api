/**
 * app/api/donghua/schedule/route.js
 * Scraper jadwal rilis mingguan — donghuafilm.com
 *
 * GET /api/donghua/schedule          → semua hari
 * GET /api/donghua/schedule?day=sunday → hari tertentu
 */

import { cacheGet, cacheSet }                           from '../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../lib/response-utils.js';

const BASE_URL  = 'https://donghuafilm.com';
const SCHED_URL = `${BASE_URL}/schedule/`;

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
  const day = (searchParams.get('day') || '').toLowerCase().trim();

  if (day && !DAYS.includes(day)) {
    return errorResponse(400, `Parameter "day" tidak valid. Pilihan: ${DAYS.join(', ')}`);
  }

  const cacheKey = `donghua:schedule:${day || 'all'}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const html    = await fetchPage(SCHED_URL);
    const schedule = parseSchedule(html);

    if (!Object.keys(schedule).length) {
      return errorResponse(404, 'Data jadwal tidak ditemukan.');
    }

    // Filter per hari jika ada query ?day=
    const result = day ? { [day]: schedule[day] ?? [] } : schedule;

    // Cache 1 jam (jadwal jarang berubah)
    await cacheSet(cacheKey, result, 3600);
    return successResponse(result, {
      days:   Object.keys(result),
      source: 'donghuafilm',
    });
  } catch (err) {
    return gatewayError(`Gagal ambil jadwal: ${err.message}`);
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
//
// Struktur dari source code gambar:
//   <div class="bixbox schedulepage sch_sunday">
//     <div class="releases"><h3><span>Sunday</span></h3></div>
//     <div class="listupd">
//       <div class="bs"><div class="bsx">
//         <a href="https://donghuafilm.com/anime/the-charm-of-soul-pets/" title="The Charm of Soul Pets">
//           <div class="limit">
//             <div class="ply">...</div>
//             <div class="bt">
//               <span class='epx cndwn' data-cndwn='-22532' data-rlsdt=''>at 15:31</span>
//               <span class="sb Sub">??</span>
//             </div>
//           </div>
//           <img data-src="https://..." alt="..." />
//           <div class="tt">The Charm of Soul Pets</div>
//         </a>
//       </div></div>
//     </div>
//   </div>
// ─────────────────────────────────────────────────────────────────

function parseSchedule(html) {
  const schedule = {};

  // Iterasi tiap hari
  for (const day of DAYS) {
    // Cari blok schedulepage untuk hari ini
    const dayRE = new RegExp(
      `<div[^>]*class="[^"]*schedulepage[^"]*sch_${day}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>\\s*<\\/div>\\s*<\\/div>`,
      'i'
    );
    const dayMatch = html.match(dayRE);

    // Fallback: cari heading hari lalu ambil konten setelahnya
    let scope = '';
    if (dayMatch) {
      scope = dayMatch[1];
    } else {
      const headingRE = new RegExp(`<h3[^>]*>\\s*<span>\\s*${day}\\s*<\\/span>\\s*<\\/h3>`, 'i');
      const idx = html.search(headingRE);
      if (idx !== -1) {
        scope = html.slice(idx, idx + 40000);
      }
    }

    if (!scope) { schedule[day] = []; continue; }

    const items = [];
    // Ambil tiap div.bs
    const bsRE = /<div\s+class="bs"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
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
    // URL & title dari <a>
    const linkMatch = block.match(/<a\s+href="([^"]+)"\s+title="([^"]+)"/i);
    if (!linkMatch) return null;
    const url   = linkMatch[1];
    const title = linkMatch[2];
    const slug  = url.split('/').filter(Boolean).pop();

    // Thumbnail
    const imgLazy = block.match(/data-src="(https?:\/\/[^"]+)"/i);
    const imgSrc  = block.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
    const thumbnail = imgLazy ? imgLazy[1] : (imgSrc ? imgSrc[1] : '');

    // Waktu rilis — span.epx.cndwn  → "at 15:31"
    const timeMatch   = block.match(/<span[^>]*class='epx\s+cndwn'[^>]*data-cndwn='([^']*)'[^>]*data-rlsdt='([^']*)'[^>]*>([^<]+)<\/span>/i);
    const releaseTime = timeMatch ? timeMatch[3].trim() : '';   // "at 15:31"
    const cndwn       = timeMatch ? timeMatch[1] : '';           // countdown value
    const rlsdt       = timeMatch ? timeMatch[2] : '';           // release date if any

    // Sub count / status — span.sb
    const subMatch = block.match(/<span[^>]*class="sb[^"]*">([^<]+)<\/span>/i);
    const subCount = subMatch ? subMatch[1].trim() : '';         // "??" atau angka ep

    // Title dari div.tt (lebih bersih)
    const ttMatch   = block.match(/<div\s+class="tt">([^<]+)<\/div>/i);
    const titleClean = ttMatch ? ttMatch[1].trim() : title;

    return {
      title:        titleClean,
      url,
      slug,
      thumbnail,
      release_time: releaseTime,  // "at 15:31"
      countdown:    cndwn,        // countdown detik (negatif = sudah lewat)
      release_date: rlsdt,
      episode:      subCount,     // episode terbaru atau "??"
      source:       'donghuafilm.com',
    };
  } catch { return null; }
}
