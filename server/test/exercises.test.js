import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as exercises from '../src/services/exercises.js';
import * as learningUnits from '../src/services/learning-units.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-exercises-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)
  `).run(email, email, now, now).lastInsertRowid;
}

function makeUnit(db, userId, studyDate = '2026-01-01') {
  return learningUnits.create(db, userId, { newSubjectName: 'Farmacologia', title: 'Aula 1', studyDate }).unit;
}

test('create stores exactly one exercise and one version; list returns it with currentVersion populated', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const unit = makeUnit(db, userId);
    const created = exercises.create(db, userId, { unitId: unit.id, question: 'O que é hipertensão?', answer: 'PA elevada', hint: 'Pense em pressão', provenance: 'MANUAL' });
    assert.equal(created.currentVersion.question, 'O que é hipertensão?');
    assert.equal(created.currentVersion.provenance, 'MANUAL');

    const { n: exerciseCount } = db.prepare('SELECT COUNT(*) as n FROM exercises WHERE user_id = ?').get(userId);
    const { n: versionCount } = db.prepare('SELECT COUNT(*) as n FROM exercise_versions WHERE user_id = ?').get(userId);
    assert.equal(exerciseCount, 1);
    assert.equal(versionCount, 1);

    const list = exercises.list(db, userId, unit.id);
    assert.equal(list.length, 1);
    assert.equal(list[0].currentVersion.answer, 'PA elevada');
  } finally { cleanup(); }
});

test('invalid provenance is rejected and creates no rows', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const unit = makeUnit(db, userId);
    assert.throws(
      () => exercises.create(db, userId, { unitId: unit.id, question: 'Q', provenance: 'GUESSED' }),
      (err) => err.code === 'VALIDATION_FAILED' && err.field === 'provenance',
    );
    const { n } = db.prepare('SELECT COUNT(*) as n FROM exercises WHERE user_id = ?').get(userId);
    assert.equal(n, 0);
  } finally { cleanup(); }
});

test('empty question is rejected and creates no rows', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const unit = makeUnit(db, userId);
    assert.throws(
      () => exercises.create(db, userId, { unitId: unit.id, question: '   ', provenance: 'MANUAL' }),
      (err) => err.code === 'VALIDATION_FAILED' && err.field === 'question',
    );
    const { n } = db.prepare('SELECT COUNT(*) as n FROM exercise_versions WHERE user_id = ?').get(userId);
    assert.equal(n, 0);
  } finally { cleanup(); }
});

test('editing appends a new version, preserves the old one unchanged, and getVersion still resolves the original by id', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const unit = makeUnit(db, userId);
    const created = exercises.create(db, userId, { unitId: unit.id, question: 'v1 question', answer: 'v1 answer', provenance: 'MANUAL' });
    const v1Id = created.currentVersion.id;

    const edited = exercises.edit(db, userId, created.id, { question: 'v2 question', answer: 'v2 answer', provenance: 'AI_GENERATED' });
    assert.equal(edited.currentVersion.question, 'v2 question');
    assert.notEqual(edited.currentVersion.id, v1Id);

    const { n } = db.prepare('SELECT COUNT(*) as n FROM exercise_versions WHERE user_id = ? AND exercise_id = ?').get(userId, created.id);
    assert.equal(n, 2, 'editing must append, never overwrite, a version row');

    const originalStillResolves = exercises.getVersion(db, userId, v1Id);
    assert.equal(originalStillResolves.question, 'v1 question');
    assert.equal(originalStillResolves.answer, 'v1 answer');
  } finally { cleanup(); }
});

test('T22: edit() is a real partial update — omitted fields (e.g. provenance) carry over from the current version, matching every other update endpoint here', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'z@example.com');
    const unit = makeUnit(db, userId);
    const created = exercises.create(db, userId, { unitId: unit.id, question: 'Original', answer: 'A1', hint: 'H1', provenance: 'SOURCE' });

    // src/app.js's real "save-exercise-edit" handler only ever sends
    // questionText/answerText/hintText, never provenance — this must not
    // be rejected as if provenance were required on every edit.
    const edited = exercises.edit(db, userId, created.id, { question: 'Updated', answer: 'A2', hint: 'H2' });
    assert.equal(edited.currentVersion.question, 'Updated');
    assert.equal(edited.currentVersion.provenance, 'SOURCE', 'provenance must carry over unchanged when omitted');

    const hintOnly = exercises.edit(db, userId, created.id, { hint: 'H3' });
    assert.equal(hintOnly.currentVersion.hint, 'H3');
    assert.equal(hintOnly.currentVersion.question, 'Updated', 'question must carry over unchanged when omitted');
    assert.equal(hintOnly.currentVersion.answer, 'A2', 'answer must carry over unchanged when omitted');
    assert.equal(hintOnly.currentVersion.provenance, 'SOURCE');
  } finally { cleanup(); }
});

test('archiving an exercise does not corrupt an existing version reference; reactivate restores it to the active list', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const unit = makeUnit(db, userId);
    const created = exercises.create(db, userId, { unitId: unit.id, question: 'Q', provenance: 'SOURCE' });
    const versionId = created.currentVersion.id;

    const archived = exercises.archive(db, userId, created.id);
    assert.ok(archived.archivedAt);
    assert.deepEqual(exercises.list(db, userId, unit.id), [], 'archived items are excluded from the default list');
    assert.equal(exercises.list(db, userId, unit.id, { includeArchived: true }).length, 1);

    const versionAfterArchive = exercises.getVersion(db, userId, versionId);
    assert.equal(versionAfterArchive.question, 'Q', 'archiving the exercise must not touch its version rows');

    const reactivated = exercises.reactivate(db, userId, created.id);
    assert.equal(reactivated.archivedAt, null);
    assert.equal(exercises.list(db, userId, unit.id).length, 1);
  } finally { cleanup(); }
});

test('reorder is deterministic and rejects a foreign-owned id in the list without effect', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'f@example.com');
    const userB = makeUser(db, 'g@example.com');
    const unitA = makeUnit(db, userA);
    const e1 = exercises.create(db, userA, { unitId: unitA.id, question: 'Q1', provenance: 'MANUAL' });
    const e2 = exercises.create(db, userA, { unitId: unitA.id, question: 'Q2', provenance: 'MANUAL' });

    const unitB = makeUnit(db, userB);
    const foreign = exercises.create(db, userB, { unitId: unitB.id, question: 'Foreign', provenance: 'MANUAL' });

    assert.throws(
      () => exercises.reorder(db, userA, unitA.id, [foreign.id, e1.id, e2.id]),
      (err) => err.code === 'NOT_FOUND',
    );
    // No effect: original order preserved.
    const untouched = exercises.list(db, userA, unitA.id);
    assert.deepEqual(untouched.map(e => e.id), [e1.id, e2.id]);

    const reordered = exercises.reorder(db, userA, unitA.id, [e2.id, e1.id]);
    assert.deepEqual(reordered.map(e => e.id), [e2.id, e1.id]);
  } finally { cleanup(); }
});

test('a user cannot read, edit, archive, or reorder an exercise owned by another user', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'h@example.com');
    const userB = makeUser(db, 'i@example.com');
    const unitA = makeUnit(db, userA);
    const exercise = exercises.create(db, userA, { unitId: unitA.id, question: 'Q', provenance: 'MANUAL' });

    assert.throws(() => exercises.getById(db, userB, exercise.id), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => exercises.edit(db, userB, exercise.id, { question: 'hacked', provenance: 'MANUAL' }), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => exercises.archive(db, userB, exercise.id), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => exercises.list(db, userB, unitA.id), (err) => err.code === 'NOT_FOUND');
    assert.throws(() => exercises.getVersion(db, userB, exercise.currentVersion.id), (err) => err.code === 'NOT_FOUND');
  } finally { cleanup(); }
});

test('HTTP: full owned CRUD/order lifecycle over real HTTP with a real session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-exercises-http-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  try {
    const email = 'httpexercises@example.com';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const cookie = loginRes.headers['set-cookie'].split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    const csrfToken = JSON.parse(me.body).csrfToken;

    const unitRes = await app.inject({
      method: 'POST', url: '/v1/learning-units', headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { newSubjectName: 'HTTP Exercise Subject', title: 'Aula HTTP', studyDate: '2026-01-01' },
    });
    const unitId = JSON.parse(unitRes.body).unit.id;

    const createRes = await app.inject({
      method: 'POST', url: `/v1/learning-units/${unitId}/exercises`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { question: 'Pergunta HTTP', answer: 'Resposta', provenance: 'MANUAL' },
    });
    assert.equal(createRes.statusCode, 201);
    const exerciseId = JSON.parse(createRes.body).exercise.id;

    const editRes = await app.inject({
      method: 'PATCH', url: `/v1/exercises/${exerciseId}`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { question: 'Pergunta editada', provenance: 'AI_GENERATED' },
    });
    assert.equal(editRes.statusCode, 200);
    assert.equal(JSON.parse(editRes.body).exercise.currentVersion.question, 'Pergunta editada');

    const archiveRes = await app.inject({
      method: 'PATCH', url: `/v1/exercises/${exerciseId}`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken },
      payload: { isArchived: true },
    });
    assert.equal(archiveRes.statusCode, 200);
    assert.ok(JSON.parse(archiveRes.body).exercise.archivedAt);

    const listRes = await app.inject({ method: 'GET', url: `/v1/learning-units/${unitId}/exercises`, headers: { cookie } });
    assert.equal(JSON.parse(listRes.body).exercises.length, 0, 'archived exercise excluded from default list');
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
