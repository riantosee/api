/**
 * app/api/manhua/detail/route.js
 * Scraper detail series + daftar chapter — manhwaindo.my
 *
 * GET /api/manhua/detail?slug=only-i-have-an-ex-grade-summon
 * GET /api/manhua/detail?url=https://www.manhwaindo.my/series/only-i-have-an-ex-grade-summon/
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

  const targetUrl = url || `${BASE_URL}/series/${slug}/`;

  const cacheKey = `manhua:detail:${targetUrl}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const html   = await fetchPage(targetUrl);
    const result = parseDetail(html, targetUrl);
    if (!result) return errorResponse(404, 'Gagal parse halaman detail.');

    await cacheSet(cacheKey, result, 600);
    return successResponse(result, { source: 'manhwaindo.my' });
  } catch (err) {
    return gatewayError(`Gagal ambil detail: ${err.message}`);
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

function parseDetail(html, pageUrl) {
  try {
    return {
      url: pageUrl,
      ...parseInfoBox(html),
      chapters: parseChapterList(html),
    };
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────
// 1. INFO BOX
//
// Dari gambar 1:
//   - thumbnail: img src itemprop="image"
//   - colored: span.colored
//   - bookmark count: div.bmc "Followed by 108 people"
//   - rating bar: div.rtb span style="width:77%"
//   - rating score: div.num ratingValue content="7.7"
//   - status: div.imptdt "Status <i>Ongoing</i>"
//   - type: div.imptdt "Type <a>Manhwa</a>"
//   - released: div.imptdt "Released <i>2026</i>"
//   - posted_by: div.imptdt "Posted By <span itemprop="author">MainStains</span>"
//   - posted_on: div.imptdt "Posted On <time datetime="...">5 April 2026</time>"
//   - updated_on: div.imptdt "Updated On <time datetime="...">13 April 2026</time>"
//   - title: h1.entry-title itemprop="name"
//   - genres: div.wd-full span.mgen a[rel="tag"]
//   - synopsis: div.entry-content.entry-content-single p
// ─────────────────────────────────────────────────────────────────

function parseInfoBox(html) {
  // Thumbnail
  const imgMatch  = html.match(/<img[^>]+itemprop="image"[^>]+src="(https?:\/\/[^"]+)"/i)
                 || html.match(/<img[^>]+src="(https?:\/\/[^"]+)"[^>]+itemprop="image"/i);
  const thumbnail = imgMatch ? imgMatch[1] : '';

  // Colored
  const isColored = /class="colored"/i.test(html);

  // Followers
  const followMatch = html.match(/<div\s+class="bmc">([^<]+)<\/div>/i);
  const followers   = followMatch ? followMatch[1].trim() : '';

  // Rating bar & score
  const barMatch   = html.match(/class="rtb"><span\s+style="width:([^"]+)"/i);
  const scoreMatch = html.match(/class="num"\s+ratingValue\s+content="([^"]+)">([^<]+)<\/div>/i)
                  || html.match(/content="([^"]+)"[^>]*>\s*([\d.]+)\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div\s+class="tsinfo/i);
  const ratingBar  = barMatch   ? barMatch[1]            : '';
  const rating     = scoreMatch ? parseFloat(scoreMatch[2] || scoreMatch[1]) : null;

  // div.imptdt fields
  const status     = extractImptdt(html, 'Status',     'i');
  const type       = extractImptdt(html, 'Type',       'a');
  const released   = extractImptdt(html, 'Released',   'i');
  const postedBy   = extractImptdt(html, 'Posted By',  'span');
  const postedOn   = extractImptdtTime(html, 'Posted On');
  const updatedOn  = extractImptdtTime(html, 'Updated On');

  // Title dari h1.entry-title
  const titleMatch = html.match(/<h1[^>]*class="entry-title"[^>]*itemprop="name"[^>]*>([^<]+)<\/h1>/i)
                  || html.match(/<h1[^>]*itemprop="name"[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Genres dari span.mgen a[rel="tag"]
  const mgenMatch = html.match(/<div\s+class="wd-full"[^>]*>[\s\S]*?<span\s+class="mgen">([\s\S]*?)<\/span>/i);
  const genres    = mgenMatch
    ? [...mgenMatch[1].matchAll(/<a[^>]*rel="tag"[^>]*>([^<]+)<\/a>/gi)].map(m => m[1].trim())
    : [];

  // Synopsis dari div.entry-content p
  const synopsisMatch = html.match(/<div[^>]*class="entry-content[^"]*"[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
  const synopsis = synopsisMatch
    ? synopsisMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : '';

  // First & Last chapter info
  const firstChMatch = html.match(/class="epcur\s+epcurfirst">([^<]+)<\/span>/i);
  const lastChMatch  = html.match(/class="epcur\s+epcurlast">([^<]+)<\/span>/i);
  const lastChUrl    = html.match(/<a\s+href="(https?:\/\/[^"]+)"[^>]*>\s*<span>New Chapter<\/span>/i);

  return {
    title,
    thumbnail,
    is_colored:  isColored,
    followers,
    rating,
    rating_bar:  ratingBar,
    status,
    type,
    released,
    posted_by:   postedBy,
    posted_on:   postedOn,
    updated_on:  updatedOn,
    genres,
    synopsis,
    first_chapter: firstChMatch ? firstChMatch[1].trim() : '',
    last_chapter:  lastChMatch  ? lastChMatch[1].trim()  : '',
    last_chapter_url: lastChUrl ? lastChUrl[1] : '',
  };
}

// Helper ambil teks dari div.imptdt label + tag tertentu
function extractImptdt(html, label, tag) {
  const re = new RegExp(
    `<div\\s+class="imptdt">\\s*${label}\\s*<${tag}[^>]*>([^<]+)<\\/${tag}>`, 'i'
  );
  const m = html.match(re);
  return m ? m[1].trim() : '';
}

// Helper ambil datetime dari div.imptdt + <time>
function extractImptdtTime(html, label) {
  const re = new RegExp(
    `<div\\s+class="imptdt">\\s*${label}\\s*<i><time[^>]*datetime="([^"]+)"[^>]*>([^<]+)<\\/time><\\/i><\\/div>`, 'i'
  );
  const m = html.match(re);
  return m ? { datetime: m[1], display: m[2].trim() } : null;
}

// ─────────────────────────────────────────────────────────────────
// 2. CHAPTER LIST
//
// Dari gambar 2:
//   <div class="eplister" id="chapterlist">
//     <ul>
//       <li data-num="20">
//         <div class="chbox">
//           <div class="eph-num">
//             <a href="https://www.manhwaindo.my/only-i-have-an-ex-grade-summon-chapter-20/">
//               <span class="chapternum">Chapter 20</span>
//               <span class="chapterdate">13 April 2026</span>
//             </a>
//           </div>
//         </div>
//       </li>
//       ...
//     </ul>
//   </div>
// ─────────────────────────────────────────────────────────────────

function parseChapterList(html) {
  const chapters = [];

  const listMatch = html.match(/<div[^>]*id="chapterlist"[^>]*>([\s\S]*?)<\/div>/i);
  if (!listMatch) return chapters;

  const liRE = /<li\s+data-num="([\d.]+)"[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRE.exec(listMatch[1])) !== null) {
    const num   = m[1];
    const block = m[2];

    const linkMatch = block.match(/<a\s+href="([^"]+)"/i);
    const numMatch  = block.match(/<span\s+class="chapternum">([^<]+)<\/span>/i);
    const dateMatch = block.match(/<span\s+class="chapterdate">([^<]+)<\/span>/i);

    if (!linkMatch) continue;

    chapters.push({
      number:  parseFloat(num),
      chapter: numMatch  ? numMatch[1].trim()  : `Chapter ${num}`,
      date:    dateMatch ? dateMatch[1].trim()  : '',
      url:     linkMatch[1],
    });
  }

  // Urutkan ascending (chapter 1 → terakhir)
  chapters.sort((a, b) => a.number - b.number);

  return chapters;
}
