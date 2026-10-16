import { randomBytes, createHash } from 'node:crypto';
import * as users from '../repositories/users.js';

// T11: fixture-tested operator reset-token path. No unauthenticated HTTP
// endpoint issues a token — only the operator CLI (server/scripts/
// reset-password.mjs) can. The HTTP side only consumes a token an operator
// already handed to the account owner out-of-band. Single-use, time-limited.

export const RESET_TOKEN_LIFETIME_MS = 30 * 60 * 1000; // 30 minutes

export function generateResetToken() {
  return randomBytes(32).toString('base64url');
}

export function hashResetToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Issues a single-use, time-limited reset token. Returns the raw token, or
 * null if no account exists for the given normalized email (the operator
 * CLI reports this to the operator, not to any remote caller). */
export function issueResetToken(db, normalizedEmail, now = new Date()) {
  const user = users.findByEmail(db, normalizedEmail);
  if (!user) return null;

  const rawToken = generateResetToken();
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_LIFETIME_MS).toISOString();

  db.prepare('INSERT INTO server_meta (key, value) VALUES (?, ?)').run(
    `reset_token:${tokenHash}`,
    JSON.stringify({ userId: user.id, expiresAt, used: false }),
  );

  return rawToken;
}

/** Consumes a reset token: validates existence/unused/unexpired, marks it
 * used (single-use), and returns the associated userId. Throws a
 * descriptive Error otherwise. Does not itself change the password. */
export function consumeResetToken(db, rawToken, now = new Date()) {
  const tokenHash = hashResetToken(rawToken);
  const key = `reset_token:${tokenHash}`;
  const row = db.prepare('SELECT value FROM server_meta WHERE key = ?').get(key);
  if (!row) throw new Error('Invalid or unknown reset token.');

  const record = JSON.parse(row.value);
  if (record.used) throw new Error('Reset token has already been used.');
  if (new Date(record.expiresAt).getTime() < now.getTime()) throw new Error('Reset token has expired.');

  record.used = true;
  db.prepare('UPDATE server_meta SET value = ? WHERE key = ?').run(JSON.stringify(record), key);

  return record.userId;
}
