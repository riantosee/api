/**
 * Health Checker — pings every registered API, retries on failure,
 * stores results in cache, marks status as ONLINE / WARNING / DOWN.
 */

import { API_REGISTRY } from './api-registry.js';
import { cacheGet, cacheSet, cacheKeys } from './cache.js';

const CACHE_PREFIX = 'health:';
const STATUS_CACHE_TTL = 120; // seconds
const ERROR_LOG_KEY = 'errorlog';
const ERROR_LOG_TTL = 86400; // 24 h

export const STATUS = {
  ONLINE: 'online',
  WARNING: 'warning',
  DOWN: 'down',
  UNKNOWN: 'unknown',
  DISABLED: 'disabled',
};

/**
 * Fetch with timeout.
 */
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'AnimeGateway/1.0 HealthChecker' },
    });
    const elapsed = Date.now() - start;
    return { ok: res.ok, status: res.status, elapsed };
  } catch (err) {
    return { ok: false, status: 0, elapsed: Date.now() - start, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check a single API with retries.
 */
export async function checkApi(apiConfig, retries = 2) {
  if (!apiConfig.enabled) {
    return buildStatus(apiConfig, STATUS.DISABLED, 0, null);
  }

  // Build a simple probe URL using the first available endpoint path
  const endpointPath = Object.values(apiConfig.endpoints)[0]
    .replace(/\{[^}]+\}/g, 'test');
  const url = `${apiConfig.baseUrl}${endpointPath}`;

  let lastResult;
  for (let attempt = 0; attempt <= retries; attempt++) {
    lastResult = await fetchWithTimeout(url, apiConfig.timeout);
    if (lastResult.ok) break;
    if (attempt < retries) await sleep(800 * (attempt + 1));
  }

  let statusLabel;
  if (!lastResult.ok) {
    statusLabel = STATUS.DOWN;
    await logError(apiConfig, lastResult.error || `HTTP ${lastResult.status}`);
  } else if (lastResult.elapsed > 3000) {
    statusLabel = STATUS.WARNING;
  } else {
    statusLabel = STATUS.ONLINE;
  }

  const record = buildStatus(apiConfig, statusLabel, lastResult.elapsed, lastResult.status);
  await cacheSet(`${CACHE_PREFIX}${apiConfig.id}`, record, STATUS_CACHE_TTL);
  return record;
}

function buildStatus(apiConfig, status, responseTime, httpStatus) {
  return {
    id: apiConfig.id,
    api: apiConfig.category,
    provider: apiConfig.provider,
    label: apiConfig.label,
    category: apiConfig.category,
    status,
    response_time: responseTime,
    http_status: httpStatus,
    last_checked: new Date().toISOString(),
    enabled: apiConfig.enabled,
    tags: apiConfig.tags,
  };
}

async function logError(apiConfig, message) {
  const existing = (await cacheGet(ERROR_LOG_KEY)) || [];
  const entry = {
    id: `err_${Date.now()}`,
    api_id: apiConfig.id,
    endpoint: apiConfig.baseUrl,
    message,
    time: new Date().toISOString(),
    category: apiConfig.category,
  };
  const updated = [entry, ...existing].slice(0, 500); // keep last 500
  await cacheSet(ERROR_LOG_KEY, updated, ERROR_LOG_TTL);
}

/**
 * Check ALL APIs concurrently.
 */
export async function checkAllApis() {
  const results = await Promise.allSettled(
    API_REGISTRY.map((api) => checkApi(api))
  );
  return results.map((r) => (r.status === 'fulfilled' ? r.value : null)).filter(Boolean);
}

/**
 * Get cached status for all APIs (fast, no network).
 */
export async function getAllStatuses() {
  const results = await Promise.all(
    API_REGISTRY.map(async (api) => {
      const cached = await cacheGet(`${CACHE_PREFIX}${api.id}`);
      if (cached) return cached;
      return buildStatus(api, api.enabled ? STATUS.UNKNOWN : STATUS.DISABLED, 0, null);
    })
  );
  return results;
}

/**
 * Get status for a single API by id.
 */
export async function getApiStatus(id) {
  return (await cacheGet(`${CACHE_PREFIX}${id}`)) || null;
}

/**
 * Get error log.
 */
export async function getErrorLog() {
  return (await cacheGet(ERROR_LOG_KEY)) || [];
}

/**
 * Compute uptime % from a rolling window of checks stored in history.
 */
export async function getUptimeStats(apiId) {
  const histKey = `history:${apiId}`;
  const history = (await cacheGet(histKey)) || [];
  if (!history.length) return { uptime: 100, checks: 0 };
  const online = history.filter((h) => h.status === STATUS.ONLINE || h.status === STATUS.WARNING).length;
  return {
    uptime: Math.round((online / history.length) * 1000) / 10,
    checks: history.length,
    history,
  };
}

/**
 * Save a history point (call this after each health check).
 */
export async function saveHistoryPoint(record) {
  const histKey = `history:${record.id}`;
  const existing = (await cacheGet(histKey)) || [];
  const updated = [
    { status: record.status, response_time: record.response_time, time: record.last_checked },
    ...existing,
  ].slice(0, 288); // keep 24 h at 5-min intervals
  await cacheSet(histKey, updated, 86400);
}

// ─── Scheduler ────────────────────────────────────────────────
// On Vercel: scheduling is handled by the /api/cron/health route (vercel.json).
// On self-hosted Node.js: call startHealthScheduler() once from your server entry.

let schedulerStarted = false;

export function startHealthScheduler(intervalMs = 30000) {
  if (schedulerStarted || typeof setInterval === 'undefined') return;
  // Only runs in long-lived Node.js environments (not Vercel serverless).
  if (process.env.VERCEL) return;
  schedulerStarted = true;
  checkAllApis().then((results) => results.forEach(saveHistoryPoint));
  setInterval(async () => {
    const results = await checkAllApis();
    results.forEach(saveHistoryPoint);
  }, intervalMs);
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
