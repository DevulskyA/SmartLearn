import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-static-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function fakeBuiltDist() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-static-dist-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>fake spa</title>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("fake asset");');
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}

test('T21: staticDir is opt-in — omitting it (every other test/dev call site) serves no static files at all', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [] });
    const res = await app.inject({ method: 'GET', url: '/' });
    assert.equal(res.statusCode, 404);
    await app.close();
  } finally { cleanup(); }
});

test('T21: buildApp rejects a staticDir that does not exist, rather than silently serving nothing', async () => {
  const { db, cleanup } = tmpDb();
  try {
    await assert.rejects(
      () => buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [], staticDir: join(tmpdir(), 'sl-static-does-not-exist-xyz') }),
      /staticDir does not exist/,
    );
  } finally { cleanup(); }
});

test('T21: with staticDir set, the SPA is served at / and unknown non-API GET paths fall back to index.html (client-side routing)', async () => {
  const { db, cleanup } = tmpDb();
  const dist = fakeBuiltDist();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [], staticDir: dist.dir });

    const root = await app.inject({ method: 'GET', url: '/' });
    assert.equal(root.statusCode, 200);
    assert.match(root.body, /fake spa/);

    const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
    assert.equal(asset.statusCode, 200);
    assert.match(asset.body, /fake asset/);

    const deepLink = await app.inject({ method: 'GET', url: '/some/deep/client/route' });
    assert.equal(deepLink.statusCode, 200, 'unknown GET paths fall back to index.html for the client-side #hash router');
    assert.match(deepLink.body, /fake spa/);

    await app.close();
  } finally { cleanup(); dist.cleanup(); }
});

test('T21: with staticDir set, /v1 and /health stay JSON-only — never swallowed by the SPA fallback', async () => {
  const { db, cleanup } = tmpDb();
  const dist = fakeBuiltDist();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [], staticDir: dist.dir });

    const unauthed = await app.inject({ method: 'GET', url: '/v1/subjects' });
    assert.equal(unauthed.statusCode, 401);
    assert.equal(JSON.parse(unauthed.body).error.code, 'UNAUTHENTICATED');

    const unknownApiRoute = await app.inject({ method: 'GET', url: '/v1/this-route-does-not-exist' });
    assert.equal(unknownApiRoute.statusCode, 404);
    assert.doesNotMatch(unknownApiRoute.body, /fake spa/, 'an unknown /v1 path must never fall back to the SPA HTML');

    const health = await app.inject({ method: 'GET', url: '/health/live' });
    assert.equal(health.statusCode, 200);
    assert.equal(JSON.parse(health.body).status, 'alive');

    await app.close();
  } finally { cleanup(); dist.cleanup(); }
});
