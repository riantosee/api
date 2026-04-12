/**
 * API Registry — Central configuration for all streaming content providers.
 * To add a new API: push a new entry to API_REGISTRY below.
 */

export const API_REGISTRY = [
  // ─── ANIME ────────────────────────────────────────────────────
  {
    id: 'consumet-anime',
    category: 'anime',
    provider: 'consumet',
    label: 'Consumet Anime',
    baseUrl: 'https://api.consumet.org',
    endpoints: {
      search: '/anime/gogoanime/{query}',
      trending: '/anime/gogoanime/top-airing',
      info: '/anime/gogoanime/info/{id}',
      episodes: '/anime/gogoanime/episodes/{id}',
      stream: '/anime/gogoanime/watch/{episodeId}',
    },
    rateLimit: { requests: 100, window: 60 },
    timeout: 8000,
    enabled: true,
    tags: ['gogoanime', 'hd', 'sub', 'dub'],
  },
  {
    id: 'jikan-anime',
    category: 'anime',
    provider: 'jikan',
    label: 'Jikan (MyAnimeList)',
    baseUrl: 'https://api.jikan.moe/v4',
    endpoints: {
      search: '/anime?q={query}',
      trending: '/top/anime',
      info: '/anime/{id}',
      episodes: '/anime/{id}/episodes',
      characters: '/anime/{id}/characters',
    },
    rateLimit: { requests: 60, window: 60 },
    timeout: 6000,
    enabled: true,
    tags: ['myanimelist', 'metadata', 'ratings'],
  },
  {
    id: 'anilist-anime',
    category: 'anime',
    provider: 'anilist',
    label: 'AniList GraphQL',
    baseUrl: 'https://graphql.anilist.co',
    endpoints: {
      graphql: '/',
    },
    rateLimit: { requests: 90, window: 60 },
    timeout: 7000,
    enabled: true,
    tags: ['anilist', 'graphql', 'seasonal'],
  },

  // ─── MANGA ────────────────────────────────────────────────────
  {
    id: 'mangadex',
    category: 'manga',
    provider: 'mangadex',
    label: 'MangaDex',
    baseUrl: 'https://api.mangadex.org',
    endpoints: {
      search: '/manga?title={query}',
      info: '/manga/{id}',
      chapters: '/manga/{id}/feed',
      pages: '/at-home/server/{chapterId}',
      cover: '/cover',
    },
    rateLimit: { requests: 40, window: 60 },
    timeout: 8000,
    enabled: true,
    tags: ['scanlation', 'multi-language', 'official'],
  },
  {
    id: 'consumet-manga',
    category: 'manga',
    provider: 'consumet',
    label: 'Consumet Manga',
    baseUrl: 'https://api.consumet.org',
    endpoints: {
      search: '/manga/mangahere/search?query={query}',
      info: '/manga/mangahere/info?id={id}',
      read: '/manga/mangahere/read?chapterId={chapterId}',
    },
    rateLimit: { requests: 100, window: 60 },
    timeout: 8000,
    enabled: true,
    tags: ['mangahere', 'raw'],
  },

  // ─── MANHUA ───────────────────────────────────────────────────
  {
    id: 'manganato-manhua',
    category: 'manhua',
    provider: 'manganato',
    label: 'Manganato (Manhua)',
    baseUrl: 'https://api.consumet.org',
    endpoints: {
      search: '/manga/manganato/search?query={query}',
      info: '/manga/manganato/info?id={id}',
      read: '/manga/manganato/read?chapterId={chapterId}',
    },
    rateLimit: { requests: 80, window: 60 },
    timeout: 8000,
    enabled: true,
    tags: ['chinese', 'webtoon', 'color'],
  },
  {
    id: 'mangakakalot-manhua',
    category: 'manhua',
    provider: 'mangakakalot',
    label: 'Mangakakalot (Manhua)',
    baseUrl: 'https://api.consumet.org',
    endpoints: {
      search: '/manga/mangakakalot/search?query={query}',
      info: '/manga/mangakakalot/info?id={id}',
    },
    rateLimit: { requests: 80, window: 60 },
    timeout: 8000,
    enabled: false,
    tags: ['manhua', 'webtoon'],
  },

  // ─── DONGHUA ──────────────────────────────────────────────────

{
    id       : 'donghuafilm',
    category : 'donghua',
    provider : 'donghuafilm',
    label    : 'Donghuafilm',
    baseUrl  : 'https://donghuafilm.com',
    endpoints: {
      // Endpoint Global (Satu Folder)
      search     : '/?s={query}', 
      api_search: '/api/donghua/search',
    api_latest: '/api/donghua/latest',
    api_popular: '/api/donghua/popular',
    },
    rateLimit: { requests: 30, window: 60 },
    timeout  : 15000, 
    enabled  : true,
    tags     : ['donghua', 'sub-indo', 'scraper'],
  },
];

/** Get a single API config by id */
export function getApiById(id) {
  return API_REGISTRY.find((a) => a.id === id) || null;
}

/** Get all APIs for a category */
export function getApisByCategory(category) {
  return API_REGISTRY.filter((a) => a.category === category);
}

/** Get all enabled APIs */
export function getEnabledApis() {
  return API_REGISTRY.filter((a) => a.enabled);
}

/** Categories list */
export const CATEGORIES = ['anime', 'manga', 'manhua', 'donghua'];
