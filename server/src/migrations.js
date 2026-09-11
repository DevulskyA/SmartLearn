import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

// Migration checksums must identify SQL content, not the checkout's line
// endings: the same file is CRLF on a Windows working tree (core.autocrlf)
// and LF on Linux CI, yet must hash identically. The canonical checksum is
// SHA-256 over CRLF/CR normalized to LF. `legacyCRLFChecksum` reconstructs
// the checksum a CRLF checkout of the SAME content would have produced, so
// databases that recorded that historical value stay valid without a
// migration of their own schema_migrations rows.
export function normalizeLineEndings(content) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function canonicalChecksum(content) {
  return sha256(normalizeLineEndings(content));
}

function legacyCRLFChecksum(content) {
  return sha256(normalizeLineEndings(content).replace(/\n/g, '\r\n'));
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
      return {
        file: f,
        ...meta,
        content,
        checksum: canonicalChecksum(content),
        legacyChecksum: legacyCRLFChecksum(content),
      };
    })
    .filter(Boolean);
}

function checksumMatches(recordedChecksum, m) {
  return recordedChecksum === m.checksum || recordedChecksum === m.legacyChecksum;
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
      if (!checksumMatches(existing.checksum, m)) {
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

function loadManifest(migrationsDir) {
  const manifestPath = join(migrationsDir, 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

/**
 * A5 (audit): a directory-only check can never detect "a migration file
 * that should exist was never committed/deployed at all" -- there is
 * nothing on disk to compare against. `manifest.json` is the git-tracked
 * source of truth for "every migration that is SUPPOSED to exist" and
 * must be updated by hand alongside every new migration file (same
 * discipline as package-lock.json). Readiness (server/src/app.js's
 * /health/ready) fails closed if the manifest is missing entirely, if any
 * manifest entry is absent from disk or from this database's own
 * schema_migrations, if an on-disk file's checksum drifted from what the
 * manifest recorded, or if an unlisted .sql file exists on disk that the
 * manifest never accounted for.
 */
export function validateMigrations(db, migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const onDisk = listMigrations(migrationsDir);
  const onDiskByVersion = new Map(onDisk.map(m => [m.version, m]));
  const getRow = db.prepare('SELECT checksum FROM schema_migrations WHERE version = ?');

  for (const m of onDisk) {
    const existing = getRow.get(m.version);
    if (existing && !checksumMatches(existing.checksum, m)) {
      throw new Error(`Migration ${m.file}: checksum mismatch`);
    }
  }

  const manifest = loadManifest(migrationsDir);
  if (!manifest) {
    throw new Error('Migration manifest.json is missing -- cannot verify schema completeness.');
  }

  const manifestVersions = new Set(manifest.map(e => e.version));
  for (const expected of manifest) {
    const onDiskEntry = onDiskByVersion.get(expected.version);
    if (!onDiskEntry) {
      throw new Error(`Expected migration ${expected.version}-${expected.name}.sql is missing from the migrations directory.`);
    }
    if (onDiskEntry.checksum !== expected.checksum) {
      throw new Error(`Migration ${expected.version}-${expected.name}.sql on disk does not match the committed manifest checksum.`);
    }
    const applied = getRow.get(expected.version);
    if (!applied) {
      throw new Error(`Expected migration ${expected.version}-${expected.name}.sql has not been applied to this database.`);
    }
  }
  for (const m of onDisk) {
    if (!manifestVersions.has(m.version)) {
      throw new Error(`Migration ${m.file} exists on disk but is not listed in manifest.json.`);
    }
  }
}
