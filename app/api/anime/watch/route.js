/**
 * app/api/anime/watch/debug/route.js
 * DEBUG — inspect HTML struktur halaman episode
 * GET /api/anime/watch/debug?slug=one-punch-man-episode-12
 */

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug') || 'one-punch-man-episode-12';

  const scraperKey = process.env.SCRAPER_API_KEY;
  const targetUrl  = `https://v2.samehadaku.how/${slug}/`;

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

  // Snippet area server/player option
  const serverIdx     = html.indexOf('id="server"');
  const serverSnippet = serverIdx > -1
    ? html.slice(serverIdx, serverIdx + 3000)
    : 'NOT FOUND';

  // Snippet area player iframe/embed
  const playerIdx     = html.indexOf('playerarea') !== -1
    ? html.indexOf('playerarea')
    : html.indexOf('plarea');
  const playerSnippet = playerIdx > -1
    ? html.slice(playerIdx, playerIdx + 2000)
    : 'NOT FOUND';

  // Cari semua ajax URL di script
  const ajaxMatches = [...html.matchAll(/url\s*:\s*['"`]([^'"`]+wp-admin\/admin-ajax[^'"`]+)['"`]/gi)]
    .map(m => m[1]);
  const ajaxActions = [...html.matchAll(/action\s*:\s*['"`]([^'"`]+)['"`]/gi)]
    .map(m => m[1]);

  // Cari nonce / security token
  const nonceMatch = html.match(/["']nonce["']\s*:\s*["']([a-f0-9]+)["']/i)
                  || html.match(/easthemeajax\s*=\s*\{[\s\S]*?nonce\s*:\s*["']([^"']+)["']/i);

  // Cari post ID
  const postIdMatch = html.match(/data-post="(\d+)"/);

  // Snippet easthemeajax variable
  const ajaxVarIdx     = html.indexOf('easthemeajax');
  const ajaxVarSnippet = ajaxVarIdx > -1
    ? html.slice(ajaxVarIdx, ajaxVarIdx + 500)
    : 'NOT FOUND';

  return Response.json({
    status        : res.status,
    postId        : postIdMatch?.[1] || null,
    nonce         : nonceMatch?.[1] || null,
    ajaxUrls      : ajaxMatches,
    ajaxActions   : [...new Set(ajaxActions)],
    ajaxVarSnippet,
    serverSnippet,
    playerSnippet,
  });
}
