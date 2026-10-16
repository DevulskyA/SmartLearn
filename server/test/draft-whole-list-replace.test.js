import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as drafts from '../src/services/generated-drafts.js';

// T-F2-01: replacing the WHOLE question list by position is no longer reachable from any route. Edits go through
// per-entity operations (PATCH summary / PATCH or DELETE a question by its stable id). The whole-list service is kept
// ONLY for fixtures, under a name that says what it does, and no route may use it.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

test('PATCH /v1/drafts/:id (whole-list replace) is gone: 410 with guidance to the per-entity operations, no side effects', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-replace-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir: join(dir, 'sources'), maxBytes: 1024 * 1024, quotaBytes: 4 * 1024 * 1024 } });
  try {
    const email = 'replace-gone@example.com';
    const password = 'a genuinely long test password 1';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    const csrfToken = JSON.parse(me.body).csrfToken;

    const res = await app.inject({
      method: 'PATCH', url: '/v1/drafts/1',
      headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { summary: 'x', questions: [{ question: 'q', answer: 'a', sourceSpans: [{ pageIndex: 1 }] }] },
    });
    assert.equal(res.statusCode, 410);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'ENDPOINT_REMOVED');
    assert.match(body.error.message, /summary/);
    assert.match(body.error.message, /questions\/:questionId/);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('the whole-list service is named replaceDraftContent (fixtures only) and the generic reviseDraft name no longer exists', () => {
  assert.equal(typeof drafts.replaceDraftContent, 'function');
  assert.equal(drafts.reviseDraft, undefined);
});

test('guard: no route module references replaceDraftContent (it must never be reachable over HTTP)', () => {
  const routesDir = fileURLToPath(new URL('../src/routes', import.meta.url));
  for (const file of readdirSync(routesDir).filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(join(routesDir, file), 'utf8');
    assert.equal(/replaceDraftContent|reviseDraft\b/.test(text), false, `${file} must not call the whole-list replace`);
  }
});
