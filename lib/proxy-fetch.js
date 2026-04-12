/**
 * Proxy fetch — handles retries, timeouts, fallback providers, and cache.
 */

import { cacheGet, cacheSet } from './cache.js';
import { API_REGISTRY } from './api-registry.js';

const MAX_RETRIES = 3;
const RETRY_DELAY = 600; // ms

export async function proxyFetch(url, options = {}, cacheKey = null, cacheTtl = 180) {
  // Cache hit?
  if (cacheKey) {
    const cached = await cacheGet(cacheKey);
    if (cached) return { data: cached, fromCache: true, source: 'cache' };
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeout ?? 8000);
      const start = Date.now();
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'User-Agent': 'AnimeGateway/1.0',
          Accept: 'application/json',
          ...(options.headers || {}),
        },
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from upstream`);
      }

      const data = await res.json();
      const elapsed = Date.now() - start;

      if (cacheKey) await cacheSet(cacheKey, data, cacheTtl);

      return { data, fromCache: false, elapsed, attempt };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY * attempt);
    }
  }

  // All retries failed — try last cache
  if (cacheKey) {
    const stale = await cacheGet(cacheKey);
    if (stale) return { data: stale, fromCache: true, stale: true, source: 'stale-cache' };
  }

  throw lastError;
}

/**
 * Build a real URL from an endpoint template.
 * Template syntax: /search/{query}?page={page}
 */
export function buildUrl(baseUrl, template, params = {}) {
  let path = template;
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
  }
  // Remove unreplaced placeholders
  path = path.replace(/\{[^}]+\}/g, '');
  return `${baseUrl}${path}`;
}

/**
 * Find fallback providers for a given category.
 */
export function getFallbackApis(primaryId, category) {
  return API_REGISTRY.filter(
    (a) => a.category === category && a.id !== primaryId && a.enabled
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
