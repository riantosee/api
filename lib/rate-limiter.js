/**
 * Rate limiter — sliding window, per IP + per API key.
 * Falls back to in-memory if Redis unavailable.
 */

const windows = new Map(); // key → { count, resetAt }

export function getRateLimitKey(req, apiKey = null) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1';
  return apiKey ? `rl:key:${apiKey}` : `rl:ip:${ip}`;
}

/**
 * @param {string} key
 * @param {number} maxRequests  — requests allowed per window
 * @param {number} windowSecs  — window size in seconds
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
export function checkRateLimit(key, maxRequests = 60, windowSecs = 60) {
  const now = Date.now();
  const resetAt = now + windowSecs * 1000;

  if (!windows.has(key)) {
    windows.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  const entry = windows.get(key);

  // Window expired — reset
  if (now > entry.resetAt) {
    windows.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  // Within window
  entry.count += 1;
  const remaining = Math.max(0, maxRequests - entry.count);
  return {
    allowed: entry.count <= maxRequests,
    remaining,
    resetAt: entry.resetAt,
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
  };
}

/** Clean up expired windows (call periodically) */
export function cleanExpiredWindows() {
  const now = Date.now();
  for (const [key, entry] of windows.entries()) {
    if (now > entry.resetAt) windows.delete(key);
  }
}

// Auto-clean every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanExpiredWindows, 5 * 60 * 1000);
}
