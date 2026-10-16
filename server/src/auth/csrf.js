import { randomBytes, timingSafeEqual } from 'node:crypto';

// design.md §3: per-session synchronizer token, returned by authenticated
// bootstrap and required in X-CSRF-Token for authenticated mutations
// (including uploads). SameSite=Lax is defense in depth, not the only
// protection — this token is the primary one.

export function generateCsrfToken() {
  return randomBytes(32).toString('base64url');
}

export function csrfTokensMatch(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Exact-origin validation for cross-origin request forgery protection.
 * `allowedOrigins` is the exact configured origin set (design.md: dev uses
 * a Vite proxy so the browser's Origin already matches; production uses
 * one origin). Missing/null/unexpected Origin fails closed, except for a
 * request explicitly flagged as non-browser test tooling by the caller.
 */
export function originIsAllowed(originHeader, allowedOrigins) {
  if (!originHeader) return false;
  return allowedOrigins.includes(originHeader);
}

export function requiresCsrfCheck(method) {
  return MUTATING_METHODS.has(method.toUpperCase());
}
