// Migration authorization for the persistent DEV datastore (the human's data).
//
// Applied migrations stay recognised as they always were. A migration that is still PENDING on a database that already has history
// must be authorized, version by version, before this process may run it: SMARTLEARN_AUTHORIZE_MIGRATIONS="39" or "39,40".
// A database with no migration history yet (first creation) needs no authorization: there is no data to change.

import { isDevDatastoreDb } from './dev-datastore.js';
import { pendingMigrations } from './migrations.js';

export const AUTHORIZE_ENV ='SMARTLEARN_AUTHORIZE_MIGRATIONS';

/** "35, 36" -> Set{35, 36}. Anything that is not a list of positive integers authorizes nothing. */
export function parseAuthorizedVersions(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return new Set();
  const parts = raw.split(',').map((part) => part.trim());
  if (!parts.every((part) => /^[1-9]\d*$/.test(part))) return new Set();
  return new Set(parts.map(Number));
}

/** For every command that is about to run migrations on `dbPath`: throws unless that is not the DEV datastore or nothing unauthorized is pending. */
export function assertMigrationAuthorized(db, dbPath, env = process.env) {
  if (!isDevDatastoreDb(dbPath, env)) return;
  const result = checkMigrationAuthorization(pendingMigrations(db), env);
  if (!result.ok) throw new Error(result.message);
}

/**
 * @param fromVersion newest applied version (0 = the database has no history)
 * @param pending     versions that are in the build but not yet applied
 * @returns {{ ok: true } | { ok: false, unauthorized: number[], message: string }}
 */
export function checkMigrationAuthorization({ fromVersion, pending }, env = process.env) {
  if (fromVersion === 0 || pending.length === 0) return { ok: true };
  const authorized = parseAuthorizedVersions(env[AUTHORIZE_ENV]);
  const unauthorized = pending.filter((version) => !authorized.has(version));
  if (unauthorized.length === 0) return { ok: true };
  return {
    ok: false,
    unauthorized,
    message:
      `REFUSING to migrate: this build would apply migration(s) ${unauthorized.join(', ')} to the persistent DEV database ` +
      `(currently at schema v${fromVersion}), and they are not authorized. Nothing was changed. ` +
      `To allow it, start this process with ${AUTHORIZE_ENV}=${pending.join(',')} (a verified pre-migration snapshot is still taken first).`,
  };
}
