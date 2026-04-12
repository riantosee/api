import { NextResponse } from 'next/server';
import { getRateLimitKey, checkRateLimit } from './lib/rate-limiter.js';

export function middleware(req) {
  const { pathname } = req.nextUrl;

  // ─── CORS preflight ─────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // ─── Only apply RL on /api/* routes (not internal) ──────────
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  // Skip RL for status + health routes (public monitoring)
  if (pathname.startsWith('/api/status') || pathname.startsWith('/api/health')) {
    return NextResponse.next();
  }

  const apiKey = req.headers.get('x-api-key') || null;
  const rlKey = getRateLimitKey(req, apiKey);

  // API-key users get higher limits
  const maxRequests = apiKey ? 200 : 60;
  const { allowed, remaining, retryAfter } = checkRateLimit(rlKey, maxRequests, 60);

  if (!allowed) {
    return NextResponse.json(
      {
        status: 'error',
        code: 429,
        message: 'Rate limit exceeded',
        retry_after: retryAfter,
        timestamp: new Date().toISOString(),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(maxRequests));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('X-Powered-By', 'AnimeGateway/1.0');
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
