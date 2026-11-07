// Class E-021 audit (2026-11-07): what happens when a creating route receives the same request twice at once
// (double submit, or a retry after a lost reply). subjects and exams are safe by state; exercises and EXTERNAL evidence
// are safe through an opt-in operationKey (services/idempotency.js, as in attempts.start()). No key = unchanged behaviour.
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
const ORIGIN = 'https://smartlearn.test';

async function withSignedInApp(run) {
  const dir = mkdtempSync(join(tmpdir(), 'sl-creators-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN] });
  try {
    const email = 'creators@example.com';
    const password = 'a genuinely long test password 1';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: ORIGIN }, payload: { email, password } });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: { email, password } });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const csrfToken = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
    const headers = { origin: ORIGIN, cookie, 'x-csrf-token': csrfToken };
    const post = (url, payload) => app.inject({ method: 'POST', url: `/v1${url}`, headers, payload });
    const count = (sql, ...args) => db.prepare(sql).get(...args).n;
    const unit = JSON.parse((await post('/learning-units', { newSubjectName: 'Farmacologia', title: 'Aula 1', studyDate: '2026-01-01' })).body).unit;
    await run({ post, count, unit });
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

test('POST /subjects: two simultaneous identical creates make ONE subject (the second is a 409)', async () => {
  await withSignedInApp(async ({ post, count }) => {
    const before = count('SELECT COUNT(*) AS n FROM subjects');
    const [a, b] = await Promise.all([post('/subjects', { name: 'Anatomia' }), post('/subjects', { name: 'Anatomia' })]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
    assert.equal(count('SELECT COUNT(*) AS n FROM subjects'), before + 1);
  });
});

test('POST /exams: two simultaneous starts for the same unit make ONE exam (the second resumes it)', async () => {
  await withSignedInApp(async ({ post, count, unit }) => {
    await post(`/learning-units/${unit.id}/exercises`, { question: 'O que é hipertensão?', answer: 'PA elevada', provenance: 'MANUAL' });
    const [a, b] = await Promise.all([post('/exams', { unitId: unit.id }), post('/exams', { unitId: unit.id })]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 201]);
    assert.equal(count('SELECT COUNT(*) AS n FROM exams'), 1);
  });
});

test('POST /learning-units/:unitId/exercises: the same operationKey twice creates ONE exercise', async () => {
  await withSignedInApp(async ({ post, count, unit }) => {
    const payload = { question: 'O que é hipertensão?', answer: 'PA elevada', provenance: 'MANUAL', operationKey: 'k-exercise-1' };
    const url = `/learning-units/${unit.id}/exercises`;
    const [a, b] = await Promise.all([post(url, payload), post(url, payload)]);
    assert.equal(a.statusCode, 201);
    assert.equal(b.statusCode, 201);
    assert.equal(JSON.parse(a.body).exercise.id, JSON.parse(b.body).exercise.id);
    assert.equal(count('SELECT COUNT(*) AS n FROM exercises WHERE unit_id = ?', unit.id), 1);

    const conflict = await post(url, { ...payload, question: 'Outra pergunta?' });
    assert.equal(conflict.statusCode, 409);
    assert.equal(JSON.parse(conflict.body).error.code, 'IDEMPOTENCY_CONFLICT');

    const { operationKey: _key, ...withoutKey } = payload;
    await post(url, withoutKey);
    await post(url, withoutKey);
    assert.equal(count('SELECT COUNT(*) AS n FROM exercises WHERE unit_id = ?', unit.id), 3, 'no key keeps the old behaviour: every call creates');
  });
});

test('POST /learning-evidence (EXTERNAL): the same operationKey twice records ONE evidence', async () => {
  await withSignedInApp(async ({ post, count, unit }) => {
    const payload = { unitId: unit.id, type: 'EXTERNAL', questionsCount: 10, correctCount: 7, evidenceDate: '2026-01-01', operationKey: 'k-evidence-1' };
    const [a, b] = await Promise.all([post('/learning-evidence', payload), post('/learning-evidence', payload)]);
    assert.equal(a.statusCode, 201);
    assert.equal(b.statusCode, 201);
    assert.equal(JSON.parse(a.body).evidence.id, JSON.parse(b.body).evidence.id);
    assert.equal(count('SELECT COUNT(*) AS n FROM learning_evidence WHERE unit_id = ?', unit.id), 1);

    const conflict = await post('/learning-evidence', { ...payload, correctCount: 9 });
    assert.equal(conflict.statusCode, 409);
    assert.equal(JSON.parse(conflict.body).error.code, 'IDEMPOTENCY_CONFLICT');
    assert.equal(count('SELECT COUNT(*) AS n FROM learning_evidence WHERE unit_id = ?', unit.id), 1);

    const { operationKey: _key, ...withoutKey } = payload;
    await post('/learning-evidence', withoutKey);
    assert.equal(count('SELECT COUNT(*) AS n FROM learning_evidence WHERE unit_id = ?', unit.id), 2, 'no key keeps the old behaviour: every call records');
  });
});

test('POST /learning-evidence (INITIAL_PRACTICE, no attemptIds): same key = ONE record, different keys = two legitimate records', async () => {
  await withSignedInApp(async ({ post, count, unit }) => {
    const payload = { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 5, correctCount: 4, evidenceDate: '2026-01-01', operationKey: 'k-initial-1' };
    const [a, b] = await Promise.all([post('/learning-evidence', payload), post('/learning-evidence', payload)]);
    assert.equal(a.statusCode, 201);
    assert.equal(b.statusCode, 201);
    assert.equal(JSON.parse(a.body).evidence.id, JSON.parse(b.body).evidence.id);
    assert.equal(count('SELECT COUNT(*) AS n FROM learning_evidence WHERE unit_id = ?', unit.id), 1);

    const conflict = await post('/learning-evidence', { ...payload, correctCount: 5 });
    assert.equal(conflict.statusCode, 409);
    assert.equal(JSON.parse(conflict.body).error.code, 'IDEMPOTENCY_CONFLICT');

    const another = await post('/learning-evidence', { ...payload, operationKey: 'k-initial-2' });
    assert.equal(another.statusCode, 201);
    assert.equal(count('SELECT COUNT(*) AS n FROM learning_evidence WHERE unit_id = ?', unit.id), 2, 'a second real block of practice (new key) is a new record');
  });
});

test('POST /learning-evidence (INITIAL_PRACTICE, with attemptIds): the retry returns the first record instead of being refused', async () => {
  await withSignedInApp(async ({ post, count, unit }) => {
    const exercise = JSON.parse((await post(`/learning-units/${unit.id}/exercises`, { question: 'Defina taquicardia.', answer: 'FC acima de 100 bpm', provenance: 'MANUAL' })).body).exercise;
    const attempt = JSON.parse((await post(`/exercises/${exercise.id}/attempts`, {})).body).attempt;
    const submitted = await post(`/attempts/${attempt.id}/submit`, { outcome: 'CORRECT', assessmentMethod: 'SELF_REPORT' });
    assert.equal(submitted.statusCode, 200);
    const payload = { unitId: unit.id, type: 'INITIAL_PRACTICE', questionsCount: 1, correctCount: 1, evidenceDate: '2026-01-01', attemptIds: [attempt.id], operationKey: 'k-initial-attempts' };
    const first = await post('/learning-evidence', payload);
    assert.equal(first.statusCode, 201);
    const retry = await post('/learning-evidence', payload);
    assert.equal(retry.statusCode, 201, 'a replay of the same intent is answered from the stored result');
    assert.equal(JSON.parse(retry.body).evidence.id, JSON.parse(first.body).evidence.id);
    assert.equal(count('SELECT COUNT(*) AS n FROM learning_evidence WHERE unit_id = ?', unit.id), 1);
    const withoutKey = await post('/learning-evidence', { ...payload, operationKey: undefined });
    assert.equal(withoutKey.statusCode, 400, 'without a key the old protection stays: an attempt already linked cannot be linked again');
  });
});
