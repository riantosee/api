/**
 * app/api/manga/detail/route.js
 * Detail manga via query param — Komikstation only
 *
 * Alternatif dari dynamic route /api/manga/detail/[slug]
 * Menerima slug lewat query param sehingga lebih mudah di-test.
 *
 * USAGE:
 *   GET /api/manga/detail?slug=one-punch-man
 *   GET /api/manga/detail?slug=naruto-sasukes-story-the-uchiha-and-the-heavenly-stardust
 *
 * Catatan:
 *   - Slug harus pakai tanda hubung (-), bukan spasi
 *   - Slug diambil dari URL komikstation: komikstation.org/manga/{slug}/
 *   - Route ini identik dengan /api/manga/detail/[slug] — hanya beda cara input
 */

import { cacheGet, cacheSet }                             from '../../../../lib/cache.js';
import { successResponse, errorResponse, gatewayError }   from '../../../../lib/response-utils.js';

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);

  // Normalisasi: "one punch man" → "one-punch-man"
  const raw  = (searchParams.get('slug') || '').trim();
  const slug = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  if (!slug) {
    return errorResponse(400, [
      'Parameter "slug" diperlukan.',
      'Contoh: /api/manga/detail?slug=one-punch-man',
      'Atau gunakan path: /api/manga/detail/one-punch-man',
    ].join(' '));
  }

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

  const headers  = scraperKey ? {} : BASE_HEADERS;

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
  const fromSchema = parseFromJsonLd(html);
  const fromHtml   = parseFromHtml(html);

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
    id            : slug,
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
// ─────────────────────────────────────────────────────────────────

function parseFromJsonLd(html) {
  const result = { title: '', thumbnail: '', datePublished: '', dateModified: '', description: '' };

  const scriptM = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  if (!scriptM) return result;

  for (const tag of scriptM) {
    const jsonStr = tag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim();
    try {
      const data  = JSON.parse(jsonStr);
      const graph = data['@graph'] || (Array.isArray(data) ? data : [data]);

      for (const node of graph) {
        if (node['@type'] === 'WebPage') {
          if (!result.title && node.name) {
            result.title = node.name
              .replace(/\s*[-–]\s*(bahasa\s+indonesia\s*[-–]\s*)?komikstation\s*$/i, '')
              .trim();
          }
          if (!result.datePublished && node.datePublished) result.datePublished = node.datePublished;
          if (!result.dateModified  && node.dateModified)  result.dateModified  = node.dateModified;
        }
        if (node['@type'] === 'ImageObject') {
          if (!result.thumbnail && (node.url || node.contentUrl)) {
            result.thumbnail = node.url || node.contentUrl;
          }
        }
      }
      if (!result.description && data.description) result.description = data.description;
    } catch { /* skip */ }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────
// PARSER 2 — HTML DOM
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

function parseThumbnail(html) {
  const thumbDivM = html.match(/<div\s+class="thumb"[^>]*>[\s\S]{0,300}?<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i);
  if (thumbDivM) return thumbDivM[1];

  const itempropM = html.match(/<img[^>]+itemprop="image"[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*/i)
                 || html.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]+itemprop="image"[^>]*/i);
  if (itempropM) return itempropM[1];
  return '';
}

function parseAltTitles(html) {
  const blockM = html.match(/Judul\s+Alternatif<\/b>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
  if (!blockM) return [];
  return blockM[1].split(/[,،،，、;；\n]+/).map(s => s.trim()).filter(Boolean);
}

function parseSynopsis(html) {
  const divM = html.match(/<div[^>]+itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
  if (!divM) return '';
  return divM[1].replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function parseAuthors(html) {
  const m = html.match(/Penulis<\/b>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
  if (!m) return [];
  return m[1].replace(/<[^>]+>/g, '').split(/[,،،，、]+/).map(s => s.trim()).filter(Boolean);
}

function parseIllustrators(html) {
  const m = html.match(/Ilustrator<\/b>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
  if (!m) return [];
  return m[1].replace(/<[^>]+>/g, '').split(/[,،،，、]+/).map(s => s.trim()).filter(Boolean);
}

function parseSerialization(html) {
  const m = html.match(/Edisi<\/b>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
  if (!m) return '';
  return m[1].replace(/<[^>]+>/g, '').trim();
}

function parseStatus(html) {
  const tsM = html.match(/<div\s+class="tsinfo"[^>]*>([\s\S]*?)<\/div>/i);
  if (!tsM) return '';
  const typeKeywords = /^(manga|manhwa|manhua|webtoon|novel)$/i;
  const iMatches = [...tsM[1].matchAll(/<i[^>]*>([^<]+)<\/i>/gi)];
  for (const im of iMatches) {
    const val = im[1].trim();
    if (!typeKeywords.test(val)) return val;
  }
  return '';
}

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

function parseScore(html) {
  const m = html.match(/<div[^>]+itemprop="ratingValue"[^>]*>\s*([0-9.]+)\s*<\/div>/i)
         || html.match(/itemprop="ratingValue"[^>]*>\s*([0-9.]+)/i);
  return m ? parseFloat(m[1]) || null : null;
}

function parseTotalVotes(html) {
  const m = html.match(/<[^>]+itemprop="ratingCount"[^>]*>\s*([0-9,]+)\s*</i)
         || html.match(/itemprop="ratingCount"[^>]*>\s*([0-9,]+)/i);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) || null : null;
}

function parseGenres(html) {
  const mgenM = html.match(/<span\s+class="mgen"[^>]*>([\s\S]*?)<\/span>/i);
  if (!mgenM) return [];

  const genres = [];
  const linkRE = /<a\s+href="(https?:\/\/komikstation\.org\/genres\/([^/"]+)\/?)"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = linkRE.exec(mgenM[1])) !== null) {
    genres.push({ name: m[3].trim(), slug: m[2].trim(), url: m[1] });
  }
  return genres;
}

function parseDatePublished(html) {
  const m = html.match(/Terbitan<\/b>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>/i);
  return m ? m[1].trim() : '';
}

function parseDateModified(html) {
  const m = html.match(/<time[^>]+itemprop="dateModified"[^>]+datetime="([^"]+)"[^>]*>/i);
  return m ? m[1].trim() : '';
}

function parseChapters(html) {
  const chapters = [];
  const ephRE    = /<div\s+class="eph-num"[^>]*>([\s\S]*?)<\/div>/gi;
  let block;

  while ((block = ephRE.exec(html)) !== null) {
    const content = block[1];
    const linkM   = content.match(
      /<a\s+href="(https?:\/\/komikstation\.org\/manga\/[^/]+\/([^/"]+)\/?)"/i
    );
    if (!linkM) continue;

    const chapterUrl  = linkM[1];
    const chapterSlug = linkM[2];
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

  return chapters.sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
}
