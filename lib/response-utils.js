import { NextResponse } from 'next/server';

/** Standard success envelope */
export function successResponse(data, { source = 'gateway', page = 1, total = null, fromCache = false } = {}) {
  const body = {
    status: 'success',
    source,
    data,
    metadata: {
      total: total ?? (Array.isArray(data) ? data.length : 1),
      page,
      from_cache: fromCache,
      timestamp: new Date().toISOString(),
    },
  };
  const res = NextResponse.json(body, { status: 200 });
  if (fromCache) res.headers.set('X-Cache', 'HIT');
  return res;
}

/** Standard error envelope */
export function errorResponse(code, message, details = null) {
  const body = {
    status: 'error',
    code,
    message,
    ...(details && { details }),
    timestamp: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: code });
}

export function rateLimitError(retryAfter = 60) {
  return errorResponse(429, 'Rate limit exceeded', { retry_after: retryAfter });
}

export function notFoundError(resource = 'Resource') {
  return errorResponse(404, `${resource} not found`);
}

export function serverError(message = 'Internal server error') {
  return errorResponse(500, message);
}

export function gatewayError(message = 'Upstream provider unavailable') {
  return errorResponse(502, message);
}

/** Apply standard response headers */
export function withHeaders(response, extra = {}) {
  response.headers.set('X-Powered-By', 'AnimeGateway/1.0');
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  for (const [k, v] of Object.entries(extra)) response.headers.set(k, v);
  return response;
}
