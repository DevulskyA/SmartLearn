// Return-to-source record (experiment): only the observable opening of the original document, owner-controlled, idempotent, append-only,
// and never learning evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as openings from '../src/services/source-openings.js';
import { buildApp } from '../src/app.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-openings-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const makeUser = (db, email) => {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
};
const makeSource = (db, userId, checksum = 'abc') => db.prepare(`INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, status, created_at, page_count)
  VALUES (?, 'f.pdf', 'Costanzo.pdf', 'application/pdf', 100, ?, 'UPLOADED', ?, 12)`).run(userId, checksum, new Date().toISOString()).lastInsertRowid;
const evidenceRows = (db) => db.prepare('SELECT COUNT(*) AS n FROM learning_events').get().n + db.prepare('SELECT COUNT(*) AS n FROM learning_evidence').get().n;

test('record(): stores only the opening (source, page, context); the same operation key is ONE fact; it is never evidence', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'o@example.com');
    const sourceId = makeSource(db, userId);
    const a = openings.record(db, userId, { sourceId, pageIndex: 3, context: 'STUDY', operationKey: 'k1' });
    const again = openings.record(db, userId, { sourceId, pageIndex: 3, context: 'STUDY', operationKey: 'k1' });
    assert.equal(a.duplicate, false); assert.equal(again.duplicate, true); assert.equal(again.id, a.id);
    openings.record(db, userId, { sourceId, pageIndex: 3, context: 'STUDY', operationKey: 'k2' });
    openings.record(db, userId, { sourceId, context: 'OTHER', operationKey: 'k3' });
    const list = openings.list(db, userId, { sourceId });
    assert.equal(list.length, 3, 'two distinct opens of the same page are two facts; the repeated delivery was not');
    assert.deepEqual(list[0].pageIndex, 3); assert.equal(list[2].pageIndex, null);
    assert.equal(evidenceRows(db), 0, 'an opening is not reading, understanding or a right answer: no ledger row, no evidence');
    assert.throws(() => db.prepare('DELETE FROM source_openings').run(), /append-only/);
    assert.throws(() => db.prepare('UPDATE source_openings SET page_index = 9').run(), /append-only/);
  } finally { cleanup(); }
});

test('record() validates: own source only, positive page inside the document, known context, an operation key', () => {
  const { db, cleanup } = tmpDb();
  try {
    const alice = makeUser(db, 'a@example.com');
    const bob = makeUser(db, 'b@example.com');
    const sourceId = makeSource(db, alice);
    assert.throws(() => openings.record(db, bob, { sourceId, pageIndex: 1, context: 'STUDY', operationKey: 'k' }), /não encontrada/i);
    assert.throws(() => openings.record(db, alice, { sourceId, pageIndex: 0, context: 'STUDY', operationKey: 'k' }), /pageIndex/);
    assert.throws(() => openings.record(db, alice, { sourceId, pageIndex: 13, context: 'STUDY', operationKey: 'k' }), /pageIndex/);
    assert.throws(() => openings.record(db, alice, { sourceId, pageIndex: 1, context: 'INVENTED', operationKey: 'k' }), /context/);
    assert.throws(() => openings.record(db, alice, { sourceId, pageIndex: 1, context: 'STUDY' }), /operationKey/);
    assert.deepEqual(openings.list(db, bob, { sourceId }), [], 'another user sees none of it');
  } finally { cleanup(); }
});

test('HTTP: POST /v1/source-openings is owner-only and idempotent; GET lists the owner\'s openings; anonymous is 401', async () => {
  const { db, cleanup } = tmpDb();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN] });
  try {
    const pw = 'a genuinely long test password 1';
    const session = async (email) => {
      await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: ORIGIN }, payload: { email, password: pw } });
      const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: { email, password: pw } });
      const cookie = login.headers['set-cookie'].split(';')[0];
      const me = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body);
      return { cookie, csrf: me.csrfToken };
    };
    const alice = await session('alice@example.com');
    const bob = await session('bob@example.com');
    const aliceId = db.prepare("SELECT id FROM users WHERE email = 'alice@example.com'").get().id;
    const sourceId = makeSource(db, aliceId);
    const post = (s, body) => app.inject({ method: 'POST', url: '/v1/source-openings', headers: { origin: ORIGIN, 'content-type': 'application/json', ...(s ? { cookie: s.cookie, 'x-csrf-token': s.csrf } : {}) }, payload: body });
    const body = { sourceId, pageIndex: 2, context: 'EDITOR', operationKey: 'abc' };
    assert.equal((await post(null, body)).statusCode, 401);
    assert.equal((await post(bob, body)).statusCode, 404, 'not Bob\'s source');
    assert.equal((await post(alice, { ...body, context: 'INVENTED' })).statusCode, 400);
    assert.equal(JSON.parse((await post(alice, body)).body).duplicate, false);
    assert.equal(JSON.parse((await post(alice, body)).body).duplicate, true);
    const anotherSourceId = makeSource(db, aliceId, 'another-source');
    for (const changed of [{ sourceId: anotherSourceId }, { pageIndex: 3 }, { pageIndex: null }, { context: 'STUDY' }]) {
      const conflict = await post(alice, { ...body, ...changed });
      assert.equal(conflict.statusCode, 409, JSON.stringify(changed));
      assert.equal(conflict.json().error.code, 'IDEMPOTENCY_CONFLICT');
    }
    const bobId = db.prepare("SELECT id FROM users WHERE email = 'bob@example.com'").get().id;
    const bobSourceId = makeSource(db, bobId);
    assert.equal((await post(bob, { ...body, sourceId: bobSourceId })).json().duplicate, false, 'keys are scoped to the owner');
    const noPage = { sourceId, context: 'STUDY', operationKey: 'no-page' };
    const first = (await post(alice, noPage)).json();
    const replay = (await post(alice, { ...noPage, pageIndex: null })).json();
    assert.equal(replay.duplicate, true);
    assert.equal(replay.id, first.id, 'omitted and null page are equivalent');
    assert.equal((await post(alice, body)).json().duplicate, true, 'conflict leaves the original replay intact');
    const listed = JSON.parse((await app.inject({ method: 'GET', url: `/v1/source-openings?sourceId=${sourceId}`, headers: { cookie: alice.cookie } })).body);
    assert.equal(listed.openings.length, 2);
    assert.equal(JSON.parse((await app.inject({ method: 'GET', url: `/v1/source-openings?sourceId=${sourceId}`, headers: { cookie: bob.cookie } })).body).openings.length, 0);
  } finally { await app.close(); cleanup(); }
});

test('record(): the same key with the same payload replays the original; a different source, page or context under that key conflicts and writes nothing', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'conflict@example.com');
    const sourceId = makeSource(db, userId);
    const otherSourceId = makeSource(db, userId, 'other');
    const first = openings.record(db, userId, { sourceId, pageIndex: 3, context: 'STUDY', operationKey: 'same' });
    const replay = openings.record(db, userId, { sourceId, pageIndex: 3, context: 'STUDY', operationKey: 'same' });
    assert.equal(replay.duplicate, true);
    assert.deepEqual({ ...replay, duplicate: undefined }, { ...first, duplicate: undefined }, 'the replay is the ORIGINAL record (same id and openedAt)');
    const count = () => db.prepare('SELECT COUNT(*) AS n FROM source_openings').get().n;
    const before = count();
    for (const changed of [{ sourceId: otherSourceId }, { pageIndex: 4 }, { pageIndex: null }, { pageIndex: undefined }, { context: 'REVIEW' }]) {
      assert.throws(
        () => openings.record(db, userId, { sourceId, pageIndex: 3, context: 'STUDY', operationKey: 'same', ...changed }),
        (error) => error.code === 'IDEMPOTENCY_CONFLICT',
        `changed ${JSON.stringify(changed)} must conflict`,
      );
    }
    assert.equal(count(), before, 'a conflict writes nothing');
    // "no page" is one intent however it is spelled: absent, undefined and null are the same payload
    openings.record(db, userId, { sourceId, context: 'OTHER', operationKey: 'nopage' });
    assert.equal(openings.record(db, userId, { sourceId, pageIndex: null, context: 'OTHER', operationKey: 'nopage' }).duplicate, true);
    assert.equal(openings.record(db, userId, { sourceId, pageIndex: undefined, context: 'OTHER', operationKey: 'nopage' }).duplicate, true);
  } finally { cleanup(); }
});

test('record(): operation keys are per user: another user reusing the same key with another payload is not a conflict', () => {
  const { db, cleanup } = tmpDb();
  try {
    const alice = makeUser(db, 'iso-a@example.com');
    const bob = makeUser(db, 'iso-b@example.com');
    const aliceSource = makeSource(db, alice);
    const bobSource = makeSource(db, bob);
    const a = openings.record(db, alice, { sourceId: aliceSource, pageIndex: 1, context: 'STUDY', operationKey: 'shared-key' });
    const b = openings.record(db, bob, { sourceId: bobSource, pageIndex: 2, context: 'EDITOR', operationKey: 'shared-key' });
    assert.equal(b.duplicate, false);
    assert.notEqual(a.id, b.id);
    assert.equal(openings.list(db, alice).length, 1);
    assert.equal(openings.list(db, bob).length, 1);
  } finally { cleanup(); }
});


test('the opening records stay append-only while their source exists: a direct UPDATE or DELETE is refused and the record is untouched', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'append-only@example.com');
    const sourceId = makeSource(db, userId);
    const first = openings.record(db, userId, { sourceId, pageIndex: 2, context: 'STUDY', operationKey: 'append-only-1' });
    assert.throws(() => db.prepare('UPDATE source_openings SET page_index = 3 WHERE id = ?').run(first.id), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM source_openings WHERE id = ?').run(first.id), /append-only/);
    assert.deepEqual(openings.list(db, userId, { sourceId }).map((o) => [o.id, o.pageIndex]), [[first.id, 2]]);
  } finally { cleanup(); }
});
