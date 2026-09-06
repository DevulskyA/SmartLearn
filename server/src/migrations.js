import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function parseMigrationFile(filename) {
  const m = filename.match(/^(\d+)-(.+)\.sql$/);
  if (!m) return null;
  return { version: parseInt(m[1], 10), name: m[2] };
}

function listMigrations(migrationsDir) {
  return readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => {
      const meta = parseMigrationFile(f);
      if (!meta) return null;
      const content = readFileSync(join(migrationsDir, f), 'utf8');
      return { file: f, ...meta, content, checksum: sha256(content) };
    })
    .filter(Boolean);
}

function ensureSchemaTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER NOT NULL PRIMARY KEY,
      name       TEXT    NOT NULL,
      checksum   TEXT    NOT NULL,
      applied_at TEXT    NOT NULL
    )
  `);
}

export function runMigrations(db, migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  ensureSchemaTable(db);

  const migrations = listMigrations(migrationsDir);
  const getRow = db.prepare('SELECT checksum FROM schema_migrations WHERE version = ?');
  const insertRow = db.prepare(
    'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)'
  );

  for (const m of migrations) {
    const existing = getRow.get(m.version);

    if (existing) {
      if (existing.checksum !== m.checksum) {
        throw new Error(
          `Migration ${m.file}: checksum mismatch. Stored: ${existing.checksum}, File: ${m.checksum}`
        );
      }
      continue;
    }

    db.transaction(() => {
      db.exec(m.content);
      insertRow.run(m.version, m.name, m.checksum, new Date().toISOString());
    })();
  }
}

export function validateMigrations(db, migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const getRow = db.prepare('SELECT checksum FROM schema_migrations WHERE version = ?');
  for (const m of listMigrations(migrationsDir)) {
    const existing = getRow.get(m.version);
    if (existing && existing.checksum !== m.checksum) {
      throw new Error(`Migration ${m.file}: checksum mismatch`);
    }
  }
}
