import { join } from 'node:path';
import Database from 'better-sqlite3';
import { renameSync, rmSync, existsSync } from 'node:fs';
import { get as getSettings } from './services/settings.js';

// PR-1 foundation (T5, aa62c67): simple timestamped physical snapshot into
// a directory. Predates T19's atomic destPath + verification API below;
// kept as-is (server/test/persistence.test.js still exercises it) rather
// than merged, since the two serve different callers with different
// signatures — this one auto-names the file, T19's createPhysicalBackup
// takes an exact destination and verifies content, not just that a file
// was produced.
export async function backup(db, backupDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(backupDir, `backup-${timestamp}.db`);
  await db.backup(backupPath);
  return backupPath;
}

export class BackupError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const LOGICAL_EXPORT_VERSION = 1;

/**
 * A versioned snapshot of everything one user owns. Deliberately excludes
 * users.password_* (credentials), sessions (never portable, never another
 * user's concern), and every row belonging to a different user_id — every
 * query here is scoped by user_id, there is no "export everything" path.
 */
export function createLogicalExport(db, userId) {
  const user = db.prepare('SELECT id, email_display, created_at FROM users WHERE id = ?').get(userId);
  if (!user) throw new BackupError('NOT_FOUND', 'Usuário não encontrado.');

  const { version: schemaVersion } = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get();

  return {
    exportVersion: LOGICAL_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    schemaVersion,
    user: { id: user.id, email: user.email_display, createdAt: user.created_at },
    settings: getSettings(db, userId),
    subjects: db.prepare('SELECT * FROM subjects WHERE user_id = ? ORDER BY id').all(userId),
    learningUnits: db.prepare('SELECT * FROM learning_units WHERE user_id = ? ORDER BY id').all(userId),
    reviewTasks: db.prepare('SELECT * FROM review_tasks WHERE user_id = ? ORDER BY id').all(userId),
    exercises: db.prepare('SELECT * FROM exercises WHERE user_id = ? ORDER BY id').all(userId),
    exerciseVersions: db.prepare('SELECT * FROM exercise_versions WHERE user_id = ? ORDER BY id').all(userId),
    learningEvidence: db.prepare('SELECT * FROM learning_evidence WHERE user_id = ? ORDER BY id').all(userId),
  };
}

const BACKUP_TABLES = ['users', 'sessions', 'subjects', 'learning_units', 'review_tasks', 'exercises', 'exercise_versions', 'learning_evidence', 'user_settings', 'schema_migrations'];

/**
 * Writes a consistent whole-database physical snapshot via better-sqlite3's
 * own backup API (safe under concurrent WAL writers, unlike copying the
 * file bytes directly). Writes to a temporary path first and renames only
 * on success, so a failed backup never leaves a half-written file at
 * `destPath` and never touches the source database at all (the backup API
 * only reads from it).
 */
export async function createPhysicalBackup(db, destPath) {
  const tmpPath = `${destPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await db.backup(tmpPath);
    renameSync(tmpPath, destPath);
  } catch (err) {
    if (existsSync(tmpPath)) rmSync(tmpPath, { force: true });
    throw new BackupError('BACKUP_FAILED', `Falha ao gerar backup físico: ${err.message}`);
  }
  return { path: destPath, tables: BACKUP_TABLES };
}

/**
 * Opens the backup file in its own separate connection (never reuses the
 * live handle) and checks it is structurally sound AND matches the source's
 * row counts per table — an integrity_check alone would not catch a
 * backup that silently completed early with a subset of rows.
 */
export function verifyPhysicalBackup(sourceDb, backupPath) {
  const backupDb = new Database(backupPath, { readonly: true });
  try {
    const integrityCheck = backupDb.pragma('integrity_check', { simple: true });
    if (integrityCheck !== 'ok') {
      throw new BackupError('INTEGRITY_CHECK_FAILED', `Backup físico corrompido: ${integrityCheck}`);
    }

    const tableCounts = {};
    for (const table of BACKUP_TABLES) {
      const { n: sourceCount } = sourceDb.prepare(`SELECT COUNT(*) as n FROM ${table}`).get();
      const { n: backupCount } = backupDb.prepare(`SELECT COUNT(*) as n FROM ${table}`).get();
      tableCounts[table] = { sourceCount, backupCount, match: sourceCount === backupCount };
      if (sourceCount !== backupCount) {
        throw new BackupError('CONTENT_MISMATCH', `Backup físico diverge da origem na tabela ${table}: ${sourceCount} vs ${backupCount}.`);
      }
    }

    return { integrityCheck, tableCounts };
  } finally {
    backupDb.close();
  }
}
