import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';

// P1-DISC1: a lesson records WHAT KIND of material it came from (handout, book, video, other) next to its discipline and its source.
// Optional (NULL = not said, which is every lesson that existed before migration 049), never invented, restricted to the four kinds.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

async function freshApp() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-kind-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  return { app, db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

const send = (app, method, url, payload, headers) => app.inject({ method, url, payload, headers: { origin: TEST_ORIGIN, ...headers } });

async function session(app, email) {
  const body = { email, password: 'a genuinely long test password 1' };
  await send(app, 'POST', '/v1/auth/register', body);
  const login = await send(app, 'POST', '/v1/auth/login', body);
  const cookie = login.headers['set-cookie'].split(';')[0];
  const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
  return { cookie, 'x-csrf-token': JSON.parse(me.body).csrfToken };
}

const lesson = (extra) => ({ newSubjectName: 'Farmacologia', title: 'Farmacocinética', studyDate: '2026-11-14', ...extra });

test('a lesson created with a source kind returns it; one created without it has null; an unknown kind is refused', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const headers = await session(app, 'kind-create@example.com');
    const book = JSON.parse((await send(app, 'POST', '/v1/learning-units', lesson({ sourceKind: 'LIVRO' }), headers)).body);
    assert.equal(book.unit.sourceKind, 'LIVRO');
    const plain = JSON.parse((await send(app, 'POST', '/v1/learning-units', lesson({ title: 'Anti-hipertensivos', subjectId: book.subject.id, newSubjectName: undefined }), headers)).body);
    assert.equal(plain.unit.sourceKind, null);
    const bad = await send(app, 'POST', '/v1/learning-units', lesson({ title: 'Outra', sourceKind: 'REVISTA' }), headers);
    assert.equal(bad.statusCode, 400);
  } finally { cleanup(); }
});

test('the source kind can be set and cleared on an existing lesson, and only to one of the four kinds', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const headers = await session(app, 'kind-patch@example.com');
    const made = JSON.parse((await send(app, 'POST', '/v1/learning-units', lesson(), headers)).body);
    const id = made.unit.id;
    for (const kind of ['APOSTILA', 'VIDEO', 'OUTRO']) {
      const res = await send(app, 'PATCH', `/v1/learning-units/${id}`, { sourceKind: kind }, headers);
      assert.equal(res.statusCode, 200, `${kind}: ${res.body}`);
      assert.equal(JSON.parse(res.body).unit.sourceKind, kind);
    }
    const cleared = await send(app, 'PATCH', `/v1/learning-units/${id}`, { sourceKind: null }, headers);
    assert.equal(JSON.parse(cleared.body).unit.sourceKind, null);
    assert.equal((await send(app, 'PATCH', `/v1/learning-units/${id}`, { sourceKind: 'blog' }, headers)).statusCode, 400);
  } finally { cleanup(); }
});

test('migration 049 is additive: lessons that existed before it keep a null source kind and nothing else changes', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const column = db.prepare("SELECT * FROM pragma_table_info('learning_units') WHERE name = 'source_kind'").get();
    assert.deepEqual([column.type, column.notnull], ['TEXT', 0]);
    const headers = await session(app, 'kind-db@example.com');
    const made = JSON.parse((await send(app, 'POST', '/v1/learning-units', lesson(), headers)).body);
    assert.equal(made.unit.sourceKind, null);
    // the database itself refuses a fifth kind, whatever the route does
    assert.throws(() => db.prepare("UPDATE learning_units SET source_kind = 'X' WHERE id = ?").run(made.unit.id), /CHECK/i);
  } finally { cleanup(); }
});
