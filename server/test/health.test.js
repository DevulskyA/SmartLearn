import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-health-'));
  return { dir, path: join(dir, 'test.db'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('/health/live returns 200', async () => {
  const app = buildApp(null);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/health/live' });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test('/health/ready returns 200 with valid DB', async () => {
  const { path, cleanup } = tmpDb();
  try {
    const db = openDb(path);
    runMigrations(db, MIGRATIONS_DIR);
    const app = buildApp(db, MIGRATIONS_DIR);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, 'ready');
    await app.close();
    db.close();
  } finally {
    cleanup();
  }
});

test('/health/ready returns 503 when WAL not active', async () => {
  const { path, cleanup } = tmpDb();
  try {
    const db = openDb(path);
    runMigrations(db, MIGRATIONS_DIR);
    db.pragma('journal_mode = DELETE');
    const app = buildApp(db, MIGRATIONS_DIR);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    assert.equal(res.statusCode, 503);
    await app.close();
    db.close();
  } finally {
    cleanup();
  }
});

test('/health/ready returns 503 when foreign_keys OFF', async () => {
  const { path, cleanup } = tmpDb();
  try {
    const db = openDb(path);
    runMigrations(db, MIGRATIONS_DIR);
    db.pragma('foreign_keys = OFF');
    const app = buildApp(db, MIGRATIONS_DIR);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    assert.equal(res.statusCode, 503);
    await app.close();
    db.close();
  } finally {
    cleanup();
  }
});
