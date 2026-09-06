import { hashToken, isSessionInactive, sessionCookieName } from './session-tokens.js';
import * as sessions from '../repositories/sessions.js';

/**
 * Real session-cookie actor resolver (T10), replacing the fail-closed
 * default in http-contract.js. Reads the session cookie, checks both the
 * absolute expiry (DB column) and the inactivity window (re-derived from
 * last_seen so it's testable with an injected clock), and touches
 * last_seen on every successful resolution.
 */
export function createSessionActorResolver(db, { isProduction, now = () => new Date() }) {
  const cookieName = sessionCookieName(isProduction);

  return async function resolveActor(request) {
    const rawToken = request.cookies?.[cookieName];
    if (!rawToken) return null;

    const nowDate = now();
    const nowIso = nowDate.toISOString();
    const tokenHash = hashToken(rawToken);
    const session = sessions.findActiveByTokenHash(db, tokenHash, nowIso);
    if (!session) return null;

    if (isSessionInactive(session.lastSeen, nowDate.getTime())) {
      sessions.revoke(db, session.id);
      return null;
    }

    sessions.touchLastSeen(db, session.id, nowIso);

    return {
      userId: session.userId,
      sessionId: session.id,
      csrfToken: session.csrfToken,
    };
  };
}
