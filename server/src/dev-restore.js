// Restore drill (T-F1-03): proves a snapshot of the persistent DEV database can actually be restored and read. It ALWAYS restores
// into a different, empty directory and never writes to the live datastore: swapping the canonical database is a separate,
// human-confirmed operation (with a backup of the current one) and is deliberately not automated here.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { devDataDir } from './dev-datastore.js';
import { isValidSnapshot, sha256File, tableCounts } from './dev-snapshot.js';

const inside = (child, parent) => {
  const c = resolve(child).toLowerCase();
  const p = resolve(parent).toLowerCase();
  return c === p || c.startsWith(p + sep);
};

/**
 * @param snapshotDir a snapshot directory (`smartlearn-dev.db` + `manifest.json`)
 * @param destDir an EMPTY (or new) directory outside the live datastore
 * @returns {ok, checks[]} - one entry per check with PASS/FAIL, the numbers behind it, and the restored database path
 */
export function restoreDrill(snapshotDir, destDir, { env = process.env } = {}) {
  const live = devDataDir(env);
  if (inside(destDir, live)) throw new Error(`REFUSING: ${destDir} is inside the live DEV datastore (${live}); the drill restores elsewhere`);
  if (existsSync(destDir) && readdirSync(destDir).length > 0) throw new Error(`REFUSING: ${destDir} is not empty`);

  const checks = [];
  const check = (name, pass, detail) => { checks.push({ name, status: pass ? 'PASS' : 'FAIL', detail }); return pass; };

  const manifestPath = join(snapshotDir, 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  if (!check('snapshot is valid (manifest + sha256 of the file)', Boolean(manifest) && isValidSnapshot(snapshotDir), manifest ? `sha256 ${manifest.sha256}` : 'no manifest')) return { ok: false, checks, restoredDb: null };

  mkdirSync(destDir, { recursive: true });
  const restoredDb = join(destDir, 'smartlearn-dev.db');
  copyFileSync(join(snapshotDir, 'smartlearn-dev.db'), restoredDb);
  check('restored file is byte-identical to the snapshot', sha256File(restoredDb) === manifest.sha256, `sha256 ${sha256File(restoredDb)}`);

  const db = new Database(restoredDb, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma('integrity_check', { simple: true });
    check('integrity_check', integrity === 'ok', String(integrity));
    const fk = db.pragma('foreign_key_check');
    check('foreign_key_check', fk.length === 0, `${fk.length} violations`);
    const counts = tableCounts(db);
    const wrong = Object.keys(manifest.counts).filter((t) => counts[t] !== manifest.counts[t]);
    check('row counts equal the manifest', wrong.length === 0, wrong.length ? `differ: ${wrong.join(', ')}` : `${Object.keys(counts).length} tables`);
    let version = 0;
    try { version = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v ?? 0; } catch { /* no schema table */ }
    check('schema version equals the manifest', version === manifest.schemaVersion, `v${version}`);
    const history = ['users', 'learning_units', 'review_tasks'].filter((t) => counts[t] !== undefined).map((t) => `${t}=${counts[t]}`).join(' ');
    check('history is readable', Object.keys(counts).length > 0, history || 'no known history tables');
  } finally { db.close(); }
  return { ok: checks.every((c) => c.status === 'PASS'), checks, restoredDb };
}
