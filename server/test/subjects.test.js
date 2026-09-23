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
const TEST_ORIGIN = 'https://smartlearn.test';

async function freshApp() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-subjects-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  return { app, db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function post(app, url, payload, headers = {}) {
  return app.inject({ method: 'POST', url, payload, headers: { origin: TEST_ORIGIN, ...headers } });
}
function patch(app, url, payload, headers = {}) {
  return app.inject({ method: 'PATCH', url, payload, headers: { origin: TEST_ORIGIN, ...headers } });
}
function del(app, url, headers = {}) {
  return app.inject({ method: 'DELETE', url, headers: { origin: TEST_ORIGIN, ...headers } });
}

async function registerAndAuth(app, email) {
  await post(app, '/v1/auth/register', { email, password: 'a genuinely long test password 1' });
  const loginRes = await post(app, '/v1/auth/login', { email, password: 'a genuinely long test password 1' });
  const cookie = loginRes.headers['set-cookie'].split(';')[0];
  const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
  const csrfToken = JSON.parse(me.body).csrfToken;
  return { cookie, csrfToken };
}

test('create + list: a new subject appears in the owner\'s list', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken } = await registerAndAuth(app, 'alice@example.com');
    const createRes = await post(app, '/v1/subjects', { name: 'Farmacologia' }, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(createRes.statusCode, 200);
    const listRes = await app.inject({ method: 'GET', url: '/v1/subjects', headers: { cookie } });
    const body = JSON.parse(listRes.body);
    assert.equal(body.subjects.length, 1);
    assert.equal(body.subjects[0].name, 'Farmacologia');
  } finally { await app.close(); cleanup(); }
});

test('medical Unicode subject name round trips exactly', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken } = await registerAndAuth(app, 'bea@example.com');
    const specialName = 'Farmacologia — β-bloqueadores e Na⁺/K⁺-ATPase';
    await post(app, '/v1/subjects', { name: specialName }, { cookie, 'x-csrf-token': csrfToken });
    const listRes = await app.inject({ method: 'GET', url: '/v1/subjects', headers: { cookie } });
    assert.equal(JSON.parse(listRes.body).subjects[0].name, specialName);
  } finally { await app.close(); cleanup(); }
});

test('two different users may each own a subject with the same display name', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const alice = await registerAndAuth(app, 'aliceX@example.com');
    const bob = await registerAndAuth(app, 'bobX@example.com');
    const r1 = await post(app, '/v1/subjects', { name: 'Anatomia' }, { cookie: alice.cookie, 'x-csrf-token': alice.csrfToken });
    const r2 = await post(app, '/v1/subjects', { name: 'Anatomia' }, { cookie: bob.cookie, 'x-csrf-token': bob.csrfToken });
    assert.equal(r1.statusCode, 200);
    assert.equal(r2.statusCode, 200);
  } finally { await app.close(); cleanup(); }
});

test('one user cannot create duplicate subject names differing only by case/whitespace', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken } = await registerAndAuth(app, 'cid@example.com');
    await post(app, '/v1/subjects', { name: 'Bioquímica' }, { cookie, 'x-csrf-token': csrfToken });
    const dup = await post(app, '/v1/subjects', { name: '  BIOQUÍMICA  ' }, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(dup.statusCode, 409);
    assert.equal(JSON.parse(dup.body).error.code, 'SUBJECT_CONFLICT');
  } finally { await app.close(); cleanup(); }
});

test('rename to an existing name is rejected as a conflict, original name preserved', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken } = await registerAndAuth(app, 'dan@example.com');
    await post(app, '/v1/subjects', { name: 'Fisiologia' }, { cookie, 'x-csrf-token': csrfToken });
    const secondRes = await post(app, '/v1/subjects', { name: 'Patologia' }, { cookie, 'x-csrf-token': csrfToken });
    const secondId = JSON.parse(secondRes.body).subject.id;

    const renameRes = await patch(app, `/v1/subjects/${secondId}`, { name: 'Fisiologia' }, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(renameRes.statusCode, 409);

    const listRes = await app.inject({ method: 'GET', url: '/v1/subjects', headers: { cookie } });
    const names = JSON.parse(listRes.body).subjects.map(s => s.name).sort();
    assert.deepEqual(names, ['Fisiologia', 'Patologia']);
  } finally { await app.close(); cleanup(); }
});

test('reactivating an archived subject succeeds when no homonym exists', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken } = await registerAndAuth(app, 'eve@example.com');
    const createRes = await post(app, '/v1/subjects', { name: 'Histologia' }, { cookie, 'x-csrf-token': csrfToken });
    const id = JSON.parse(createRes.body).subject.id;
    await patch(app, `/v1/subjects/${id}`, { isActive: false }, { cookie, 'x-csrf-token': csrfToken });

    const reactivateRes = await patch(app, `/v1/subjects/${id}`, { isActive: true }, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(reactivateRes.statusCode, 200);
    assert.equal(JSON.parse(reactivateRes.body).subject.isActive, true);
  } finally { await app.close(); cleanup(); }
});
// NOTE: a scenario where an archived subject and a DIFFERENT active subject
// share the same name cannot occur under this schema — subjects has
// UNIQUE(user_id, name COLLATE NOCASE) with no exemption for archived rows,
// so the database itself makes that state unreachable. reactivate()'s own
// belt-and-suspenders conflict check (services/subjects.js) is therefore
// defensive/unreachable code under the current schema, not a gap.

test('creating a subject with the same name as an EXISTING archived one is a conflict, not silent reactivation', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken } = await registerAndAuth(app, 'flo@example.com');
    const createRes = await post(app, '/v1/subjects', { name: 'Genética' }, { cookie, 'x-csrf-token': csrfToken });
    const id = JSON.parse(createRes.body).subject.id;
    await patch(app, `/v1/subjects/${id}`, { isActive: false }, { cookie, 'x-csrf-token': csrfToken });

    const recreateRes = await post(app, '/v1/subjects', { name: 'Genética' }, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(recreateRes.statusCode, 409, 'must not silently reactivate; caller must explicitly PATCH isActive=true');
  } finally { await app.close(); cleanup(); }
});

test('deleting a subject with owned learning history fails and leaves it intact', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken } = await registerAndAuth(app, 'gia@example.com');
    const createRes = await post(app, '/v1/subjects', { name: 'Imunologia' }, { cookie, 'x-csrf-token': csrfToken });
    const id = JSON.parse(createRes.body).subject.id;

    // Manually insert a learning_unit for this subject (T14 doesn't build units yet — that's T15).
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get('gia@example.com');
    const now = new Date().toISOString();
    db.prepare('INSERT INTO learning_units (user_id, subject_id, title, study_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(user.id, id, 'Some lesson', now, now, now);

    const deleteRes = await del(app, `/v1/subjects/${id}`, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(deleteRes.statusCode, 409);
    assert.equal(JSON.parse(deleteRes.body).error.code, 'SUBJECT_NOT_EMPTY');

    const listRes = await app.inject({ method: 'GET', url: '/v1/subjects', headers: { cookie } });
    assert.equal(JSON.parse(listRes.body).subjects.length, 1, 'the subject must still exist');
  } finally { await app.close(); cleanup(); }
});

test('deleting an empty subject succeeds', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const { cookie, csrfToken } = await registerAndAuth(app, 'hugo@example.com');
    const createRes = await post(app, '/v1/subjects', { name: 'Radiologia' }, { cookie, 'x-csrf-token': csrfToken });
    const id = JSON.parse(createRes.body).subject.id;
    const deleteRes = await del(app, `/v1/subjects/${id}`, { cookie, 'x-csrf-token': csrfToken });
    assert.equal(deleteRes.statusCode, 204);
  } finally { await app.close(); cleanup(); }
});

test('a user cannot rename, archive, reorder, or delete a subject owned by another user (foreign id fails without effect)', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const alice = await registerAndAuth(app, 'aliceY@example.com');
    const bob = await registerAndAuth(app, 'bobY@example.com');
    const createRes = await post(app, '/v1/subjects', { name: 'Cardiologia' }, { cookie: alice.cookie, 'x-csrf-token': alice.csrfToken });
    const aliceSubjectId = JSON.parse(createRes.body).subject.id;

    const renameAttempt = await patch(app, `/v1/subjects/${aliceSubjectId}`, { name: 'Hijacked' }, { cookie: bob.cookie, 'x-csrf-token': bob.csrfToken });
    assert.equal(renameAttempt.statusCode, 404, 'a foreign-owned id must behave as not-found, never revealing it exists');

    const deleteAttempt = await del(app, `/v1/subjects/${aliceSubjectId}`, { cookie: bob.cookie, 'x-csrf-token': bob.csrfToken });
    assert.equal(deleteAttempt.statusCode, 404);

    // Confirm no effect: Alice's subject is untouched.
    const listRes = await app.inject({ method: 'GET', url: '/v1/subjects', headers: { cookie: alice.cookie } });
    assert.equal(JSON.parse(listRes.body).subjects[0].name, 'Cardiologia');
  } finally { await app.close(); cleanup(); }
});

test('reorder updates sort order and rejects a foreign-owned id in the list', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const alice = await registerAndAuth(app, 'aliceZ@example.com');
    const bob = await registerAndAuth(app, 'bobZ@example.com');
    const r1 = await post(app, '/v1/subjects', { name: 'AA' }, { cookie: alice.cookie, 'x-csrf-token': alice.csrfToken });
    const r2 = await post(app, '/v1/subjects', { name: 'BB' }, { cookie: alice.cookie, 'x-csrf-token': alice.csrfToken });
    const idA = JSON.parse(r1.body).subject.id;
    const idB = JSON.parse(r2.body).subject.id;

    const reorderRes = await post(app, '/v1/subjects/reorder', { orderedIds: [idB, idA] }, { cookie: alice.cookie, 'x-csrf-token': alice.csrfToken });
    assert.equal(reorderRes.statusCode, 200);
    assert.deepEqual(JSON.parse(reorderRes.body).subjects.map(s => s.id), [idB, idA]);

    const bobSubject = await post(app, '/v1/subjects', { name: 'Bob Subject' }, { cookie: bob.cookie, 'x-csrf-token': bob.csrfToken });
    const bobId = JSON.parse(bobSubject.body).subject.id;
    const crossReorder = await post(app, '/v1/subjects/reorder', { orderedIds: [idA, bobId] }, { cookie: alice.cookie, 'x-csrf-token': alice.csrfToken });
    assert.equal(crossReorder.statusCode, 404, 'a foreign id in the reorder list must be rejected wholesale, not partially applied');
  } finally { await app.close(); cleanup(); }
});

test('creating a subject requires authentication', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const res = await post(app, '/v1/subjects', { name: 'Should Fail' });
    assert.equal(res.statusCode, 401);
  } finally { await app.close(); cleanup(); }
});
