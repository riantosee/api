/**
 * Cache layer — tries Redis first, falls back to in-memory Map.
 * TTL is in seconds.
 */

// ─── In-memory fallback ────────────────────────────────────────
const memoryStore = new Map();
const memoryExpiry = new Map();

function memGet(key) {
  const exp = memoryExpiry.get(key);
  if (exp && Date.now() > exp) {
    memoryStore.delete(key);
    memoryExpiry.delete(key);
    return null;
  }
  return memoryStore.has(key) ? memoryStore.get(key) : null;
}

function memSet(key, value, ttlSeconds) {
  memoryStore.set(key, value);
  if (ttlSeconds) {
    memoryExpiry.set(key, Date.now() + ttlSeconds * 1000);
  }
}

function memDel(key) {
  memoryStore.delete(key);
  memoryExpiry.delete(key);
}

function memKeys(pattern) {
  const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
  return [...memoryStore.keys()].filter((k) => regex.test(k));
}

// ─── Redis client (optional) ──────────────────────────────────
let redis = null;

async function getRedis() {
  if (redis) return redis;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 3000 });
    await redis.ping();
    return redis;
  } catch {
    redis = null;
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────
export async function cacheGet(key) {
  const r = await getRedis();
  if (r) {
    try {
      const val = await r.get(key);
      return val ? JSON.parse(val) : null;
    } catch {
      return memGet(key);
    }
  }
  return memGet(key);
}

export async function cacheSet(key, value, ttlSeconds = 300) {
  const r = await getRedis();
  const serialized = JSON.stringify(value);
  if (r) {
    try {
      await r.set(key, serialized, 'EX', ttlSeconds);
      return;
    } catch {/* fall through */}
  }
  memSet(key, value, ttlSeconds);
}

export async function cacheDel(key) {
  const r = await getRedis();
  if (r) {
    try { await r.del(key); return; } catch {/* fall through */}
  }
  memDel(key);
}

export async function cacheKeys(pattern) {
  const r = await getRedis();
  if (r) {
    try { return await r.keys(pattern); } catch {/* fall through */}
  }
  return memKeys(pattern);
}

export async function cacheGetOrSet(key, fetchFn, ttlSeconds = 300) {
  const cached = await cacheGet(key);
  if (cached !== null) return { data: cached, fromCache: true };
  const fresh = await fetchFn();
  await cacheSet(key, fresh, ttlSeconds);
  return { data: fresh, fromCache: false };
}
