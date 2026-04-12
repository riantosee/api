/**
 * Admin authentication helper.
 *
 * How it works:
 *  1. Set ADMIN_SECRET=<random-long-string> in your .env.local / Vercel env vars
 *  2. Every request to /api/admin/* must include:
 *       X-Admin-Secret: <your-secret>
 *  3. If ADMIN_SECRET is not set in env, admin routes are completely locked (403).
 *
 * The secret never appears in frontend code or API responses.
 */

export function verifyAdmin(req) {
  const secret = process.env.ADMIN_SECRET;

  // If no secret configured → lock down completely
  if (!secret) {
    return { ok: false, status: 403, message: 'Admin access not configured. Set ADMIN_SECRET env var.' };
  }

  const provided = req.headers.get('x-admin-secret');

  if (!provided || provided !== secret) {
    return { ok: false, status: 401, message: 'Invalid or missing X-Admin-Secret header.' };
  }

  return { ok: true };
}
