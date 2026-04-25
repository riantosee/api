/**
 * app/api/anime/detail/debug/route.js
 * DEBUG v2 — fokus ke area infoanime & episode list
 * HAPUS setelah selesai debug!
 *
 * GET /api/anime/detail/debug?slug=one-punch-man
 */

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug') || 'one-punch-man';

  const scraperKey = process.env.SCRAPER_API_KEY;
  const targetUrl  = `https://v2.samehadaku.how/anime/${slug}/`;

  const fetchUrl = scraperKey
    ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(targetUrl)}&render=false`
    : targetUrl;

  const res  = await fetch(fetchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept'    : 'text/html',
      'Referer'   : 'https://v2.samehadaku.how/',
    }
  });

  const html = await res.text();

  // Snippet dari infoanime — info utama anime
  const infoIdx    = html.indexOf('infoanime');
  const infoSnippet = infoIdx > -1
    ? html.slice(infoIdx - 50, infoIdx + 4000)
    : 'NOT FOUND';

  // Snippet dari "spe" — kemungkinan tabel spesifikasi
  const speIdx     = html.indexOf('"spe"');
  const speSnippet = speIdx > -1
    ? html.slice(speIdx - 50, speIdx + 3000)
    : 'NOT FOUND';

  // Cari semua class/id yang ada di HTML — bantu identifikasi struktur episode
  const classMatches = [...html.matchAll(/class="([^"]{3,40})"/g)]
    .map(m => m[1].split(/\s+/)[0])
    .filter(c => /ep|eps|list|episode|lis|epl/i.test(c));
  const uniqueEpClasses = [...new Set(classMatches)];

  return Response.json({
    status        : res.status,
    infoSnippet,
    speSnippet,
    uniqueEpClasses, // class yang mengandung kata ep/episode/list
  });
}
