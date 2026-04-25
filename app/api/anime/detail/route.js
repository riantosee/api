/**
 * app/api/anime/detail/debug/route.js
 * DEBUG v3 — fokus ke area episode list
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

  // Snippet lstepsiode — list episode utama
  const lstIdx     = html.indexOf('lstepsiode');
  const lstSnippet = lstIdx > -1
    ? html.slice(lstIdx - 100, lstIdx + 3000)
    : 'NOT FOUND';

  // Snippet list-custom-url — kemungkinan link episode
  const lcuIdx     = html.indexOf('list-custom-url');
  const lcuSnippet = lcuIdx > -1
    ? html.slice(lcuIdx - 100, lcuIdx + 2000)
    : 'NOT FOUND';

  // Snippet eps
  const epsIdx     = html.indexOf('"eps"');
  const epsSnippet = epsIdx > -1
    ? html.slice(epsIdx - 100, epsIdx + 2000)
    : 'NOT FOUND';

  return Response.json({ lstSnippet, lcuSnippet, epsSnippet });
}
