// Migration authorization for the persistent DEV datastore (the human's data).
//
// Applied migrations stay recognised as they always were. A migration that is still PENDING on a database that already has history
// must be authorized, version by version, before this process may run it: SMARTLEARN_AUTHORIZE_MIGRATIONS="39" or "39,40".
// A database with no migration history yet (first creation) needs no authorization: there is no data to change.
//
// The check reads the database through its OWN read-only connection and runs BEFORE the caller opens it for writing (openDb sets
// journal_mode = WAL, which rewrites the header of a database that is not in WAL yet): a refusal leaves the database files untouched.

import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { isDevDatastoreDb } from './dev-datastore.js';
import { pendingMigrations } from './migrations.js';

export const AUTHORIZE_ENV = 'SMARTLEARN_AUTHORIZE_MIGRATIONS';

/** "35, 36" -> Set{35, 36}. Anything that is not a list of positive integers authorizes nothing. */
export function parseAuthorizedVersions(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return new Set();
  const parts = raw.split(',').map((part) => part.trim());
  if (!parts.every((part) => /^[1-9]\d*$/.test(part))) return new Set();
  return new Set(parts.map(Number));
}

/**
 * @param fromVersion newest applied version (0 = the database has no history)
 * @param pending     versions that are in the build but not yet applied
 * @returns {{ ok: true } | { ok: false, unauthorized: number[], fromVersion: number, message: string }}
 */
export function checkMigrationAuthorization({ fromVersion, pending }, env = process.env) {
  if (fromVersion === 0 || pending.length === 0) return { ok: true };
  const authorized = parseAuthorizedVersions(env[AUTHORIZE_ENV]);
  const unauthorized = pending.filter((version) => !authorized.has(version));
  if (unauthorized.length === 0) return { ok: true };
  return {
    ok: false,
    unauthorized,
    fromVersion,
    message:
      `REFUSING to migrate: this build would apply migration(s) ${unauthorized.join(', ')} to the persistent DEV database ` +
      `(currently at schema v${fromVersion}), and they are not authorized. Nothing was changed. ` +
      `To allow it, start this process with ${AUTHORIZE_ENV}=${pending.join(',')} (a verified pre-migration snapshot is still taken first).`,
  };
}

/**
 * Decides for the database FILE, without opening it for writing. Anything that is not the DEV datastore (tests, e2e, scratch copies),
 * or does not exist yet, is not guarded. A DEV database that cannot even be read is refused (fail closed).
 */
export function migrationAuthorizationForPath(dbPath, env = process.env) {
  if (!isDevDatastoreDb(dbPath, env) || !existsSync(dbPath)) return { ok: true };
  let probe;
  try {
    probe = new Database(dbPath, { readonly: true, fileMustExist: true });
    const state = pendingMigrations(probe);
    // "no history" means a NEW database only when it also has no tables. A database somebody already filled but that records no migration
    // (history table missing or empty) is not new: nothing is run on it, whatever the authorization says.
    if (state.fromVersion === 0) {
      const tables = probe.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'").get().n;
      if (tables > 0) {
        return { ok: false, unauthorized: state.pending, fromVersion: 0, message: 'REFUSING to migrate: the persistent DEV database already has tables but no migration history, so it is not a new database and no migration can be applied to it. Nothing was changed.' };
      }
    }
    return checkMigrationAuthorization(state, env);
  } catch (err) {
    return { ok: false, unauthorized: [], fromVersion: 0, message: `REFUSING to migrate: the persistent DEV database could not be inspected read-only (${err.message}). Nothing was changed.` };
  } finally {
    probe?.close();
  }
}

/** For every command that is about to run migrations and writes: throws unless the check above passes. */
export function assertMigrationAuthorizedForPath(dbPath, env = process.env) {
  const result = migrationAuthorizationForPath(dbPath, env);
  if (!result.ok) throw new Error(result.message);
}
