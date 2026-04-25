/**
 * API Registry — Central configuration for all streaming content providers.
 *
 * Struktur multi-provider per kategori:
 *   category: 'anime' | 'manga' | 'manhua' | 'donghua'
 *   version : 'v1' | 'v2' | dst — sesuai label di page tester
 *
 * Untuk tambah provider baru:
 *   1. Push entry baru ke API_REGISTRY
 *   2. Tambah version baru di CATEGORIES di page tester
 *   3. Tambah entry di CAT_BG jika perlu background baru
 */

export const API_REGISTRY = [

  // ═══════════════════════════════════════════════════════════════
  // ANIME
  // ═══════════════════════════════════════════════════════════════

  // ── v1 · Samehadaku ──────────────────────────────────────────
  {
    id       : 'samehadaku',
    category : 'anime',
    version  : 'v1',
    provider : 'samehadaku',
    label    : 'Samehadaku',
    baseUrl  : 'https://v2.samehadaku.how',
    endpoints: {
      search    : '/api/anime/search',
      latest    : '/api/anime/latest',
      popular   : '/api/anime/popular',
      listgenre : '/api/anime/listgenre',
      schedule  : '/api/anime/schedule',
      batch     : '/api/anime/batch',
      detail    : '/api/anime/detail',
      watch     : '/api/anime/watch',
    },
    rateLimit: { requests: 30, window: 60 },
    timeout  : 20000,
    enabled  : true,
    tags     : ['anime', 'sub-indo', 'scraper', 'indonesia'],
  },

  // ── v2 · Otakudesu ───────────────────────────────────────────
  {
    id       : 'otakudesu',
    category : 'anime',
    version  : 'v2',
    provider : 'otakudesu',
    label    : 'Otakudesu',
    baseUrl  : 'https://otakudesu.cloud',
    endpoints: {
      search  : '/api/v2/anime/search',
      latest  : '/api/v2/anime/latest',
      popular : '/api/v2/anime/popular',
      detail  : '/api/v2/anime/detail',
      watch   : '/api/v2/anime/watch',
    },
    rateLimit: { requests: 30, window: 60 },
    timeout  : 20000,
    enabled  : true,
    tags     : ['anime', 'sub-indo', 'scraper', 'indonesia'],
  },

  // ═══════════════════════════════════════════════════════════════
  // MANGA
  // ═══════════════════════════════════════════════════════════════

  // ── v1 · Komikstation ─────────────────────────────────────────
  {
    id       : 'komikstation',
    category : 'manga',
    version  : 'v1',
    provider : 'komikstation',
    label    : 'Komikstation',
    baseUrl  : 'https://komikstation.co',
    endpoints: {
      search    : '/api/manga/search',
      latest    : '/api/manga/latest',
      popular   : '/api/manga/popular',
      new       : '/api/manga/new',
      listgenre : '/api/manga/listgenre',
      az        : '/api/manga/az',
      detail    : '/api/manga/detail',
      read      : '/api/manga/read',
    },
    rateLimit: { requests: 30, window: 60 },
    timeout  : 20000,
    enabled  : true,
    tags     : ['manga', 'manhwa', 'sub-indo', 'scraper', 'indonesia'],
  },

  // ═══════════════════════════════════════════════════════════════
  // MANHUA
  // ═══════════════════════════════════════════════════════════════

  // ── v1 · Manhwaland ───────────────────────────────────────────
  {
    id       : 'manhwaland',
    category : 'manhua',
    version  : 'v1',
    provider : 'manhwaland',
    label    : 'Manhwaland',
    baseUrl  : 'https://www.manhwaindo.my',
    endpoints: {
      search  : '/api/manhua/search',
      popular : '/api/manhua/popular',
      latest  : '/api/manhua/latest',
      project : '/api/manhua/project',
      detail  : '/api/manhua/detail',
      chapter : '/api/manhua/chapter',
    },
    rateLimit: { requests: 30, window: 60 },
    timeout  : 20000,
    enabled  : true,
    tags     : ['manhua', 'manhwa', 'korean', 'sub-indo', 'scraper'],
  },

  // ═══════════════════════════════════════════════════════════════
  // DONGHUA
  // ═══════════════════════════════════════════════════════════════

  // ── v1 · Kuramanime ───────────────────────────────────────────
  {
    id       : 'kuramanime',
    category : 'donghua',
    version  : 'v1',
    provider : 'kuramanime',
    label    : 'Kuramanime',
    baseUrl  : 'https://kuramanime.dad',
    endpoints: {
      search   : '/api/donghua/search',
      latest   : '/api/donghua/latest',
      popular  : '/api/donghua/popular',
      detail   : '/api/donghua/detail',
      episodes : '/api/donghua/episodes',
      schedule : '/api/donghua/schedule',
      genres   : '/api/donghua/genres',
    },
    rateLimit: { requests: 30, window: 60 },
    timeout  : 20000,
    enabled  : true,
    tags     : ['donghua', 'sub-indo', 'scraper', 'indonesia'],
  },

  // ── v2 · Provider B ───────────────────────────────────────────
  {
    id       : 'donghua-v2',
    category : 'donghua',
    version  : 'v2',
    provider : 'providerB',
    label    : 'Provider B',
    baseUrl  : 'https://example-donghua.com',
    endpoints: {
      search  : '/api/v2/donghua/search',
      latest  : '/api/v2/donghua/latest',
      popular : '/api/v2/donghua/popular',
    },
    rateLimit: { requests: 30, window: 60 },
    timeout  : 20000,
    enabled  : false, // belum aktif
    tags     : ['donghua', 'sub-indo'],
  },

  // ═══════════════════════════════════════════════════════════════
  // SYSTEM (tidak tampil di tester, hanya internal)
  // ═══════════════════════════════════════════════════════════════
  {
    id       : 'system-status',
    category : 'system',
    version  : 'v1',
    provider : 'internal',
    label    : 'System Status',
    baseUrl  : '',
    endpoints: {
      status : '/api/status',
      health : '/api/health',
    },
    rateLimit: { requests: 60, window: 60 },
    timeout  : 5000,
    enabled  : true,
    tags     : ['system', 'internal'],
  },
];

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

/** Get single API config by id */
export function getApiById(id) {
  return API_REGISTRY.find(a => a.id === id) || null;
}

/** Get all APIs for a category */
export function getApisByCategory(category) {
  return API_REGISTRY.filter(a => a.category === category);
}

/** Get all enabled APIs */
export function getEnabledApis() {
  return API_REGISTRY.filter(a => a.enabled);
}

/** Get all APIs for a category + version */
export function getApiByVersion(category, version) {
  return API_REGISTRY.find(a => a.category === category && a.version === version) || null;
}

/** Get all versions available for a category */
export function getVersionsByCategory(category) {
  return API_REGISTRY
    .filter(a => a.category === category)
    .map(a => ({ version: a.version, provider: a.provider, label: a.label, enabled: a.enabled }));
}

/** Categories list */
export const CATEGORIES = ['anime', 'manga', 'manhua', 'donghua'];
