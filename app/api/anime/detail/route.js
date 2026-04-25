/**
 * app/api/anime/detail/debug/route.js
 * DEBUG — lihat raw HTML snippet dari halaman detail anime
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

  const checks = {
    status          : res.status,
    html_length     : html.length,
    has_infoanime   : html.includes('infoanime'),
    has_spe         : html.includes('"spe"'),
    has_rinfobox    : html.includes('rinfobox'),
    has_entry_title : html.includes('entry-title'),
    has_synops      : html.includes('synops'),
    has_thumbinal   : html.includes('thumbinal'),
    has_episodelist : html.includes('episodelist'),
    has_eplister    : html.includes('eplister'),
    has_eplist      : html.includes('eplist'),
    has_episodes    : html.includes('episodes'),
    has_episodio    : html.includes('episodio'),
    has_wp_manga    : html.includes('wp-manga'),
  };

  // Snippet area konten utama — cari dari div#content
  const contentIdx = html.indexOf('id="content"');
  const snippet    = contentIdx > -1
    ? html.slice(contentIdx, contentIdx + 5000)
    : html.slice(2000, 7000);

  // Snippet area episode list
  const epIdx    = ['episodelist', 'eplister', 'eplist', 'episodes']
    .map(k => html.indexOf(k))
    .find(i => i > -1) ?? -1;
  const epSnippet = epIdx > -1 ? html.slice(epIdx - 100, epIdx + 2000) : null;

  return Response.json({ checks, snippet, epSnippet });
}
