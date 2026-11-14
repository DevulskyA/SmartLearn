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

function inspectSnapshot(dbCopy) {
  const copy = new Database(dbCopy);
  try {
    copy.pragma('secure_delete = ON');
    copy.prepare('DELETE FROM sessions').run();
    copy.exec('VACUUM');
    copy.pragma('journal_mode = DELETE');
    const integrityCheck = copy.pragma('integrity_check', { simple: true });
    if (integrityCheck !== 'ok') throw new BackupError('INTEGRITY_CHECK_FAILED', `Snapshot corrompido: ${integrityCheck}`);
    const tableCounts = Object.fromEntries(userTables(copy).map((table) => [table, countRows(copy, table)]));
    const schemaVersion = copy.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v;
    const sources = copy.prepare('SELECT id, user_id, filename, original_name, byte_size, checksum FROM sources ORDER BY id').all();
    const mediaRows = hasTable(copy, 'visual_assets')
      ? copy.prepare('SELECT id, user_id, kind, filename, mime, byte_size, sha256, source_id FROM visual_assets ORDER BY id').all()
      : [];
    return { integrityCheck, tableCounts, schemaVersion, sources, mediaRows };
  } finally {
    copy.close();
  }
}

function copySourceFiles(sources, sourcesDir, tmp) {
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
  const known = new Set(sources.map((source) => source.filename));
  const orphanSourceFiles = existsSync(sourcesDir) ? readdirSync(sourcesDir).filter((file) => !known.has(file)).sort() : [];
  return { manifestSources, orphanSourceFiles };
}

function copyMediaFiles(mediaRows, mediaDir, tmp) {
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
  const knownMedia = new Set(mediaRows.map((media) => media.filename));
  const orphanMediaFiles = existsSync(mediaDir) ? readdirSync(mediaDir).filter((file) => !knownMedia.has(file)).sort() : [];
  return { manifestMedia, orphanMediaFiles };
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
    const { integrityCheck, tableCounts, schemaVersion, sources, mediaRows } = inspectSnapshot(dbCopy);
    const { manifestSources, orphanSourceFiles } = copySourceFiles(sources, sourcesDir, tmp);
    const { manifestMedia, orphanMediaFiles } = copyMediaFiles(mediaRows, mediaDir, tmp);

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

function readOperationalManifest(backupDir) {
  const manifestPath = join(backupDir, MANIFEST_FILE);
  if (!existsSync(manifestPath)) return { problems: [problem('MANIFEST_MISSING', manifestPath)] };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return { problems: [problem('MANIFEST_INVALID', 'manifest.json não é JSON válido')] };
  }
  if (manifest?.manifestVersion !== OPERATIONAL_MANIFEST_VERSION || !manifest.database || !Array.isArray(manifest.sources)) {
    return { problems: [problem('MANIFEST_INVALID', 'estrutura ou versão do manifest inesperada')] };
  }
  return { manifest };
}

function inspectBackupDatabase(backupDir, manifest, problems) {
  const dbPath = join(backupDir, manifest.database.file ?? DB_FILE);
  let dbRows = null;
  let mediaDbRows = null;
  if (!existsSync(dbPath)) {
    problems.push(problem('DATABASE_MISSING', dbPath));
    return { dbRows, mediaDbRows };
  }
  const bytes = readFileSync(dbPath);
  if (bytes.length !== manifest.database.bytes || sha256(bytes) !== manifest.database.sha256) {
    problems.push(problem('DATABASE_CORRUPT', 'tamanho/sha256 do banco não confere com o manifest'));
    return { dbRows, mediaDbRows };
  }

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
  return { dbRows, mediaDbRows };
}

function compareManifestSources(manifest, dbRows, problems) {
  if (!dbRows) return;
  const listed = manifest.sources.map((source) => `${source.id}:${source.filename}:${source.sha256}`).sort().join('|');
  const inDb = dbRows.map((source) => `${source.id}:${source.filename}:${source.checksum}`).sort().join('|');
  if (listed !== inDb) problems.push(problem('MANIFEST_DB_MISMATCH', 'as fontes do manifest não coincidem com as do banco'));
}

function compareManifestMedia(manifestMedia, mediaDbRows, problems) {
  if (!mediaDbRows) return;
  const listed = manifestMedia.map((media) => `${media.id}:${media.userId}:${media.filename}:${media.sha256}`).sort().join('|');
  const inDb = mediaDbRows.map((media) => `${media.id}:${media.user_id}:${media.filename}:${media.sha256}`).sort().join('|');
  if (listed !== inDb) problems.push(problem('MEDIA_DB_MISMATCH', 'as figuras do manifest não coincidem com as do banco (id, dono, arquivo ou hash)'));
}

function verifyListedFiles(backupDir, directory, entries, codes) {
  const problems = [];
  const listedFiles = new Set();
  const filesPath = join(backupDir, directory);
  for (const entry of entries) {
    if (!safeFilename(entry.filename)) { problems.push(problem(codes.corrupt, `nome inválido: ${entry.filename}`)); continue; }
    listedFiles.add(entry.filename);
    const path = join(filesPath, entry.filename);
    if (!existsSync(path)) { problems.push(problem(codes.missing, entry.filename)); continue; }
    const bytes = readFileSync(path);
    if (bytes.length !== entry.byteSize || sha256(bytes) !== entry.sha256) problems.push(problem(codes.corrupt, entry.filename));
  }
  if (existsSync(filesPath)) {
    for (const file of readdirSync(filesPath)) if (!listedFiles.has(file)) problems.push(problem(codes.unlisted, file));
  }
  return problems;
}

/**
 * Non-destructive check of a package. Returns the list of problems (empty = intact):
 * MANIFEST_MISSING|MANIFEST_INVALID|DATABASE_MISSING|DATABASE_CORRUPT|DATABASE_CONTENT_MISMATCH|
 * SESSIONS_PRESENT|MANIFEST_DB_MISMATCH|SOURCE_MISSING|SOURCE_CORRUPT|SOURCE_UNLISTED.
 */
export function verifyOperationalBackup(backupDir) {
  const problems = [];
  const { manifest, problems: manifestProblems } = readOperationalManifest(backupDir);
  if (!manifest) return manifestProblems;
  const { dbRows, mediaDbRows } = inspectBackupDatabase(backupDir, manifest, problems);
  compareManifestSources(manifest, dbRows, problems);
  problems.push(...verifyListedFiles(backupDir, SOURCES_DIR, manifest.sources, {
    corrupt: 'SOURCE_CORRUPT', missing: 'SOURCE_MISSING', unlisted: 'SOURCE_UNLISTED',
  }));
  // Private images (absent in packages made before migration 038: then the list is empty and nothing changes).
  const media = Array.isArray(manifest.media) ? manifest.media : [];
  compareManifestMedia(media, mediaDbRows, problems);
  problems.push(...verifyListedFiles(backupDir, MEDIA_DIR, media, {
    corrupt: 'MEDIA_CORRUPT', missing: 'MEDIA_MISSING', unlisted: 'MEDIA_UNLISTED',
  }));
  return problems;
}

function copyAndVerifyRestore(backupDir, targetDir, manifest, created) {
  mkdirSync(join(targetDir, SOURCES_DIR), { recursive: true });
  const dbPath = join(targetDir, 'smartlearn.db');
  writeFileSync(dbPath, readFileSync(join(backupDir, manifest.database.file)));
  created.push(dbPath);
  for (const source of manifest.sources) {
    const path = join(targetDir, SOURCES_DIR, source.filename);
    writeFileSync(path, readFileSync(join(backupDir, SOURCES_DIR, source.filename)));
    created.push(path);
  }
  const media = Array.isArray(manifest.media) ? manifest.media : [];
  if (media.length > 0) mkdirSync(join(targetDir, MEDIA_DIR), { recursive: true });
  for (const asset of media) {
    const path = join(targetDir, MEDIA_DIR, asset.filename);
    writeFileSync(path, readFileSync(join(backupDir, MEDIA_DIR, asset.filename)));
    created.push(path);
  }
  if (sha256(readFileSync(dbPath)) !== manifest.database.sha256) throw new BackupError('RESTORE_COPY_MISMATCH', 'Cópia do banco restaurada não confere.');
  for (const source of manifest.sources) {
    if (sha256(readFileSync(join(targetDir, SOURCES_DIR, source.filename))) !== source.sha256) {
      throw new BackupError('RESTORE_COPY_MISMATCH', `Cópia da fonte ${source.filename} não confere.`);
    }
  }
  for (const asset of media) {
    if (sha256(readFileSync(join(targetDir, MEDIA_DIR, asset.filename))) !== asset.sha256) {
      throw new BackupError('RESTORE_COPY_MISMATCH', `Cópia da figura ${asset.filename} não confere.`);
    }
  }
  return { dbPath, sourcesDir: join(targetDir, SOURCES_DIR), mediaDir: join(targetDir, MEDIA_DIR), manifest };
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
    return copyAndVerifyRestore(backupDir, targetDir, manifest, created);
  } catch (err) {
    for (const p of created) rmSync(p, { force: true });
    if (err instanceof BackupError) throw err;
    throw new BackupError('RESTORE_FAILED', `Falha ao restaurar: ${err.message}`);
  }
}

function inspectRehearsalDatabase(db, problems, report) {
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
}

function inspectRehearsalSources(db, restored, problems, report) {
  const sourceById = new Map();
  for (const source of db.prepare('SELECT id, user_id, filename, checksum, byte_size FROM sources').all()) {
    sourceById.set(`${source.user_id}:${source.id}`, source);
    report.sourcesChecked += 1;
    const path = join(restored.sourcesDir, source.filename);
    if (!existsSync(path)) { problems.push(problem('SOURCE_MISSING', source.filename)); continue; }
    const bytes = readFileSync(path);
    if (statSync(path).size !== source.byte_size || sha256(bytes) !== source.checksum) problems.push(problem('SOURCE_CORRUPT', source.filename));
  }
  return sourceById;
}

function checkRehearsalFigureRefs(userId, text, where, assetById, report, problems) {
  for (const id of listFigureRefs(text)) {
    report.figureRefsChecked += 1;
    if (!assetById.has(`${userId}:${id}`)) problems.push(problem('FIGURE_REF_UNRESOLVED', `${where}: [[fig:${id.slice(0, 8)}…]]`));
  }
}

function inspectRehearsalMedia(db, restored, sourceById, problems, report) {
  report.mediaChecked = 0;
  report.figureRefsChecked = 0;
  if (!hasTable(db, 'visual_assets')) return;

  const assetById = new Map();
  for (const asset of db.prepare('SELECT id, user_id, filename, sha256, byte_size, kind, source_id FROM visual_assets').all()) {
    assetById.set(`${asset.user_id}:${asset.id}`, asset);
    report.mediaChecked += 1;
    const path = join(restored.mediaDir, asset.filename);
    if (!existsSync(path)) { problems.push(problem('MEDIA_MISSING', asset.filename)); continue; }
    const bytes = readFileSync(path);
    if (statSync(path).size !== asset.byte_size || sha256(bytes) !== asset.sha256) problems.push(problem('MEDIA_CORRUPT', asset.filename));
    if (asset.kind === 'PDF_CROP' && !sourceById.has(`${asset.user_id}:${asset.source_id}`)) problems.push(problem('MEDIA_SOURCE_MISSING', `figura ${asset.id}`));
  }
  for (const unit of db.prepare('SELECT id, user_id, summary_body FROM learning_units WHERE summary_body IS NOT NULL').all()) {
    checkRehearsalFigureRefs(unit.user_id, unit.summary_body, `aula ${unit.id}`, assetById, report, problems);
  }
  for (const draft of db.prepare("SELECT id, user_id, draft_json FROM generated_drafts WHERE status = 'DRAFT'").all()) {
    try { checkRehearsalFigureRefs(draft.user_id, JSON.parse(draft.draft_json).summary, `rascunho ${draft.id}`, assetById, report, problems); } catch { /* unreadable drafts are outside this reference check */ }
  }
}

function inspectRehearsalCitations(db, sourceById, problems, report) {
  const pageExists = db.prepare('SELECT 1 FROM source_pages WHERE user_id = ? AND source_id = ? AND page_index = ?');
  for (const citation of db.prepare('SELECT id, user_id, source_id, page_index FROM exercise_source_citations').all()) {
    report.citationsChecked += 1;
    if (!sourceById.has(`${citation.user_id}:${citation.source_id}`)) problems.push(problem('CITATION_SOURCE_MISSING', `citação ${citation.id}`));
    else if (!pageExists.get(citation.user_id, citation.source_id, citation.page_index)) {
      problems.push(problem('CITATION_PAGE_MISSING', `citação ${citation.id}: fonte ${citation.source_id} página ${citation.page_index}`));
    }
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
    inspectRehearsalDatabase(db, problems, report);
    const sourceById = inspectRehearsalSources(db, restored, problems, report);
    inspectRehearsalMedia(db, restored, sourceById, problems, report);
    inspectRehearsalCitations(db, sourceById, problems, report);
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
