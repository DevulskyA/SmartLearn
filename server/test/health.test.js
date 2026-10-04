import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import { readFileSync } from 'node:fs';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-health-'));
  return { dir, path: join(dir, 'test.db'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('/health/live returns 200', async () => {
  const app = await buildApp(null);
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
    const app = await buildApp(db, MIGRATIONS_DIR);
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
    const app = await buildApp(db, MIGRATIONS_DIR);
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
    const app = await buildApp(db, MIGRATIONS_DIR);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    assert.equal(res.statusCode, 503);
    await app.close();
    db.close();
  } finally {
    cleanup();
  }
});

test('/health/build reports the stamped build identity (version, commit, content hash, mode, declared provider) and nothing else outside DEV', async () => {
  const app = await buildApp(null);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/health/build' });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(Object.keys(body).sort(), ['content', 'head', 'mode', 'provider', 'version']);
  await app.close();
});

test('/health/build reports the server version (equal to the root package.json) next to head, mode and provider', async () => {
  const expected = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
  const app = await buildApp(null);
  const res = await app.inject({ method: 'GET', url: '/health/build' });
  assert.equal(res.json().version, expected);
  await app.close();
});

test('/health/build adds counts-only diagnostics (schema, database file, row counts) in the DEV channel only', async () => {
  const { config } = await import('../src/config.js');
  const { openDb } = await import('../src/db.js');
  const { runMigrations } = await import('../src/migrations.js');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'sl-diag-'));
  const dbPath = join(dir, 'd.db');
  const db = openDb(dbPath);
  runMigrations(db);
  db.prepare("INSERT INTO users (email, email_display, password_hash, password_salt, password_params, created_at, updated_at) VALUES ('p@x.com','p@x.com','h','s','p','t','t')").run();
  const saved = { mode: config.buildMode, path: config.dbPath };
  try {
    config.dbPath = dbPath;
    config.buildMode = 'DEV';
    let app = await buildApp(db);
    const dev = (await app.inject({ method: 'GET', url: '/health/build' })).json();
    await app.close();
    assert.ok(dev.diagnostics.schemaVersion >= 30);
    assert.equal(dev.diagnostics.dbPath.toLowerCase(), dbPath.toLowerCase());
    assert.equal(dev.diagnostics.counts.subjects, 0);
    assert.ok(!JSON.stringify(dev.diagnostics).includes('p@x.com'), 'no row content, only counts');
    config.buildMode = null;
    app = await buildApp(db);
    const prod = (await app.inject({ method: 'GET', url: '/health/build' })).json();
    await app.close();
    assert.equal(prod.diagnostics, undefined, 'an unstamped (release) build exposes no database path');
  } finally {
    config.buildMode = saved.mode; config.dbPath = saved.path;
    db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
