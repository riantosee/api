/**
 * app/api/manga/search/route.js
 * Scraper pencarian manga — komiku.org
 *
 * GET /api/manga/search?q=Naruto
 * GET /api/manga/search?q=One+Piece&page=2
 *
 * ROOT CAUSE hasil kosong di terminal:
 *   Komiku.org pakai HTMX — hasil pencarian di-load via AJAX ke api.komiku.org
 *   dengan header "HX-Request: true". Fetch biasa tanpa header itu → kosong.
 *
 * SOLUSI:
 *   Hit langsung https://api.komiku.org/?post_type=manga&s={query}
 *   dengan header HX-Request: true via proxyFetch.
 */

import { proxyFetch }                                   from '../../../../lib/proxy-fetch.js';
import { getApiById }                                   from '../../../../lib/api-registry.js';
import { successResponse, errorResponse, gatewayError } from '../../../../lib/response-utils.js';

const PROVIDER_ID = 'komiku';

// ─────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const query    = (searchParams.get('q') || '').trim();
  const page     = Number(searchParams.get('page') || 1);
  const provider = searchParams.get('provider') || PROVIDER_ID;

  if (!query) return errorResponse(400, 'Parameter "q" (kata kunci pencarian) diperlukan.');

  const api = getApiById(provider);
  if (!api || !api.enabled) return errorResponse(503, `Provider "${provider}" tidak tersedia.`);

  const cacheKey = `search:manga:${provider}:${query.toLowerCase()}:${page}`;

  try {
    // Bangun URL endpoint HTMX komiku — langsung ke api.komiku.org
    // bukan komiku.org (halaman utama tidak memuat hasil search)
    const url = buildKomikuSearchUrl(api, query, page);

    // proxyFetch dengan extraHeaders untuk inject HX-Request
    // agar server komiku mengembalikan HTML fragment hasil pencarian
    const { data, fromCache } = await proxyFetch(
      url,
      {
        timeout      : api.timeout || 20000,
        responseType : 'text',               // komiku mengembalikan HTML, bukan JSON
        extraHeaders : {
          'HX-Request' : 'true',             // ← wajib, tanpa ini hasil kosong
          'HX-Trigger' : 'revealed',
          'HX-Target'  : 'daftar',
          'Referer'    : 'https://komiku.org/',
        },
      },
      cacheKey,
      300  // cache 5 menit
    );

    const items = parseKomikuResults(data);

    return successResponse(items, {
      source    : provider,
      page,
      fromCache,
      total     : items.length,
    });

  } catch (err) {
    console.error('[manga/search]', err.message);
    return gatewayError('Manga provider tidak tersedia.');
  }
}

// ─────────────────────────────────────────────────────────────────
// BUILD URL
//
// Entry di api-registry.js untuk komiku harus seperti ini:
//
//   {
//     id       : 'komiku',
//     enabled  : true,
//     baseUrl  : 'https://api.komiku.org',
//     endpoints: { search: '/' },
//     timeout  : 20000,
//   }
//
// URL final: https://api.komiku.org/?post_type=manga&s=Naruto&page=2
// ─────────────────────────────────────────────────────────────────

function buildKomikuSearchUrl(api, query, page) {
  const base     = api.baseUrl.replace(/\/$/, '');   // hapus trailing slash
  const endpoint = api.endpoints?.search || '/';

  const url = new URL(`${base}${endpoint}`);
  url.searchParams.set('post_type', 'manga');
  url.searchParams.set('s', query);
  if (page > 1) url.searchParams.set('page', page); // komiku support pagination

  return url.toString();
}

// ─────────────────────────────────────────────────────────────────
// PARSER HASIL PENCARIAN
//
// Response dari api.komiku.org adalah HTML fragment (bukan JSON).
// Struktur tiap item:
//
//   <div class="bge">
//     <div class="bgei">
//       <a href="https://komiku.org/manga/naruto/">
//         <img src="https://thumbnail.komiku.id/.../Komik-Naruto.jpg" alt="Komik Naruto" />
//       </a>
//     </div>
//     <div class="kan">
//       <h3><a href="https://komiku.org/manga/naruto/">Naruto</a></h3>
//       <p class="jdl2">Genre: Aksi, Petualangan</p>
//       <p>Sinopsis singkat di sini...</p>
//       <table>
//         <tr>
//           <td>Status:</td><td>Completed</td>
//           <td>Jenis:</td><td>Manga</td>
//         </tr>
//       </table>
//     </div>
//   </div>
// ─────────────────────────────────────────────────────────────────

function parseKomikuResults(html) {
  if (!html || typeof html !== 'string') return [];

  const results = [];

  // Isolasi tiap blok .bge
  const bgeRE = /<div\s+class="bge">([\s\S]*?)(?=<div\s+class="bge"|$)/gi;
  let block;

  while ((block = bgeRE.exec(html)) !== null) {
    const item = parseResultItem(block[1]);
    if (item) results.push(item);
  }

  // Fallback jika pola utama tidak match
  return results.length > 0 ? results : parseFallback(html);
}

function parseResultItem(content) {
  // URL & Judul
  const linkMatch = content.match(/<h3[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/i)
                 || content.match(/<a\s+href="(https?:\/\/komiku\.org\/manga\/[^"]+)"[^>]*>([^<]{2,})<\/a>/i);
  if (!linkMatch) return null;

  const url   = linkMatch[1];
  const title = linkMatch[2].trim();

  // Slug dari URL
  const slugMatch = url.match(/\/manga\/([^/]+)\/?$/i);
  const slug      = slugMatch ? slugMatch[1] : '';

  // Thumbnail
  const imgMatch  = content.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"[^>]*>/i);
  const thumbnail = imgMatch ? imgMatch[1] : '';

  // Genre dari <p class="jdl2">Genre: ...</p>
  const genreMatch = content.match(/<p\s+class="jdl2"[^>]*>([^<]+)<\/p>/i);
  const genres     = genreMatch
    ? genreMatch[1].replace(/^Genre:\s*/i, '').split(',').map(g => g.trim()).filter(Boolean)
    : [];

  // Sinopsis dari <p> setelah jdl2
  const synopsisMatch = content.match(/<p\s+class="jdl2"[^>]*>[^<]+<\/p>\s*<p[^>]*>([^<]+)<\/p>/i);
  const synopsis      = synopsisMatch ? synopsisMatch[1].trim() : '';

  // Status & Tipe dari tabel
  const statusMatch = content.match(/Status:\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
  const typeMatch   = content.match(/Jenis:\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);

  return {
    id        : slug,
    title,
    url,
    slug,
    thumbnail,
    genres,
    synopsis,
    status    : statusMatch ? statusMatch[1].trim() : '',
    type      : typeMatch   ? typeMatch[1].trim()   : '',
  };
}

// Fallback — tangkap minimal jika struktur HTML berubah
function parseFallback(html) {
  const results = [];
  const seen    = new Set();

  const linkRE = /<a\s+href="(https?:\/\/komiku\.org\/manga\/[^"]+)"[^>]*>([^<]{3,})<\/a>/gi;
  let m;

  while ((m = linkRE.exec(html)) !== null) {
    const url   = m[1];
    const title = m[2].trim();
    if (seen.has(url)) continue;
    seen.add(url);

    const before   = html.slice(Math.max(0, m.index - 400), m.index);
    const imgMatch = before.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"[^>]*/i);
    const slugM    = url.match(/\/manga\/([^/]+)\/?$/i);

    results.push({
      id        : slugM   ? slugM[1]   : '',
      title,
      url,
      slug      : slugM   ? slugM[1]   : '',
      thumbnail : imgMatch ? imgMatch[1] : '',
      genres    : [],
      synopsis  : '',
      status    : '',
      type      : '',
    });
  }

  return results;
}
