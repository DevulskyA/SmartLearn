// Verified snapshots of the persistent DEV database (the human's data): one per day before the Desktop opens, and one named
// `pre-migrate-v<N>` immediately before a pending migration runs. A snapshot is a consistent single-file copy made with SQLite's
// own VACUUM INTO (never a raw copy of db+wal+shm while a writer may be active), checked (`integrity_check`, row counts, sha256 of
// the file) and described by a manifest, so "there is a backup" always means "there is a backup that opens and has the data".
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { pendingMigrations } from './migrations.js';

const dayStamp = (now) => now.toISOString().slice(0, 10);
const SNAPSHOT_DB = 'smartlearn-dev.db';

export const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function userTables(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
}

export function tableCounts(db) {
  const counts = {};
  for (const name of userTables(db)) counts[name] = db.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`).get().n;
  return counts;
}

function schemaVersion(db) {
  try { return db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v ?? 0; } catch { return 0; }
}

/**
 * Writes `<snapshotsDir>/<name>/smartlearn-dev.db` + `manifest.json` from a consistent read of `dbPath`, then re-opens the
 * copy read-only and verifies it. Throws (and removes the partial snapshot) when the copy does not verify.
 * `expectSameCounts`: when the caller knows no other writer exists (pre-migration), the copy must have exactly the source counts.
 */
export function takeVerifiedSnapshot(dbPath, snapshotsDir, name, { now = new Date(), kind = 'daily', expectSameCounts = false } = {}) {
  if (!existsSync(dbPath) || statSync(dbPath).size === 0) throw new Error(`no database to snapshot at ${dbPath}`);
  const target = join(snapshotsDir, name);
  if (existsSync(target)) throw new Error(`snapshot ${name} already exists`);
  mkdirSync(target, { recursive: true });
  const file = join(target, SNAPSHOT_DB);
  try {
    const source = new Database(dbPath, { readonly: true, fileMustExist: true });
    let sourceCounts;
    try {
      source.pragma('busy_timeout = 5000');
      source.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      if (expectSameCounts) sourceCounts = tableCounts(source);
    } finally { source.close(); }

    const copy = new Database(file, { readonly: true, fileMustExist: true });
    let manifest;
    try {
      const integrity = copy.pragma('integrity_check', { simple: true });
      const foreignKeyViolations = copy.pragma('foreign_key_check').length;
      const counts = tableCounts(copy);
      if (integrity !== 'ok') throw new Error(`snapshot integrity_check = ${integrity}`);
      if (foreignKeyViolations > 0) throw new Error(`snapshot has ${foreignKeyViolations} foreign key violations`);
      if (sourceCounts && JSON.stringify(sourceCounts) !== JSON.stringify(counts)) throw new Error('snapshot row counts differ from the source');
      manifest = { name, kind, takenAt: now.toISOString(), sourceDb: dbPath, schemaVersion: schemaVersion(copy), integrity, foreignKeyViolations, counts, sha256: null, bytes: 0 };
    } finally { copy.close(); }
    manifest.bytes = statSync(file).size;
    manifest.sha256 = sha256File(file);
    writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, 1));
    return { dir: target, file, manifest };
  } catch (err) {
    rmSync(target, { recursive: true, force: true });
    throw err;
  }
}

/** A snapshot is valid when its manifest is readable and the file still has the recorded sha256. */
export function isValidSnapshot(dir) {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    return manifest.integrity === 'ok' && sha256File(join(dir, SNAPSHOT_DB)) === manifest.sha256;
  } catch { return false; }
}

/**
 * Retention: keep the newest `keepDays` daily snapshots; `pre-migrate-*` snapshots are never pruned (one per schema step, small, and the only way back from a bad migration). It never removes a
 * snapshot if that would leave no valid one, and never touches anything that is not a snapshot directory it recognises.
 */
export function applyRetention(snapshotsDir, { keepDays = 7 } = {}) {
  if (!existsSync(snapshotsDir)) return [];
  const names = readdirSync(snapshotsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const daily = names.filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort();
  const removable = daily.slice(0, Math.max(0, daily.length - keepDays));
  const removed = [];
  for (const name of removable) {
    const remaining = names.filter((n) => !removed.includes(n) && n !== name);
    if (!remaining.some((n) => isValidSnapshot(join(snapshotsDir, n)))) continue;
    rmSync(join(snapshotsDir, name), { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}

/** Today's verified snapshot, once per calendar day. Returns the snapshot, or null when one already exists / there is no data. */
export function dailySnapshotIfNeeded(dbPath, snapshotsDir, { now = new Date(), keepDays = 7 } = {}) {
  if (!existsSync(dbPath) || statSync(dbPath).size === 0) return null;
  const name = dayStamp(now);
  if (existsSync(join(snapshotsDir, name))) return null;
  const snapshot = takeVerifiedSnapshot(dbPath, snapshotsDir, name, { now, kind: 'daily' });
  applyRetention(snapshotsDir, { keepDays });
  return snapshot;
}

/** The snapshot taken immediately before migrating from `fromVersion`; must verify before any migration is allowed to run. */
export function preMigrationSnapshot(dbPath, snapshotsDir, fromVersion, { now = new Date() } = {}) {
  let name = `pre-migrate-v${fromVersion}`;
  if (existsSync(join(snapshotsDir, name))) name = `${name}-${now.toISOString().replace(/[:.]/g, '-')}`;
  return takeVerifiedSnapshot(dbPath, snapshotsDir, name, { now, kind: 'pre-migrate', expectSameCounts: true });
}

/**
 * Call right before runMigrations on the persistent DEV database: when migrations are pending on a database that already has
 * data, a verified `pre-migrate-v<from>` snapshot is taken FIRST. Any failure throws, so the migration never runs without a
 * backup. Returns the snapshot, or null when nothing is pending / the database is new.
 */
export function snapshotBeforeMigration(db, dbPath, snapshotsDir, { migrationsDir, now = new Date() } = {}) {
  const { fromVersion, pending } = pendingMigrations(db, migrationsDir);
  if (pending.length === 0 || fromVersion === 0) return null;
  return preMigrationSnapshot(dbPath, snapshotsDir, fromVersion, { now });
}
