/**
 * Health Checker — pings internal API endpoints, retries on failure,
 * stores results in cache, marks status as ONLINE / WARNING / DOWN.
 */

import { API_REGISTRY } from './api-registry.js';
import { cacheGet, cacheSet } from './cache.js';

const CACHE_PREFIX    = 'health:';
const STATUS_CACHE_TTL = 120;   // seconds
const ERROR_LOG_KEY   = 'errorlog';
const ERROR_LOG_TTL   = 86400; // 24 h

export const STATUS = {
  ONLINE   : 'online',
  WARNING  : 'warning',
  DOWN     : 'down',
  UNKNOWN  : 'unknown',
  DISABLED : 'disabled',
};

// ─────────────────────────────────────────────────────────────────
// PROBE URL BUILDER
// Ping endpoint internal Next.js (/api/...) bukan baseUrl provider
// ─────────────────────────────────────────────────────────────────

const INTERNAL_PROBE = {
  // anime
  'samehadaku'    : '/api/anime/popular?page=1',
  'otakudesu'     : '/api/v2/anime/popular?page=1',

  // manga
  'komikstation'  : '/api/manga/popular?page=1',

  // manhua
  'manhwaland'    : '/api/manhua/popular',

  // donghua
  'kuramanime'    : '/api/donghua/popular',
  'donghua-v2'    : '/api/v2/donghua/popular',

  // system
  'system-status' : '/api/status',
};

function buildProbeUrl(apiConfig) {
  // Gunakan internal probe path jika tersedia
  const internalPath = INTERNAL_PROBE[apiConfig.id];
  if (internalPath) {
    // Di Vercel, gunakan VERCEL_URL env var. Lokal pakai localhost.
    const base = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    return `${base}${internalPath}`;
  }

  // Fallback: ping baseUrl provider langsung (hanya untuk monitoring eksternal)
  const firstEndpoint = Object.values(apiConfig.endpoints)[0]
    .replace(/\{[^}]+\}/g, 'test');
  return `${apiConfig.baseUrl}${firstEndpoint}`;
}

// ─────────────────────────────────────────────────────────────────
// FETCH WITH TIMEOUT
// ─────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);
  const start      = Date.now();
  try {
    const res     = await fetch(url, {
      signal  : controller.signal,
      cache   : 'no-store',
      headers : { 'User-Agent': 'AnimeGateway/1.0 HealthChecker' },
    });
    const elapsed = Date.now() - start;
    return { ok: res.ok, status: res.status, elapsed };
  } catch (err) {
    return { ok: false, status: 0, elapsed: Date.now() - start, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// CHECK SINGLE API
// ─────────────────────────────────────────────────────────────────

export async function checkApi(apiConfig, retries = 2) {
  if (!apiConfig.enabled) {
    return buildStatus(apiConfig, STATUS.DISABLED, 0, null);
  }

  const url = buildProbeUrl(apiConfig);

  let lastResult;
  for (let attempt = 0; attempt <= retries; attempt++) {
    lastResult = await fetchWithTimeout(url, apiConfig.timeout || 15000);
    if (lastResult.ok) break;
    if (attempt < retries) await sleep(800 * (attempt + 1));
  }

  let statusLabel;
  if (!lastResult.ok) {
    statusLabel = STATUS.DOWN;
    await logError(apiConfig, lastResult.error || `HTTP ${lastResult.status}`);
  } else if (lastResult.elapsed > 5000) {
    statusLabel = STATUS.WARNING;
  } else {
    statusLabel = STATUS.ONLINE;
  }

  const record = buildStatus(apiConfig, statusLabel, lastResult.elapsed, lastResult.status);
  await cacheSet(`${CACHE_PREFIX}${apiConfig.id}`, record, STATUS_CACHE_TTL);
  return record;
}

// ─────────────────────────────────────────────────────────────────
// CHECK ALL
// ─────────────────────────────────────────────────────────────────

export async function checkAllApis() {
  const results = await Promise.allSettled(
    API_REGISTRY.map(api => checkApi(api))
  );
  return results
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────
// GET CACHED STATUS
// ─────────────────────────────────────────────────────────────────

export async function getAllStatuses() {
  const results = await Promise.all(
    API_REGISTRY.map(async api => {
      const cached = await cacheGet(`${CACHE_PREFIX}${api.id}`);
      if (cached) return cached;
      return buildStatus(api, api.enabled ? STATUS.UNKNOWN : STATUS.DISABLED, 0, null);
    })
  );
  return results;
}

export async function getApiStatus(id) {
  return (await cacheGet(`${CACHE_PREFIX}${id}`)) || null;
}

// ─────────────────────────────────────────────────────────────────
// ERROR LOG
// ─────────────────────────────────────────────────────────────────

export async function getErrorLog() {
  return (await cacheGet(ERROR_LOG_KEY)) || [];
}

async function logError(apiConfig, message) {
  const existing = (await cacheGet(ERROR_LOG_KEY)) || [];
  const entry    = {
    id       : `err_${Date.now()}`,
    api_id   : apiConfig.id,
    probe_url: buildProbeUrl(apiConfig),
    message,
    time     : new Date().toISOString(),
    category : apiConfig.category,
  };
  const updated = [entry, ...existing].slice(0, 500);
  await cacheSet(ERROR_LOG_KEY, updated, ERROR_LOG_TTL);
}

// ─────────────────────────────────────────────────────────────────
// UPTIME STATS
// ─────────────────────────────────────────────────────────────────

export async function getUptimeStats(apiId) {
  const histKey = `history:${apiId}`;
  const history = (await cacheGet(histKey)) || [];
  if (!history.length) return { uptime: 100, checks: 0 };
  const online = history.filter(h =>
    h.status === STATUS.ONLINE || h.status === STATUS.WARNING
  ).length;
  return {
    uptime  : Math.round((online / history.length) * 1000) / 10,
    checks  : history.length,
    history,
  };
}

export async function saveHistoryPoint(record) {
  const histKey = `history:${record.id}`;
  const existing = (await cacheGet(histKey)) || [];
  const updated  = [
    { status: record.status, response_time: record.response_time, time: record.last_checked },
    ...existing,
  ].slice(0, 288); // 24h @ 5-min intervals
  await cacheSet(histKey, updated, 86400);
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

function buildStatus(apiConfig, status, responseTime, httpStatus) {
  return {
    id            : apiConfig.id,
    label         : apiConfig.label,
    provider      : apiConfig.provider,
    category      : apiConfig.category,
    version       : apiConfig.version || 'v1',
    status,
    response_time : responseTime,
    http_status   : httpStatus,
    last_checked  : new Date().toISOString(),
    enabled       : apiConfig.enabled,
    tags          : apiConfig.tags,
    probe_url     : buildProbeUrl(apiConfig),
  };
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// ─────────────────────────────────────────────────────────────────
// SCHEDULER (self-hosted only, tidak jalan di Vercel serverless)
// ─────────────────────────────────────────────────────────────────

let schedulerStarted = false;

export function startHealthScheduler(intervalMs = 300000) { // 5 menit
  if (schedulerStarted || typeof setInterval === 'undefined') return;
  if (process.env.VERCEL) return;
  schedulerStarted = true;
  checkAllApis().then(results => results.forEach(saveHistoryPoint));
  setInterval(async () => {
    const results = await checkAllApis();
    results.forEach(saveHistoryPoint);
  }, intervalMs);
}
