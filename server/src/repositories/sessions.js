// T08: session persistence repository. Only the SHA-256 hash of the opaque
// session token is ever stored or read here — the raw token exists only in
// the client's cookie and the brief in-memory scope of the login/verify path.

function toSafeDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    lastSeen: row.last_seen,
    revokedAt: row.revoked_at,
    csrfToken: row.csrf_token,
  };
}

export function createSession(db, { tokenHash, userId, issuedAt, expiresAt, csrfToken }) {
  const stmt = db.prepare(`
    INSERT INTO sessions (token_hash, user_id, issued_at, expires_at, last_seen, csrf_token)
    VALUES (@tokenHash, @userId, @issuedAt, @expiresAt, @issuedAt, @csrfToken)
  `);
  try {
    const result = stmt.run({ tokenHash, userId, issuedAt, expiresAt, csrfToken: csrfToken ?? null });
    return findById(db, result.lastInsertRowid);
  } catch (err) {
    if (String(err.message).includes('FOREIGN KEY')) {
      const invalid = new Error('Session cannot reference a missing user.');
      invalid.code = 'INVALID_USER';
      throw invalid;
    }
    throw err;
  }
}

export function findById(db, id) {
  return toSafeDto(db.prepare('SELECT * FROM sessions WHERE id = ?').get(id));
}

export function findActiveByTokenHash(db, tokenHash, nowIso) {
  const row = db.prepare(`
    SELECT * FROM sessions
    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
  `).get(tokenHash, nowIso);
  return toSafeDto(row);
}

export function touchLastSeen(db, id, nowIso) {
  db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?').run(nowIso, id);
}

export function revoke(db, id) {
  const now = new Date().toISOString();
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, id);
}

export function revokeAllForUser(db, userId, { exceptId } = {}) {
  const now = new Date().toISOString();
  if (exceptId != null) {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL')
      .run(now, userId, exceptId);
  } else {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(now, userId);
  }
}
