import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { backup } from '../src/backup.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'sl-pers-'));
}

test('value written to server_meta survives close and reopen', () => {
  const dir = tmpDir();
  const dbPath = join(dir, 'persist.db');
  try {
    const db = openDb(dbPath);
    runMigrations(db, MIGRATIONS_DIR);
    db.prepare("INSERT INTO server_meta (key, value) VALUES ('test_key', 'test_value')").run();
    db.close();

    const db2 = openDb(dbPath);
    const row = db2.prepare("SELECT value FROM server_meta WHERE key = 'test_key'").get();
    assert.equal(row?.value, 'test_value');
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('backup contains expected content when opened independently', async () => {
  const dir = tmpDir();
  const dbPath = join(dir, 'main.db');
  const backupDir = tmpDir();
  try {
    const db = openDb(dbPath);
    runMigrations(db, MIGRATIONS_DIR);
    db.prepare("INSERT INTO server_meta (key, value) VALUES ('backup_key', 'backup_val')").run();

    const backupPath = await backup(db, backupDir);
    db.close();

    const bdb = openDb(backupPath);
    const row = bdb.prepare("SELECT value FROM server_meta WHERE key = 'backup_key'").get();
    assert.equal(row?.value, 'backup_val');
    bdb.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(backupDir, { recursive: true, force: true });
  }
});
