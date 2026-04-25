/**
 * app/api/anime/batch/debug/route.js
 * DEBUG — lihat raw HTML snippet dari daftar-batch
 * HAPUS setelah selesai debug!
 */

export async function GET() {
  const scraperKey = process.env.SCRAPER_API_KEY;
  const targetUrl  = 'https://v2.samehadaku.how/daftar-batch/';

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

  // Cari snippet di sekitar kata kunci penting
  const checks = {
    has_animpost  : html.includes('animpost'),
    has_animosx   : html.includes('animosx'),
    has_animepost : html.includes('animepost'),
    has_article   : html.includes('<article'),
    has_bsxo      : html.includes('bsxo'),
    has_post_show : html.includes('post-show'),
    has_relat     : html.includes('relat'),
    html_length   : html.length,
    status        : res.status,
  };

  // Ambil snippet 2000 char dari area konten utama
  const contentIdx = html.indexOf('id="content"');
  const snippet    = contentIdx > -1
    ? html.slice(contentIdx, contentIdx + 3000)
    : html.slice(3000, 6000); // fallback

  return Response.json({ checks, snippet });
}
