import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';

const TEST_ORIGIN = 'https://smartlearn.test';
const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-agenda-snapshot-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

async function registeredSession(app, email) {
  await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
  const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
  const cookie = loginRes.headers['set-cookie'].split(';')[0];
  const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
  return { cookie, csrfToken: JSON.parse(me.payload).csrfToken };
}

async function createUnit(app, session, { studyDate }) {
  return app.inject({
    method: 'POST', url: '/v1/learning-units',
    headers: { origin: TEST_ORIGIN, cookie: session.cookie, 'x-csrf-token': session.csrfToken },
    payload: { newSubjectName: `Subj-${Math.random()}`, title: 'Aula', studyDate },
  });
}

test('agenda snapshot includes future tasks beyond today, with schema envelope fields', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
    const session = await registeredSession(app, 'a@example.com');
    await createUnit(app, session, { studyDate: '2026-01-01' });

    const res = await app.inject({ method: 'GET', url: '/v1/agenda-snapshot', headers: { cookie: session.cookie } });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);

    assert.equal(body.schemaVersion, 1);
    assert.ok(body.generatedAt);
    assert.ok(body.dataRevision);
    assert.ok(body.timezone);
    assert.ok(Array.isArray(body.items));
    // review-schedule generates multiple offsets, so at least one due date
    // must land well beyond "today" (not just today/tomorrow).
    const farFuture = body.items.some((i) => i.dueDate > '2026-01-05');
    assert.ok(farFuture, 'snapshot must include known future agenda, not just today/tomorrow');
  } finally {
    cleanup();
  }
});

test('pagination across two pages with the same revision returns the full consistent set with no duplicates', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
    const session = await registeredSession(app, 'a@example.com');
    await createUnit(app, session, { studyDate: '2026-01-01' });
    await createUnit(app, session, { studyDate: '2026-01-02' });

    const page1Res = await app.inject({ method: 'GET', url: '/v1/agenda-snapshot?limit=1', headers: { cookie: session.cookie } });
    const page1 = JSON.parse(page1Res.payload);
    assert.equal(page1.items.length, 1);
    assert.ok(page1.nextCursor !== null);

    const page2Res = await app.inject({
      method: 'GET',
      url: `/v1/agenda-snapshot?limit=1&cursor=${page1.nextCursor}&revision=${encodeURIComponent(page1.dataRevision)}`,
      headers: { cookie: session.cookie },
    });
    assert.equal(page2Res.statusCode, 200);
    const page2 = JSON.parse(page2Res.payload);
    assert.equal(page2.dataRevision, page1.dataRevision);
    assert.notEqual(page2.items[0].reviewTaskId, page1.items[0].reviewTaskId);
  } finally {
    cleanup();
  }
});

test('a concurrent change between pages is rejected, not silently mixed into the generation', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
    const session = await registeredSession(app, 'a@example.com');
    await createUnit(app, session, { studyDate: '2026-01-01' });

    const page1Res = await app.inject({ method: 'GET', url: '/v1/agenda-snapshot?limit=1', headers: { cookie: session.cookie } });
    const page1 = JSON.parse(page1Res.payload);

    // Mutate the pending set in between page fetches (a new unit -> new
    // review tasks), simulating a concurrent write during a slow client sync.
    await createUnit(app, session, { studyDate: '2026-01-03' });

    const page2Res = await app.inject({
      method: 'GET',
      url: `/v1/agenda-snapshot?limit=1&cursor=${page1.nextCursor}&revision=${encodeURIComponent(page1.dataRevision)}`,
      headers: { cookie: session.cookie },
    });
    assert.equal(page2Res.statusCode, 409);
    assert.equal(JSON.parse(page2Res.payload).error.code, 'REVISION_CHANGED');
  } finally {
    cleanup();
  }
});

test('a user cannot read another user\'s agenda snapshot', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
    const owner = await registeredSession(app, 'owner@example.com');
    await createUnit(app, owner, { studyDate: '2026-01-01' });
    const other = await registeredSession(app, 'other@example.com');

    const res = await app.inject({ method: 'GET', url: '/v1/agenda-snapshot', headers: { cookie: other.cookie } });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.items.length, 0);
  } finally {
    cleanup();
  }
});

test('an unauthenticated request is rejected', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
    const res = await app.inject({ method: 'GET', url: '/v1/agenda-snapshot' });
    assert.equal(res.statusCode, 401);
  } finally {
    cleanup();
  }
});
