// Proof for the "route without login check" alerts of a quick scanner: it reads each route file and does not see that /v1 is an
// encapsulated Fastify context whose preHandler (server/src/http-contract.js) answers 401 to every request without a session,
// unless the route is marked `config: { public: true }`. This test calls EVERY route declared in server/src/routes with no
// session at all and requires that none of them answers with data (2xx), except the explicit public list below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ROUTES_DIR = fileURLToPath(new URL('../src/routes', import.meta.url));
const ORIGIN = 'https://smartlearn.test';

// The only routes that may answer without a session: account creation, sign in, and recovery completion (needs a one-time token).
const PUBLIC = new Set(['POST /auth/register', 'POST /auth/login', 'POST /auth/reset-password']);

function declaredRoutes() {
  const found = [];
  for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.js'))) {
    const source = readFileSync(join(ROUTES_DIR, file), 'utf8');
    for (const m of source.matchAll(/\bapp\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      found.push({ file, method: m[1].toUpperCase(), path: m[2] });
    }
  }
  return found;
}

test('every route in server/src/routes refuses a request with no session (no 2xx), except the explicit public list', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-default-deny-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN] });
  try {
    const routes = declaredRoutes();
    assert.ok(routes.length > 60, `expected the route scan to find the API surface, found ${routes.length}`);
    const leaks = [];
    const publicSeen = new Set();
    for (const { file, method, path } of routes) {
      const key = `${method} ${path}`;
      if (PUBLIC.has(key)) { publicSeen.add(key); continue; }
      const url = `/v1${path.replace(/:\w+/g, '1')}`;
      const res = await app.inject({ method, url, headers: { origin: ORIGIN }, payload: method === 'GET' ? undefined : {} });
      if (res.statusCode >= 200 && res.statusCode < 300) leaks.push(`${file} ${key} -> ${res.statusCode}`);
    }
    assert.deepEqual(leaks, [], 'routes that answered without a session');
    assert.deepEqual([...publicSeen].sort(), [...PUBLIC].sort(), 'the public list and the routes must match');

    // A plain GET with valid params must be exactly 401 (the default-deny), not merely "not 2xx".
    for (const url of ['/v1/review-tasks', '/v1/learning-units', '/v1/subjects', '/v1/backup', '/v1/agenda-snapshot']) {
      const res = await app.inject({ method: 'GET', url, headers: { origin: ORIGIN } });
      assert.equal(res.statusCode, 401, url);
    }
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
