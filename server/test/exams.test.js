import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as exams from '../src/services/exams.js';
import * as exercises from '../src/services/exercises.js';
import * as learningUnits from '../src/services/learning-units.js';

// EXAM-1: Modo Prova. The guarantee under test is SERVER-SIDE: while an exam is IN_PROGRESS the
// response never contains the gabarito, explanation, hint, sources, judgement or score.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

const SECRETS = ['GABARITO-UNICO-1', 'EXPLICACAO-UNICA-1', 'DICA-UNICA-1'];

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-exams-'));
  const db = openDb(join(dir, 'test.db'));
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

function unitWithExercises(db, userId, count = 3) {
  const { unit } = learningUnits.create(db, userId, { newSubjectName: `Disc ${Math.random()}`, title: 'Aula prova', summaryBody: 'r', studyDate: '2026-03-01' });
  for (let i = 1; i <= count; i += 1) {
    exercises.create(db, userId, {
      unitId: unit.id, question: `Pergunta ${i}?`, answer: `GABARITO-UNICO-${i}`, explanation: `EXPLICACAO-UNICA-${i}`, hint: `DICA-UNICA-${i}`, provenance: 'MANUAL',
    });
  }
  return unit;
}

const FORBIDDEN_KEYS = ['answer', 'explanation', 'hint', 'citations', 'outcome', 'score', 'correctedAt', 'submittedAt'];

test('an exam in progress exposes ONLY the questions and the student own answers — no gabarito, explanation, hint, source, judgement or score', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const unit = unitWithExercises(db, userId, 3);
    const { exam, resumed } = exams.start(db, userId, { unitId: unit.id });
    assert.equal(resumed, false);
    assert.equal(exam.status, 'IN_PROGRESS');
    assert.equal(exam.questionCount, 3);
    assert.deepEqual(exam.items.map((i) => i.question), ['Pergunta 1?', 'Pergunta 2?', 'Pergunta 3?']);

    const json = JSON.stringify(exam);
    for (const secret of SECRETS) assert.ok(!json.includes(secret), `${secret} must not appear in an in-progress exam`);
    for (const key of FORBIDDEN_KEYS) {
      assert.ok(!(key in exam), `exam.${key} must not exist while in progress`);
      for (const item of exam.items) assert.ok(!(key in item), `item.${key} must not exist while in progress`);
    }
  } finally { cleanup(); }
});

test('answers are saved per item, survive a re-read, and starting again RESUMES the same exam instead of creating another', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const unit = unitWithExercises(db, userId, 3);
    const { exam } = exams.start(db, userId, { unitId: unit.id });
    exams.saveAnswer(db, userId, exam.id, exam.items[0].id, { answer: 'minha resposta 1' });
    const saved = exams.saveAnswer(db, userId, exam.id, exam.items[2].id, { answer: 'minha resposta 3' });
    assert.equal(saved.answeredCount, 2);
    // overwriting and clearing
    exams.saveAnswer(db, userId, exam.id, exam.items[0].id, { answer: 'resposta 1 revista' });
    exams.saveAnswer(db, userId, exam.id, exam.items[2].id, { answer: '   ' });

    const again = exams.start(db, userId, { unitId: unit.id });
    assert.equal(again.resumed, true);
    assert.equal(again.exam.id, exam.id);
    assert.deepEqual(again.exam.items.map((i) => i.studentAnswer), ['resposta 1 revista', null, null]);
    assert.equal(again.exam.answeredCount, 1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM exams WHERE user_id = ?').get(userId).n, 1);
  } finally { cleanup(); }
});

test('submit locks the answers and only THEN returns the correction data (gabarito, explanation, hint, sources); submitting again changes nothing', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const unit = unitWithExercises(db, userId, 2);
    const { exam } = exams.start(db, userId, { unitId: unit.id });
    exams.saveAnswer(db, userId, exam.id, exam.items[0].id, { answer: 'x' });
    const submitted = exams.submit(db, userId, exam.id, () => new Date('2026-04-01T10:00:00Z'));
    assert.equal(submitted.status, 'SUBMITTED');
    assert.equal(submitted.submittedAt, '2026-04-01T10:00:00.000Z');
    assert.equal(submitted.items[0].answer, 'GABARITO-UNICO-1');
    assert.equal(submitted.items[0].explanation, 'EXPLICACAO-UNICA-1');
    assert.equal(submitted.items[0].hint, 'DICA-UNICA-1');
    assert.equal(submitted.items[0].studentAnswer, 'x');
    assert.deepEqual(submitted.items[0].citations, []);
    assert.equal(submitted.score, null, 'no score until the student has judged every item (EXAM-2)');

    const again = exams.submit(db, userId, exam.id, () => new Date('2027-01-01T00:00:00Z'));
    assert.equal(again.submittedAt, '2026-04-01T10:00:00.000Z', 'a second submit does not move the timestamp');
    assert.throws(() => exams.saveAnswer(db, userId, exam.id, exam.items[0].id, { answer: 'tarde demais' }), (e) => e.code === 'INVALID_STATE');
    assert.equal(exams.get(db, userId, exam.id).items[0].studentAnswer, 'x', 'locked answers are unchanged');
    // after submission a new start begins a NEW exam
    const next = exams.start(db, userId, { unitId: unit.id });
    assert.equal(next.resumed, false);
    assert.notEqual(next.exam.id, exam.id);
  } finally { cleanup(); }
});

test('an exam captures the exercise VERSION it showed: a later edit or archive never changes a submitted exam', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const unit = unitWithExercises(db, userId, 2);
    const { exam } = exams.start(db, userId, { unitId: unit.id });
    const [first, second] = exercises.list(db, userId, unit.id);
    exercises.edit(db, userId, first.id, { question: 'EDITADA depois de iniciar?', answer: 'RESPOSTA NOVA' });
    exercises.archive(db, userId, second.id);
    const submitted = exams.submit(db, userId, exam.id);
    assert.equal(submitted.items.length, 2);
    assert.equal(submitted.items[0].question, 'Pergunta 1?');
    assert.equal(submitted.items[0].answer, 'GABARITO-UNICO-1');
    assert.equal(submitted.items[1].question, 'Pergunta 2?');
  } finally { cleanup(); }
});

test('archived exercises are not on a new exam; a unit with no exercises cannot start one; ownership is enforced everywhere', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const otherId = makeUser(db, 'e2@example.com');
    const empty = learningUnits.create(db, userId, { newSubjectName: 'Vazia', title: 'Sem exercícios', summaryBody: 'r', studyDate: '2026-03-01' }).unit;
    assert.throws(() => exams.start(db, userId, { unitId: empty.id }), (e) => e.code === 'NO_QUESTIONS');

    const unit = unitWithExercises(db, userId, 3);
    exercises.archive(db, userId, exercises.list(db, userId, unit.id)[1].id);
    const { exam } = exams.start(db, userId, { unitId: unit.id });
    assert.deepEqual(exam.items.map((i) => i.question), ['Pergunta 1?', 'Pergunta 3?']);

    assert.throws(() => exams.start(db, otherId, { unitId: unit.id }), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => exams.get(db, otherId, exam.id), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => exams.saveAnswer(db, otherId, exam.id, exam.items[0].id, { answer: 'x' }), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => exams.submit(db, otherId, exam.id), (e) => e.code === 'NOT_FOUND');
    // an item id of another exam cannot be written through this exam
    const other = unitWithExercises(db, userId, 1);
    const otherExam = exams.start(db, userId, { unitId: other.id }).exam;
    assert.throws(() => exams.saveAnswer(db, userId, exam.id, otherExam.items[0].id, { answer: 'x' }), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => exams.saveAnswer(db, userId, exam.id, exam.items[0].id, { answer: 42 }), (e) => e.code === 'VALIDATION_FAILED');
  } finally { cleanup(); }
});

test('HTTP: the wire response of an in-progress exam carries none of the gabarito/explanation/hint; after submit it does; edits after submit are 409', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-exams-http-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  try {
    const email = 'exam-http@example.com';
    const password = 'a genuinely long test password 1';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
    const post = (url, payload) => app.inject({ method: 'POST', url, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, payload });

    const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    const unit = unitWithExercises(db, userId, 2);

    const started = await post('/v1/exams', { unitId: unit.id });
    assert.equal(started.statusCode, 201);
    for (const secret of SECRETS) assert.ok(!started.body.includes(secret), `${secret} leaked over HTTP at start`);
    const exam = JSON.parse(started.body).exam;

    const fetched = await app.inject({ method: 'GET', url: `/v1/exams/${exam.id}`, headers: { cookie } });
    for (const secret of SECRETS) assert.ok(!fetched.body.includes(secret), `${secret} leaked over HTTP on GET`);

    const saved = await app.inject({ method: 'PUT', url: `/v1/exams/${exam.id}/items/${exam.items[0].id}/answer`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, payload: { answer: 'resposta do aluno' } });
    assert.equal(saved.statusCode, 200);
    for (const secret of SECRETS) assert.ok(!saved.body.includes(secret));

    const resumed = await post('/v1/exams', { unitId: unit.id });
    assert.equal(resumed.statusCode, 200);
    assert.equal(JSON.parse(resumed.body).resumed, true);

    const submitted = await post(`/v1/exams/${exam.id}/submit`, {});
    assert.equal(submitted.statusCode, 200);
    for (const secret of SECRETS.slice(0, 1)) assert.ok(submitted.body.includes(secret), 'after submit the correction data is available');
    assert.ok(submitted.body.includes('EXPLICACAO-UNICA-1'));

    const late = await app.inject({ method: 'PUT', url: `/v1/exams/${exam.id}/items/${exam.items[0].id}/answer`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, payload: { answer: 'tarde' } });
    assert.equal(late.statusCode, 409);

    const empty = await post('/v1/exams', { unitId: 999999 });
    assert.equal(empty.statusCode, 404);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
