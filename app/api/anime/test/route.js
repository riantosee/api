/**
 * app/api/anime/watch/debug/route.js
 * DEBUG v2 — cek response dari wibufile embed
 * GET /api/anime/watch/debug
 */

export async function GET() {
  const targetUrl = 'https://api.wibufile.com/embed/opm-01-720p-samehadaku-care-mp4';

  const res  = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept'    : 'text/html,application/xhtml+xml,*/*',
      'Referer'   : 'https://v2.samehadaku.how/',
    }
  });

  const html = await res.text();

  // Cari semua kemungkinan URL video
  const mp4    = [...html.matchAll(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi)].map(m => m[0]);
  const m3u8   = [...html.matchAll(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi)].map(m => m[0]);
  const source  = [...html.matchAll(/<source[^>]+src="([^"]+)"/gi)].map(m => m[1]);
  const iframe  = [...html.matchAll(/<iframe[^>]+src="([^"]+)"/gi)].map(m => m[1]);
  const file    = [...html.matchAll(/(?:file|src|url)\s*:\s*["']([^"']+(?:\.mp4|\.m3u8)[^"']*)["']/gi)].map(m => m[1]);

  // Snippet konten
  const snippet = html.slice(0, 3000);

  return Response.json({
    status : res.status,
    mp4    : [...new Set(mp4)],
    m3u8   : [...new Set(m3u8)],
    source : [...new Set(source)],
    iframe : [...new Set(iframe)],
    file   : [...new Set(file)],
    snippet,
  });
}
