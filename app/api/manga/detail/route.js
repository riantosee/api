/**
 * app/api/manga/detail/[slug]/route.js
 * Detail manga — Komikstation only
 *
 * DETAIL:
 *   GET /api/manga/detail/naruto-sasukes-story-the-uchiha-and-the-heavenly-stardust
 *
 * Source : https://komikstation.org
 * URL    : https://komikstation.org/manga/{slug}/
 */

import { cacheGet, cacheSet }            from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req, { params }) {
  const slug = params?.slug?.trim();
  if (!slug) return errorResponse(400, 'Parameter slug diperlukan.');

  const cacheKey = `manga:detail:komikstation:${slug}`;
  const hit = await cacheGet(cacheKey);
  if (hit) return successResponse(hit, { fromCache: true });

  try {
    const detail = await fetchDetailKomikstation(slug);
    if (!detail) return errorResponse(404, `Manga "${slug}" tidak ditemukan.`);

    await cacheSet(cacheKey, detail, 1800); // cache 30 menit
    return successResponse(detail);
  } catch (err) {
    console.error('[manga/detail][komikstation]', err.message);
    return gatewayError(`Gagal mengambil detail manga: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────────

const BASE_HEADERS = {
  'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'     : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Referer'    : 'https://komikstation.org/',
};

async function fetchHtml(targetUrl) {
  const scraperKey = process.env.SCRAPER_API_KEY;

  const fetchUrl = scraperKey
    ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(targetUrl)}&render=false`
    : targetUrl;

  const headers = scraperKey ? {} : BASE_HEADERS;

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(fetchUrl, { signal: controller.signal, headers });
    if (res.status === 403) throw new Error('Akses ditolak (403) — coba set SCRAPER_API_KEY');
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// MAIN FETCH
// ─────────────────────────────────────────────────────────────────

async function fetchDetailKomikstation(slug) {
  const url  = `https://komikstation.org/manga/${slug}/`;
  const html = await fetchHtml(url);
  if (!html) return null;
  return parseDetail(html, slug, url);
}

// ─────────────────────────────────────────────────────────────────
// PARSER UTAMA
// ─────────────────────────────────────────────────────────────────

function parseDetail(html, slug, url) {
  // Prioritas 1: JSON-LD schema (paling akurat, struktur terstandar)
  const fromSchema = parseFromJsonLd(html);

  // Prioritas 2: HTML meta & DOM
  const fromHtml   = parseFromHtml(html);

  // Merge: schema sebagai base, HTML sebagai pelengkap
  const title         = fromSchema.title         || fromHtml.title         || slug;
  const thumbnail     = fromSchema.thumbnail     || fromHtml.thumbnail     || '';
  const synopsis      = fromHtml.synopsis        || fromSchema.description || '';
  const altTitles     = fromHtml.altTitles       || [];
  const genres        = fromHtml.genres          || [];
  const authors       = fromHtml.authors         || [];
  const illustrators  = fromHtml.illustrators    || [];
  const serialization = fromHtml.serialization   || '';
  const status        = fromHtml.status          || '';
  const type          = fromHtml.type            || 'Manga';
  const score         = fromHtml.score           || null;
  const totalVotes    = fromHtml.totalVotes       || null;
  const chapters      = fromHtml.chapters        || [];
  const datePublished = fromSchema.datePublished || fromHtml.datePublished || '';
  const dateModified  = fromSchema.dateModified  || fromHtml.dateModified  || '';

  return {
    id          : slug,
    slug,
    url,
    title,
    altTitles,
    thumbnail,
    type,
    status,
    score,
    totalVotes,
    synopsis,
    authors,
    illustrators,
    serialization,
    genres,
    datePublished,
    dateModified,
    totalChapters : chapters.length,
    chapters,
    source        : 'komikstation',
  };
}

// ─────────────────────────────────────────────────────────────────
// PARSER 1 — JSON-LD Schema
//
// <script type="application/ld+json" class="yoast-schema-graph">
//   { "@context":"https://schema.org", "@graph": [...] }
// </script>
//
// Ambil: title, thumbnailUrl, datePublished, dateModified, description
// ─────────────────────────────────────────────────────────────────

function parseFromJsonLd(html) {
  const result = { title: '', thumbnail: '', datePublished: '', dateModified: '', description: '' };

  const scriptM = html.match(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  );
  if (!scriptM) return result;

  for (const tag of scriptM) {
    const jsonStr = tag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim();
    try {
      const data  = JSON.parse(jsonStr);
      const graph = data['@graph'] || (Array.isArray(data) ? data : [data]);

      for (const node of graph) {
        // WebPage node — ambil title & url
        if (node['@type'] === 'WebPage') {
          if (!result.title && node.name) {
            // Hapus suffix " - KomikStation" atau " Bahasa Indonesia - KomikStation"
            result.title = node.name
              .replace(/\s*[-–]\s*(bahasa\s+indonesia\s*[-–]\s*)?komikstation\s*$/i, '')
              .trim();
          }
          if (!result.datePublished && node.datePublished) result.datePublished = node.datePublished;
          if (!result.dateModified  && node.dateModified)  result.dateModified  = node.dateModified;
        }

        // ImageObject node — ambil thumbnailUrl
        if (node['@type'] === 'ImageObject') {
          if (!result.thumbnail && (node.url || node.contentUrl)) {
            result.thumbnail = node.url || node.contentUrl;
          }
        }
      }

      // Jika ada field description di root
      if (!result.description && data.description) {
        result.description = data.description;
      }
    } catch {
      // skip invalid JSON
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────
// PARSER 2 — HTML DOM
//
// Struktur halaman detail komikstation.org:
//
// [JUDUL ALTERNATIF]
// <div class="wd-full">
//   <b>Judul Alternatif</b>
//   <span>Naruto: サスケ烈伝...</span>
// </div>
//
// [SINOPSIS]
// <div class="entry-content entry-content-single" itemprop="description">
//   <p>Uchiha Sasuke menuju...</p>
// </div>
//
// [INFO FMED]
// <div class="fmed">
//   <b>Terbitan</b> <span>2022</span>
//   <b>Penulis</b>  <span>ESAKA Jun, Kishimoto Masashi</span>
//   <b>Ilustrator</b> <span>KIMURA Shingo</span>
//   <b>Edisi</b>    <span>Shounen Jump + (Shueisha)</span>
//   <b>Rilisan Terakhir</b>
//     <span><time itemprop="dateModified" datetime="2023-04-25T21:01:34+07:00">April 25, 2023</time></span>
// </div>
//
// [GENRE]
// <div class="wd-full">
//   <b>Genre</b>
//   <span class="mgen">
//     <a href="https://komikstation.org/genres/action/" rel="tag">Action</a>
//     <a href="https://komikstation.org/genres/adventure/" rel="tag">Adventure</a>
//   </span>
// </div>
//
// [SCORE]
// <div class="num" itemprop="ratingValue">8.50</div>
// <div class="votecount" itemprop="ratingCount">120</div>
//
// [STATUS & TYPE]
// <div class="tsinfo">
//   <div class="imptdt"><i>Completed</i></div>   ← status
//   <div class="imptdt"><i>Manga</i></div>        ← type
// </div>
//
// [THUMBNAIL]
// <div class="thumb"><img src="https://.../cover.jpg" itemprop="image" /></div>
//
// [CHAPTER LIST]
// <div class="eph-num">
//   <a href="https://komikstation.org/manga/slug/chapter-1/">
//     <span class="chapternum">Chapter 1</span>
//     <span class="chapterdate">January 1, 2023</span>
//   </a>
// </div>
// ─────────────────────────────────────────────────────────────────

function parseFromHtml(html) {
  return {
    title        : parseTitle(html),
    thumbnail    : parseThumbnail(html),
    altTitles    : parseAltTitles(html),
    synopsis     : parseSynopsis(html),
    authors      : parseAuthors(html),
    illustrators : parseIllustrators(html),
    serialization: parseSerialization(html),
    status       : parseStatus(html),
    type         : parseType(html),
    score        : parseScore(html),
    totalVotes   : parseTotalVotes(html),
    genres       : parseGenres(html),
    datePublished: parseDatePublished(html),
    dateModified : parseDateModified(html),
    chapters     : parseChapters(html),
  };
}

// ── Title dari <h1> atau <title>
function parseTitle(html) {
  const h1M = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*([^<]+)\s*<\/h1>/i)
           || html.match(/<h1[^>]*itemprop="name"[^>]*>\s*([^<]+)\s*<\/h1>/i)
           || html.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/i);
  if (h1M) return h1M[1].trim();

  const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleM) {
    return titleM[1]
      .replace(/\s*[-–|]\s*(bahasa\s+indonesia\s*[-–|]\s*)?komikstation.*$/i, '')
      .trim();
  }
  return '';
}

// ── Thumbnail dari <div class="thumb">
function parseThumbnail(html) {
  // 1. <div class="thumb"><img src="..." itemprop="image" />
  const thumbDivM = html.match(/<div\s+class="thumb"[^>]*>[\s\S]{0,300}?<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);
  if (thumbDivM) return thumbDivM[1];

  // 2. <img itemprop="image" src="...">
  const itempropM = html.match(/<img[^>]+itemprop="image"[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i)
                 || html.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]+itemprop="image"[^>]*/i);
  if (itempropM) return itempropM[1];

  return '';
}

// ── Judul alternatif dari <div class="wd-full"><b>Judul Alternatif</b><span>...</span>
function parseAltTitles(html) {
  const blockM = html.match(
    /Judul\s+Alternatif<\/b>\s*<span[^>]*>([\s\S]*?)<\/span>/i
  );
  if (!blockM) return [];

  return blockM[1]
    .split(/[,،،，、;；\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

// ── Sinopsis dari <div class="entry-content" itemprop="description"><p>...</p>
function parseSynopsis(html) {
  const divM = html.match(
    /<div[^>]+itemprop="description"[^>]*>([\s\S]*?)<\/div>/i
  );
  if (!divM) return '';

  return divM[1]
    .replace(/<[^>]+>/g, ' ')   // strip semua tag HTML
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Authors dari <div class="fmed"><b>Penulis</b><span>...</span>
function parseAuthors(html) {
  const m = html.match(/Penulis<\/b>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
  if (!m) return [];
  return m[1]
    .replace(/<[^>]+>/g, '')
    .split(/[,،،，、]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

// ── Illustrators dari <div class="fmed"><b>Ilustrator</b><span>...</span>
function parseIllustrators(html) {
  const m = html.match(/Ilustrator<\/b>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
  if (!m) return [];
  return m[1]
    .replace(/<[^>]+>/g, '')
    .split(/[,،،，、]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

// ── Serialization/Edisi dari <b>Edisi</b><span>...</span>
function parseSerialization(html) {
  const m = html.match(/Edisi<\/b>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
  if (!m) return '';
  return m[1].replace(/<[^>]+>/g, '').trim();
}

// ── Status dari <div class="tsinfo"><div class="imptdt"><i>Completed</i>
function parseStatus(html) {
  const tsM = html.match(/<div\s+class="tsinfo"[^>]*>([\s\S]*?)<\/div>/i);
  if (!tsM) return '';

  const iMatches = [...tsM[1].matchAll(/<i[^>]*>([^<]+)<\/i>/gi)];
  // Status biasanya: Ongoing, Completed, Hiatus, dll (bukan tipe manga)
  const typeKeywords = /^(manga|manhwa|manhua|webtoon|novel)$/i;
  for (const im of iMatches) {
    const val = im[1].trim();
    if (!typeKeywords.test(val)) return val;
  }
  return '';
}

// ── Type dari <div class="tsinfo"> — Manga / Manhwa / Manhua / dll
function parseType(html) {
  const tsM = html.match(/<div\s+class="tsinfo"[^>]*>([\s\S]*?)<\/div>/i);
  if (!tsM) return 'Manga';

  const typeKeywords = /^(manga|manhwa|manhua|webtoon|novel)$/i;
  const iMatches = [...tsM[1].matchAll(/<i[^>]*>([^<]+)<\/i>/gi)];
  for (const im of iMatches) {
    const val = im[1].trim();
    if (typeKeywords.test(val)) return val;
  }
  return 'Manga';
}

// ── Score dari <div class="num" itemprop="ratingValue">
function parseScore(html) {
  const m = html.match(/<div[^>]+itemprop="ratingValue"[^>]*>\s*([0-9.]+)\s*<\/div>/i)
         || html.match(/itemprop="ratingValue"[^>]*>\s*([0-9.]+)/i);
  return m ? parseFloat(m[1]) || null : null;
}

// ── Total votes dari <div class="votecount" itemprop="ratingCount">
function parseTotalVotes(html) {
  const m = html.match(/<[^>]+itemprop="ratingCount"[^>]*>\s*([0-9,]+)\s*</i)
         || html.match(/itemprop="ratingCount"[^>]*>\s*([0-9,]+)/i);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) || null : null;
}

// ── Genres dari <span class="mgen"><a href="...">Genre</a>...
function parseGenres(html) {
  const mgenM = html.match(/<span\s+class="mgen"[^>]*>([\s\S]*?)<\/span>/i);
  if (!mgenM) return [];

  const genres = [];
  const linkRE = /<a\s+href="(https?:\/\/komikstation\.org\/genres\/([^/"]+)\/?)"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = linkRE.exec(mgenM[1])) !== null) {
    genres.push({
      name : m[3].trim(),
      slug : m[2].trim(),
      url  : m[1],
    });
  }
  return genres;
}

// ── Date published dari <div class="fmed"><b>Terbitan</b><span>2022</span>
function parseDatePublished(html) {
  const m = html.match(/Terbitan<\/b>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>/i);
  return m ? m[1].trim() : '';
}

// ── Date modified dari <time itemprop="dateModified" datetime="...">
function parseDateModified(html) {
  const m = html.match(/<time[^>]+itemprop="dateModified"[^>]+datetime="([^"]+)"[^>]*>/i);
  return m ? m[1].trim() : '';
}

// ─────────────────────────────────────────────────────────────────
// CHAPTER LIST
//
// <div class="eph-num">
//   <a href="https://komikstation.org/manga/slug/chapter-1/">
//     <span class="chapternum">Chapter 1</span>
//     <span class="chapterdate">January 1, 2023</span>
//   </a>
// </div>
// ─────────────────────────────────────────────────────────────────

function parseChapters(html) {
  const chapters = [];
  const ephRE    = /<div\s+class="eph-num"[^>]*>([\s\S]*?)<\/div>/gi;
  let block;

  // Tidak dipakai lagi — diganti dengan parser baru di bawah
  void block; void ephRE;

  const seen = new Set();

  // Ambil seluruh blok #chapterlist
  const listM = html.match(/id="chapterlist"[^>]*>([\s\S]*?)<\/ul>/i)
             || html.match(/class="eplister"[^>]*>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i);
  const source = listM ? listM[1] : html;

  // Scan setiap <li data-num="...">
  const liRE = /<li\s[^>]*data-num="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi;
  let li;

  while ((li = liRE.exec(source)) !== null) {
    const dataNum = li[1].trim();
    const content = li[2];

    const linkM = content.match(
      /<a\s+href="(https?:\/\/komikstation\.org\/([^"]+?-chapter-[^"]+?)\/?)"[^>]*>/i
    );
    if (!linkM) continue;

    const chapterUrl  = linkM[1];
    const slugParts   = linkM[2].split('/').filter(Boolean);
    const chapterSlug = slugParts[slugParts.length - 1] || linkM[2];

    if (seen.has(chapterUrl)) continue;
    seen.add(chapterUrl);

    const numM      = content.match(/<span\s+class="chapternum"[^>]*>\s*([^<]+?)\s*<\/span>/i);
    const dateM     = content.match(/<span\s+class="chapterdate"[^>]*>\s*([^<]+?)\s*<\/span>/i);
    const numText   = numM ? numM[1].trim() : `Chapter ${dataNum}`;
    const numParsed = parseFloat(dataNum) || parseFloat(numText.replace(/[^0-9.]/g, '')) || null;

    chapters.push({
      slug   : chapterSlug,
      number : numParsed,
      title  : numText,
      date   : dateM ? dateM[1].trim() : '',
      url    : chapterUrl,
    });
  }

  // Fallback: scan <div class="eph-num"> jika li data-num tidak ketemu
  if (chapters.length === 0) {
    const ephFallRE = /<div\s+class="eph-num"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    let fb;
    while ((fb = ephFallRE.exec(html)) !== null) {
      const content = fb[1];
      const linkM   = content.match(
        /<a\s+href="(https?:\/\/komikstation\.org\/([^"]+?-chapter-[^"]+?)\/?)"[^>]*>/i
      );
      if (!linkM || seen.has(linkM[1])) continue;
      seen.add(linkM[1]);

      const chapterUrl  = linkM[1];
      const slugParts   = linkM[2].split('/').filter(Boolean);
      const chapterSlug = slugParts[slugParts.length - 1] || linkM[2];
      const numM        = content.match(/<span\s+class="chapternum"[^>]*>\s*([^<]+?)\s*<\/span>/i);
      const dateM       = content.match(/<span\s+class="chapterdate"[^>]*>\s*([^<]+?)\s*<\/span>/i);
      const numText     = numM ? numM[1].trim() : chapterSlug;
      const numParsed   = parseFloat(numText.replace(/[^0-9.]/g, '')) || null;

      chapters.push({
        slug   : chapterSlug,
        number : numParsed,
        title  : numText,
        date   : dateM ? dateM[1].trim() : '',
        url    : chapterUrl,
      });
    }
  }

  return chapters.sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
}
