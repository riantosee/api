/**
 * app/api/anime/schedule/debug/route.js
 * DEBUG — lihat raw value east_schedule dari WP API
 * HAPUS setelah selesai debug!
 */

export async function GET() {
  const API_URL = 'https://v2.samehadaku.how/wp-json/custom/v1/all-schedule';
  const scraperKey = process.env.SCRAPER_API_KEY;

  const fetchUrl = scraperKey
    ? `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(API_URL)}&render=false`
    : API_URL;

  const res  = await fetch(fetchUrl, { headers: { Accept: 'application/json' } });
  const json = await res.json();

  // Ambil unique values dari east_schedule
  const scheduleValues = [...new Set(json.map(i => i.east_schedule))].sort();

  return Response.json({
    total          : json.length,
    scheduleValues,             // <-- ini yang penting
    sample         : json.slice(0, 3).map(i => ({
      title         : i.title,
      east_schedule : i.east_schedule,
      east_time     : i.east_time,
    })),
  });
}
