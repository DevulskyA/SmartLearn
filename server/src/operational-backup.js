// T50: OPERATIONAL backup = one consistent database snapshot + the immutable
// accepted source files + a manifest with checksums, restorable into a separate
// environment and verifiable without touching the original. Operator tooling
// (server/scripts/backup.mjs); there is deliberately no HTTP surface and no
// deletion API — retention is a recorded operator decision, never automatic.
//
// Credentials/sessions, explicitly: the snapshot keeps password hashes (a restore
// must let people log in) but NEVER live sessions or their CSRF secrets (restoring
// an old backup must not resurrect logins). The sessions purge happens on the COPY,
// with secure_delete + VACUUM so the bytes are not left in free pages; the live
// database is only ever read.
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { BackupError } from './backup.js';
import { openDb } from './db.js';
import { runMigrations } from './migrations.js';

export const OPERATIONAL_MANIFEST_VERSION = 1;
const DB_FILE = 'database.db';
const MANIFEST_FILE = 'manifest.json';
const SOURCES_DIR = 'sources';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const problem = (code, detail) => ({ code, detail });

function tryChmod(path) {
  try { chmodSync(path, 0o600); } catch { /* best effort: Windows has no POSIX modes; the runbook covers ACLs */ }
}

function safeFilename(name) {
  return typeof name === 'string' && name.length > 0 && name === basename(name) && !name.includes('..') && !/[\\/]/.test(name);
}

function userTables(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
}

function countRows(db, table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
}

/**
 * Packages a backup into a NEW directory `destDir` (which must not exist):
 *   database.db   sessions-free consistent snapshot (SQLite backup API)
 *   sources/      every source file the snapshot references, verified against its recorded sha256
 *   manifest.json checksums, table counts, credentials and retention statements
 * Fails closed: a missing/corrupt source file aborts the whole backup and leaves
 * no partial directory. Never overwrites an existing backup.
 */
export async function createOperationalBackup(db, { sourcesDir, destDir, now = () => new Date(), retainDays = null } = {}) {
  if (retainDays !== null && (!Number.isInteger(retainDays) || retainDays <= 0)) {
    throw new BackupError('VALIDATION_FAILED', 'retainDays deve ser um inteiro positivo (ou omitido).');
  }
  if (existsSync(destDir)) throw new BackupError('BACKUP_DEST_EXISTS', `O destino já existe e nunca é sobrescrito: ${destDir}`);

  mkdirSync(dirname(destDir), { recursive: true });
  const tmp = `${destDir}.partial-${process.pid}-${Date.now()}`;
  mkdirSync(join(tmp, SOURCES_DIR), { recursive: true });
  try {
    const dbCopy = join(tmp, DB_FILE);
    await db.backup(dbCopy);

    const copy = new Database(dbCopy);
    let sources;
    let tableCounts;
    let schemaVersion;
    let integrityCheck;
    try {
      copy.pragma('secure_delete = ON');
      copy.prepare('DELETE FROM sessions').run();
      copy.exec('VACUUM');
      copy.pragma('journal_mode = DELETE'); // one self-contained file, no -wal/-shm sidecars
      integrityCheck = copy.pragma('integrity_check', { simple: true });
      if (integrityCheck !== 'ok') throw new BackupError('INTEGRITY_CHECK_FAILED', `Snapshot corrompido: ${integrityCheck}`);
      tableCounts = Object.fromEntries(userTables(copy).map((t) => [t, countRows(copy, t)]));
      schemaVersion = copy.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v;
      sources = copy.prepare('SELECT id, user_id, filename, original_name, byte_size, checksum FROM sources ORDER BY id').all();
    } finally {
      copy.close();
    }

    const manifestSources = [];
    for (const row of sources) {
      if (!safeFilename(row.filename)) throw new BackupError('SOURCE_CORRUPT', `Fonte ${row.id}: nome de arquivo inválido no banco.`);
      const livePath = join(sourcesDir, row.filename);
      if (!existsSync(livePath)) throw new BackupError('SOURCE_MISSING', `Fonte ${row.id} (${row.filename}) não existe no disco.`);
      const bytes = readFileSync(livePath);
      if (bytes.length !== row.byte_size || sha256(bytes) !== row.checksum) {
        throw new BackupError('SOURCE_CORRUPT', `Fonte ${row.id} (${row.filename}) não confere com o checksum registrado.`);
      }
      const target = join(tmp, SOURCES_DIR, row.filename);
      writeFileSync(target, bytes);
      tryChmod(target);
      manifestSources.push({ id: row.id, userId: row.user_id, filename: row.filename, originalName: row.original_name, byteSize: row.byte_size, sha256: row.checksum });
    }

    const known = new Set(sources.map((s) => s.filename));
    const orphanSourceFiles = existsSync(sourcesDir) ? readdirSync(sourcesDir).filter((f) => !known.has(f)).sort() : [];

    const dbBytes = readFileSync(dbCopy);
    tryChmod(dbCopy);
    const manifest = {
      manifestVersion: OPERATIONAL_MANIFEST_VERSION,
      createdAt: now().toISOString(),
      schemaVersion,
      database: { file: DB_FILE, bytes: dbBytes.length, sha256: sha256(dbBytes), integrityCheck, tableCounts },
      sources: manifestSources,
      orphanSourceFiles,
      credentials: {
        containsPasswordHashes: true,
        sessionsIncluded: false,
        note: 'Password hashes are included so a restore can authenticate; live sessions and CSRF secrets are not. Treat this directory as a secret.',
      },
      retention: { policy: 'OPERATOR_MANAGED', retainDays, automaticDeletion: false },
    };
    const manifestPath = join(tmp, MANIFEST_FILE);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    tryChmod(manifestPath);

    renameSync(tmp, destDir);
    return manifest;
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true }); // only this run's own partial directory
    if (err instanceof BackupError) throw err;
    throw new BackupError('BACKUP_FAILED', `Falha ao gerar o backup operacional: ${err.message}`);
  }
}

/**
 * Non-destructive check of a package. Returns the list of problems (empty = intact):
 * MANIFEST_MISSING|MANIFEST_INVALID|DATABASE_MISSING|DATABASE_CORRUPT|DATABASE_CONTENT_MISMATCH|
 * SESSIONS_PRESENT|MANIFEST_DB_MISMATCH|SOURCE_MISSING|SOURCE_CORRUPT|SOURCE_UNLISTED.
 */
export function verifyOperationalBackup(backupDir) {
  const problems = [];
  const manifestPath = join(backupDir, MANIFEST_FILE);
  if (!existsSync(manifestPath)) return [problem('MANIFEST_MISSING', manifestPath)];
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return [problem('MANIFEST_INVALID', 'manifest.json não é JSON válido')];
  }
  if (manifest?.manifestVersion !== OPERATIONAL_MANIFEST_VERSION || !manifest.database || !Array.isArray(manifest.sources)) {
    return [problem('MANIFEST_INVALID', 'estrutura ou versão do manifest inesperada')];
  }

  const dbPath = join(backupDir, manifest.database.file ?? DB_FILE);
  let dbRows = null;
  if (!existsSync(dbPath)) {
    problems.push(problem('DATABASE_MISSING', dbPath));
  } else {
    const bytes = readFileSync(dbPath);
    if (bytes.length !== manifest.database.bytes || sha256(bytes) !== manifest.database.sha256) {
      problems.push(problem('DATABASE_CORRUPT', 'tamanho/sha256 do banco não confere com o manifest'));
    } else {
      let db;
      try {
        db = new Database(dbPath, { readonly: true, fileMustExist: true });
        const integrity = db.pragma('integrity_check', { simple: true });
        if (integrity !== 'ok') problems.push(problem('DATABASE_CORRUPT', integrity));
        for (const [table, expected] of Object.entries(manifest.database.tableCounts ?? {})) {
          const actual = countRows(db, table);
          if (actual !== expected) problems.push(problem('DATABASE_CONTENT_MISMATCH', `${table}: manifest ${expected}, banco ${actual}`));
        }
        if (countRows(db, 'sessions') > 0) problems.push(problem('SESSIONS_PRESENT', 'o pacote não pode conter sessões'));
        dbRows = db.prepare('SELECT id, filename, checksum FROM sources ORDER BY id').all();
      } catch (err) {
        problems.push(problem('DATABASE_CORRUPT', err.message));
      } finally {
        db?.close();
      }
    }
  }

  if (dbRows) {
    const listed = manifest.sources.map((s) => `${s.id}:${s.filename}:${s.sha256}`).sort().join('|');
    const inDb = dbRows.map((s) => `${s.id}:${s.filename}:${s.checksum}`).sort().join('|');
    if (listed !== inDb) problems.push(problem('MANIFEST_DB_MISMATCH', 'as fontes do manifest não coincidem com as do banco'));
  }

  const sourcesPath = join(backupDir, SOURCES_DIR);
  const listedFiles = new Set();
  for (const s of manifest.sources) {
    if (!safeFilename(s.filename)) { problems.push(problem('SOURCE_CORRUPT', `nome inválido: ${s.filename}`)); continue; }
    listedFiles.add(s.filename);
    const p = join(sourcesPath, s.filename);
    if (!existsSync(p)) { problems.push(problem('SOURCE_MISSING', s.filename)); continue; }
    const bytes = readFileSync(p);
    if (bytes.length !== s.byteSize || sha256(bytes) !== s.sha256) problems.push(problem('SOURCE_CORRUPT', s.filename));
  }
  if (existsSync(sourcesPath)) {
    for (const f of readdirSync(sourcesPath)) if (!listedFiles.has(f)) problems.push(problem('SOURCE_UNLISTED', f));
  }
  return problems;
}

/**
 * Restores a VERIFIED package into `targetDir` (must not exist or be empty):
 *   <target>/smartlearn.db and <target>/sources/*
 * Refuses (RESTORE_REFUSED) on any verification problem; never touches the package
 * or any existing environment; on a copy failure it removes only what it just wrote.
 */
export async function restoreOperationalBackup(backupDir, targetDir) {
  const problems = verifyOperationalBackup(backupDir);
  if (problems.length > 0) {
    const err = new BackupError('RESTORE_REFUSED', `O pacote não passou na verificação: ${problems.map((p) => p.code).join(', ')}`);
    err.problems = problems;
    throw err;
  }
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    throw new BackupError('RESTORE_TARGET_NOT_EMPTY', `O destino da restauração não está vazio: ${targetDir}`);
  }
  const manifest = JSON.parse(readFileSync(join(backupDir, MANIFEST_FILE), 'utf8'));
  const created = [];
  try {
    mkdirSync(join(targetDir, SOURCES_DIR), { recursive: true });
    const dbPath = join(targetDir, 'smartlearn.db');
    writeFileSync(dbPath, readFileSync(join(backupDir, manifest.database.file)));
    created.push(dbPath);
    for (const s of manifest.sources) {
      const p = join(targetDir, SOURCES_DIR, s.filename);
      writeFileSync(p, readFileSync(join(backupDir, SOURCES_DIR, s.filename)));
      created.push(p);
    }
    if (sha256(readFileSync(dbPath)) !== manifest.database.sha256) throw new BackupError('RESTORE_COPY_MISMATCH', 'Cópia do banco restaurada não confere.');
    for (const s of manifest.sources) {
      if (sha256(readFileSync(join(targetDir, SOURCES_DIR, s.filename))) !== s.sha256) throw new BackupError('RESTORE_COPY_MISMATCH', `Cópia da fonte ${s.filename} não confere.`);
    }
    return { dbPath, sourcesDir: join(targetDir, SOURCES_DIR), manifest };
  } catch (err) {
    for (const p of created) rmSync(p, { force: true });
    if (err instanceof BackupError) throw err;
    throw new BackupError('RESTORE_FAILED', `Falha ao restaurar: ${err.message}`);
  }
}

/**
 * The rehearsal: restore into a fresh directory under the OS temp dir, open it with
 * this codebase's own migrations (schema compatibility), and prove units, questions,
 * sources and citations resolve. Everything it writes is temporary and reported
 * (`tempDir`); the package and the original environment are never modified.
 */
export async function rehearseRestore(backupDir, { keep = false } = {}) {
  const tempDir = mkdtempSync(join(tmpdir(), 'sl-rehearsal-'));
  const problems = [];
  const report = { ok: false, problems, counts: {}, citationsChecked: 0, sourcesChecked: 0, tempDir, tempEnvironmentRemoved: false };
  let db;
  try {
    const restored = await restoreOperationalBackup(backupDir, join(tempDir, 'env'));
    db = openDb(restored.dbPath);
    try {
      runMigrations(db);
    } catch (err) {
      problems.push(problem('MIGRATION_INCOMPATIBLE', err.message));
    }
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') problems.push(problem('DATABASE_CORRUPT', integrity));

    for (const table of ['learning_units', 'exercises', 'exercise_versions', 'learning_evidence', 'sources', 'exercise_source_citations']) {
      report.counts[table] = countRows(db, table);
    }
    const noVersion = db.prepare(`
      SELECT COUNT(*) AS n FROM exercises e
      WHERE NOT EXISTS (SELECT 1 FROM exercise_versions v WHERE v.user_id = e.user_id AND v.exercise_id = e.id)
    `).get().n;
    if (noVersion > 0) problems.push(problem('EXERCISE_WITHOUT_VERSION', `${noVersion} exercício(s) sem versão`));

    const sourceById = new Map();
    for (const s of db.prepare('SELECT id, user_id, filename, checksum, byte_size FROM sources').all()) {
      sourceById.set(`${s.user_id}:${s.id}`, s);
      report.sourcesChecked += 1;
      const p = join(restored.sourcesDir, s.filename);
      if (!existsSync(p)) { problems.push(problem('SOURCE_MISSING', s.filename)); continue; }
      const bytes = readFileSync(p);
      if (statSync(p).size !== s.byte_size || sha256(bytes) !== s.checksum) problems.push(problem('SOURCE_CORRUPT', s.filename));
    }

    const pageExists = db.prepare('SELECT 1 FROM source_pages WHERE user_id = ? AND source_id = ? AND page_index = ?');
    for (const c of db.prepare('SELECT id, user_id, source_id, page_index FROM exercise_source_citations').all()) {
      report.citationsChecked += 1;
      if (!sourceById.has(`${c.user_id}:${c.source_id}`)) problems.push(problem('CITATION_SOURCE_MISSING', `citação ${c.id}`));
      else if (!pageExists.get(c.user_id, c.source_id, c.page_index)) problems.push(problem('CITATION_PAGE_MISSING', `citação ${c.id}: fonte ${c.source_id} página ${c.page_index}`));
    }
  } catch (err) {
    if (err.problems) problems.push(...err.problems);
    else problems.push(problem(err.code ?? 'REHEARSAL_FAILED', err.message));
  } finally {
    db?.close();
    if (!keep) {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); // this run's own mkdtemp directory
      report.tempEnvironmentRemoved = !existsSync(tempDir);
    }
  }
  report.ok = problems.length === 0;
  return report;
}
