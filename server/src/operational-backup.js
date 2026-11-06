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
import { listFigureRefs } from '../../shared/summary-figure-refs.js';

export const OPERATIONAL_MANIFEST_VERSION = 1;
const DB_FILE = 'database.db';
const MANIFEST_FILE = 'manifest.json';
const SOURCES_DIR = 'sources';
const MEDIA_DIR = 'media';

/** Where the private images live by default: beside the sources directory (same rule as the server's own default). */
export const defaultMediaDir = (sourcesDir) => join(dirname(sourcesDir), 'media');
const hasTable = (db, name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));

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
export async function createOperationalBackup(db, { sourcesDir, mediaDir = defaultMediaDir(sourcesDir), destDir, now = () => new Date(), retainDays = null } = {}) {
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
    let mediaRows;
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
      mediaRows = hasTable(copy, 'visual_assets')
        ? copy.prepare('SELECT id, user_id, kind, filename, mime, byte_size, sha256, source_id FROM visual_assets ORDER BY id').all()
        : [];
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

    // The private images of the summaries: every file the snapshot references, checked against its recorded hash, or the whole backup fails.
    const manifestMedia = [];
    if (mediaRows.length > 0) mkdirSync(join(tmp, MEDIA_DIR), { recursive: true });
    for (const row of mediaRows) {
      if (!safeFilename(row.filename)) throw new BackupError('MEDIA_CORRUPT', `Figura ${row.id}: nome de arquivo inválido no banco.`);
      const livePath = join(mediaDir, row.filename);
      if (!existsSync(livePath)) throw new BackupError('MEDIA_MISSING', `Figura ${row.id} (${row.filename}) não existe no disco.`);
      const bytes = readFileSync(livePath);
      if (bytes.length !== row.byte_size || sha256(bytes) !== row.sha256) {
        throw new BackupError('MEDIA_CORRUPT', `Figura ${row.id} (${row.filename}) não confere com o hash registrado.`);
      }
      const target = join(tmp, MEDIA_DIR, row.filename);
      writeFileSync(target, bytes);
      tryChmod(target);
      manifestMedia.push({ id: row.id, userId: row.user_id, kind: row.kind, filename: row.filename, mime: row.mime, byteSize: row.byte_size, sha256: row.sha256, sourceId: row.source_id });
    }
    const knownMedia = new Set(mediaRows.map((m) => m.filename));
    const orphanMediaFiles = existsSync(mediaDir) ? readdirSync(mediaDir).filter((f) => !knownMedia.has(f)).sort() : [];

    const dbBytes = readFileSync(dbCopy);
    tryChmod(dbCopy);
    const manifest = {
      manifestVersion: OPERATIONAL_MANIFEST_VERSION,
      createdAt: now().toISOString(),
      schemaVersion,
      database: { file: DB_FILE, bytes: dbBytes.length, sha256: sha256(dbBytes), integrityCheck, tableCounts },
      sources: manifestSources,
      media: manifestMedia,
      orphanSourceFiles,
      orphanMediaFiles,
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
  let mediaDbRows = null;
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
        mediaDbRows = hasTable(db, 'visual_assets') ? db.prepare('SELECT id, user_id, filename, sha256 FROM visual_assets ORDER BY id').all() : [];
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

  // Private images (absent in packages made before migration 038: then the list is empty and nothing changes).
  const media = Array.isArray(manifest.media) ? manifest.media : [];
  if (mediaDbRows) {
    // the manifest must list exactly the assets of the database, with the same owner, file and hash: a file is never trusted on its own
    const listed = media.map((m) => `${m.id}:${m.userId}:${m.filename}:${m.sha256}`).sort().join('|');
    const inDb = mediaDbRows.map((m) => `${m.id}:${m.user_id}:${m.filename}:${m.sha256}`).sort().join('|');
    if (listed !== inDb) problems.push(problem('MEDIA_DB_MISMATCH', 'as figuras do manifest não coincidem com as do banco (id, dono, arquivo ou hash)'));
  }
  const mediaPath = join(backupDir, MEDIA_DIR);
  const listedMedia = new Set();
  for (const m of media) {
    if (!safeFilename(m.filename)) { problems.push(problem('MEDIA_CORRUPT', `nome inválido: ${m.filename}`)); continue; }
    listedMedia.add(m.filename);
    const p = join(mediaPath, m.filename);
    if (!existsSync(p)) { problems.push(problem('MEDIA_MISSING', m.filename)); continue; }
    const bytes = readFileSync(p);
    if (bytes.length !== m.byteSize || sha256(bytes) !== m.sha256) problems.push(problem('MEDIA_CORRUPT', m.filename));
  }
  if (existsSync(mediaPath)) {
    for (const f of readdirSync(mediaPath)) if (!listedMedia.has(f)) problems.push(problem('MEDIA_UNLISTED', f));
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
    const media = Array.isArray(manifest.media) ? manifest.media : [];
    if (media.length > 0) mkdirSync(join(targetDir, MEDIA_DIR), { recursive: true });
    for (const m of media) {
      const p = join(targetDir, MEDIA_DIR, m.filename);
      writeFileSync(p, readFileSync(join(backupDir, MEDIA_DIR, m.filename)));
      created.push(p);
    }
    if (sha256(readFileSync(dbPath)) !== manifest.database.sha256) throw new BackupError('RESTORE_COPY_MISMATCH', 'Cópia do banco restaurada não confere.');
    for (const s of manifest.sources) {
      if (sha256(readFileSync(join(targetDir, SOURCES_DIR, s.filename))) !== s.sha256) throw new BackupError('RESTORE_COPY_MISMATCH', `Cópia da fonte ${s.filename} não confere.`);
    }
    for (const m of media) {
      if (sha256(readFileSync(join(targetDir, MEDIA_DIR, m.filename))) !== m.sha256) throw new BackupError('RESTORE_COPY_MISMATCH', `Cópia da figura ${m.filename} não confere.`);
    }
    return { dbPath, sourcesDir: join(targetDir, SOURCES_DIR), mediaDir: join(targetDir, MEDIA_DIR), manifest };
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

    // Private images: every record has its file with the right hash, and every [[fig:UUID]] in a lesson or an open draft resolves to a
    // figure of the SAME owner (a crop also to its source). A summary pointing at nothing is reported, never silently accepted.
    report.mediaChecked = 0;
    report.figureRefsChecked = 0;
    if (hasTable(db, 'visual_assets')) {
      const assetById = new Map();
      for (const a of db.prepare('SELECT id, user_id, filename, sha256, byte_size, kind, source_id FROM visual_assets').all()) {
        assetById.set(`${a.user_id}:${a.id}`, a);
        report.mediaChecked += 1;
        const p = join(restored.mediaDir, a.filename);
        if (!existsSync(p)) { problems.push(problem('MEDIA_MISSING', a.filename)); continue; }
        const bytes = readFileSync(p);
        if (statSync(p).size !== a.byte_size || sha256(bytes) !== a.sha256) problems.push(problem('MEDIA_CORRUPT', a.filename));
        if (a.kind === 'PDF_CROP' && !sourceById.has(`${a.user_id}:${a.source_id}`)) problems.push(problem('MEDIA_SOURCE_MISSING', `figura ${a.id}`));
      }
      const checkRefs = (userId, text, where) => {
        for (const id of listFigureRefs(text)) {
          report.figureRefsChecked += 1;
          if (!assetById.has(`${userId}:${id}`)) problems.push(problem('FIGURE_REF_UNRESOLVED', `${where}: [[fig:${id.slice(0, 8)}…]]`));
        }
      };
      for (const u of db.prepare('SELECT id, user_id, summary_body FROM learning_units WHERE summary_body IS NOT NULL').all()) checkRefs(u.user_id, u.summary_body, `aula ${u.id}`);
      for (const d of db.prepare("SELECT id, user_id, draft_json FROM generated_drafts WHERE status = 'DRAFT'").all()) {
        try { checkRefs(d.user_id, JSON.parse(d.draft_json).summary, `rascunho ${d.id}`); } catch { /* an unreadable draft is not this check's finding */ }
      }
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
