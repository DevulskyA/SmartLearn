import { randomBytes, createHash } from 'node:crypto';

// design.md §3: random 32-byte opaque token; only its SHA-256 hash is
// ever persisted. The raw token exists only in the client's cookie.
export function generateSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(rawToken) {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export const SESSION_ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_INACTIVITY_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const SESSION_COOKIE_NAME_PROD = '__Host-sl_session';
export const SESSION_COOKIE_NAME_DEV = 'sl_session_dev';

/**
 * Cookie attributes per design.md §3: HttpOnly, SameSite=Lax, Path=/,
 * Secure + __Host- prefix on HTTPS production; a distinct non-Secure name
 * only on loopback dev. `isProduction` must reflect the actual serving
 * scheme, not just NODE_ENV, if a caller ever serves prod over HTTP.
 */
export function sessionCookieOptions(isProduction) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProduction,
  };
}

export function sessionCookieName(isProduction) {
  return isProduction ? SESSION_COOKIE_NAME_PROD : SESSION_COOKIE_NAME_DEV;
}

/**
 * A session is expired if either the absolute lifetime or the inactivity
 * window has elapsed, independent of what the DB query's `expires_at`
 * column alone enforces (that column tracks the absolute lifetime; the
 * inactivity window is re-derived here from last_seen so it can be tested
 * with an injected clock instead of relying on wall-clock timing).
 */
export function isSessionInactive(lastSeenIso, nowMs) {
  return nowMs - new Date(lastSeenIso).getTime() > SESSION_INACTIVITY_LIFETIME_MS;
}
