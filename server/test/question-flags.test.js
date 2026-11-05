// "Questao com problema": after answering, the student marks a question as problematic (reason + optional comment) and can take the mark back.
// A mark is an annotation: it never changes a grade, learning evidence or a statistic, it is append-only and reversible. Disposable database only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as attempts from '../src/services/attempts.js';
import * as flags from '../src/services/question-flags.js';
import * as learningUnits from '../src/services/learning-units.js';
import * as exercises from '../src/services/exercises.js';
import * as evidence from '../src/services/evidence.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-qflag-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, dir, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const makeUser = (db, email) => {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
};
// one unit, two exercises; helper answers an exercise (start + submit) and returns the attempt id
function seed(db, email = 'q@example.com') {
  const userId = makeUser(db, email);
  const { unit } = learningUnits.create(db, userId, { newSubjectName: 'Farmacologia', title: 'Aula 1', studyDate: '2026-10-01' });
  const a = exercises.create(db, userId, { unitId: unit.id, question: 'O que é hipertensão?', answer: 'PA elevada', provenance: 'MANUAL' });
  const b = exercises.create(db, userId, { unitId: unit.id, question: 'O que é hipotensão?', answer: 'PA baixa', provenance: 'MANUAL' });
  const answer = (exerciseId, outcome = 'INCORRECT') => {
    const attempt = attempts.start(db, userId, { exerciseId });
    attempts.submit(db, userId, attempt.id, { outcome, assessmentMethod: 'SELF_REPORT' });
    return attempt.id;
  };
  return { userId, unitId: unit.id, a, b, answer };
}
// every table a mark must NOT touch, as plain data
const LEARNING_TABLES = ['learning_events', 'learning_evidence', 'exercise_attempts', 'exercise_versions', 'exercises', 'review_tasks', 'learning_units', 'competencies', 'exams', 'exam_items', 'exam_evidence'];
const ledger = (db) => Object.fromEntries(LEARNING_TABLES.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()]));
const events = (db) => db.prepare('SELECT * FROM exercise_flag_events ORDER BY id').all();

test('an answered question can be marked with a reason from the short list; the mark names the attempt and comes back in the list', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, a, answer } = seed(db);
    const attemptId = answer(a.id);
    const mark = flags.flagFromAttempt(db, userId, attemptId, { reason: 'DOUBTFUL_ANSWER_KEY', comment: '  Acho que o gabarito está errado  ' }, () => new Date('2026-11-04T12:00:00Z'));
    assert.deepEqual(mark, { exerciseId: a.id, attemptId, reason: 'DOUBTFUL_ANSWER_KEY', comment: 'Acho que o gabarito está errado', flaggedAt: '2026-11-04T12:00:00.000Z' });
    assert.deepEqual(flags.list(db, userId), [mark]);
    // every reason of the list is accepted; an empty comment is stored as no comment
    for (const reason of ['CONFUSING_STATEMENT', 'CONTENT_ERROR', 'OTHER']) assert.equal(flags.flagFromAttempt(db, userId, attemptId, { reason, comment: '   ' }).comment, null);
  } finally { cleanup(); }
});

test('marking needs an ANSWERED attempt of the student: an open, unknown or foreign attempt is refused and nothing is written', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, a } = seed(db);
    const open = attempts.start(db, userId, { exerciseId: a.id });
    assert.throws(() => flags.flagFromAttempt(db, userId, open.id, { reason: 'OTHER' }), (e) => e.code === 'VALIDATION_FAILED' && e.msg?.code === 'ATTEMPT_NOT_SUBMITTED' && e.field === 'attemptId');
    assert.throws(() => flags.flagFromAttempt(db, userId, 99999, { reason: 'OTHER' }), (e) => e.code === 'NOT_FOUND' && e.msg?.code === 'ATTEMPT_NOT_FOUND');
    const other = seed(db, 'other@example.com');
    const foreign = other.answer(other.a.id);
    assert.throws(() => flags.flagFromAttempt(db, userId, foreign, { reason: 'OTHER' }), (e) => e.code === 'NOT_FOUND', 'another student\'s attempt looks like it does not exist');
    assert.equal(events(db).length, 0);
  } finally { cleanup(); }
});

test('an unknown reason or a comment over 500 characters is refused and nothing is written', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, a, answer } = seed(db);
    const attemptId = answer(a.id);
    for (const reason of [undefined, '', 'BAD', 'other', 5]) assert.throws(() => flags.flagFromAttempt(db, userId, attemptId, { reason }), (e) => e.code === 'VALIDATION_FAILED' && e.field === 'reason', String(reason));
    assert.throws(() => flags.flagFromAttempt(db, userId, attemptId, { reason: 'OTHER', comment: 'x'.repeat(501) }), (e) => e.code === 'VALIDATION_FAILED' && e.field === 'comment');
    assert.equal(flags.flagFromAttempt(db, userId, attemptId, { reason: 'OTHER', comment: 'x'.repeat(500) }).comment.length, 500);
    assert.equal(events(db).length, 1);
  } finally { cleanup(); }
});

test('marking and unmarking never change a grade, learning evidence, an attempt or any statistic source', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, unitId, a, b, answer } = seed(db);
    const wrong = answer(a.id, 'INCORRECT');
    const right = answer(b.id, 'CORRECT');
    evidence.create(db, userId, { unitId, type: 'INITIAL_PRACTICE', questionsCount: 2, correctCount: 1, evidenceDate: '2026-11-04', attemptIds: [wrong, right] });
    const before = ledger(db);
    assert.ok(before.learning_events.length === 2 && before.learning_evidence.length === 1, 'fixture holds real evidence');

    flags.flagFromAttempt(db, userId, wrong, { reason: 'CONFUSING_STATEMENT', comment: 'enunciado ambíguo' });
    flags.flagFromAttempt(db, userId, right, { reason: 'CONTENT_ERROR' });
    assert.deepEqual(ledger(db), before, 'after marking');
    flags.clear(db, userId, a.id);
    flags.clear(db, userId, b.id);
    assert.deepEqual(ledger(db), before, 'after unmarking');
    assert.equal(events(db).length, 4);
  } finally { cleanup(); }
});

test('a mark is reversible and append-only: unmarking adds a CLEAR row, repeating it adds nothing, and the question can be marked again', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, a, b, answer } = seed(db);
    const attemptId = answer(a.id);
    flags.flagFromAttempt(db, userId, attemptId, { reason: 'OTHER', comment: 'primeira' });
    flags.flagFromAttempt(db, userId, attemptId, { reason: 'CONTENT_ERROR' }); // marking again replaces reason and comment
    assert.deepEqual(flags.list(db, userId).map((f) => [f.exerciseId, f.reason, f.comment]), [[a.id, 'CONTENT_ERROR', null]]);

    assert.equal(flags.clear(db, userId, a.id), null);
    assert.deepEqual(flags.list(db, userId), []);
    flags.clear(db, userId, a.id);
    flags.clear(db, userId, b.id); // never marked: nothing to take back
    assert.deepEqual(events(db).map((e) => e.action), ['FLAG', 'FLAG', 'CLEAR']);

    flags.flagFromAttempt(db, userId, attemptId, { reason: 'DOUBTFUL_ANSWER_KEY' });
    assert.deepEqual(flags.list(db, userId).map((f) => f.reason), ['DOUBTFUL_ANSWER_KEY']);
    assert.throws(() => flags.clear(db, userId, 99999), (e) => e.code === 'NOT_FOUND' && e.msg?.code === 'EXERCISE_NOT_FOUND');
  } finally { cleanup(); }
});

test('the mark belongs to the question the attempt answered, and the latest mark of a question wins whatever attempt made it', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, a, b, answer } = seed(db);
    const first = answer(a.id);
    const second = answer(a.id, 'CORRECT'); // answered again later
    const other = answer(b.id);
    flags.flagFromAttempt(db, userId, first, { reason: 'OTHER' });
    assert.deepEqual(flags.list(db, userId).map((f) => f.exerciseId), [a.id], 'b was not marked');
    flags.flagFromAttempt(db, userId, second, { reason: 'CONTENT_ERROR' });
    flags.flagFromAttempt(db, userId, other, { reason: 'OTHER' });
    assert.deepEqual(flags.list(db, userId).map((f) => [f.exerciseId, f.attemptId, f.reason]), [[a.id, second, 'CONTENT_ERROR'], [b.id, other, 'OTHER']]);
  } finally { cleanup(); }
});

test('the table is append-only and refuses a mark without an attempt, a CLEAR with a reason and an unknown reason (database level)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const { userId, a, answer } = seed(db);
    flags.flagFromAttempt(db, userId, answer(a.id), { reason: 'OTHER' });
    assert.throws(() => db.prepare("UPDATE exercise_flag_events SET reason = 'OTHER'").run(), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM exercise_flag_events').run(), /append-only/);
    const insert = (action, reason, attemptId) => db.prepare('INSERT INTO exercise_flag_events (user_id, exercise_id, attempt_id, action, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, a.id, attemptId, action, reason, 'now');
    assert.throws(() => insert('FLAG', 'OTHER', null), /CHECK/);
    assert.throws(() => insert('FLAG', null, 1), /CHECK/);
    assert.throws(() => insert('CLEAR', 'OTHER', null), /CHECK/);
    assert.throws(() => insert('FLAG', 'NOPE', 1), /CHECK/);
    assert.throws(() => insert('FLAG', 'OTHER', 424242), /FOREIGN KEY/);
    assert.equal(events(db).length, 1);
  } finally { cleanup(); }
});

test('migration 040 is additive: on a database at 039 it adds only exercise_flag_events and leaves every existing object and row untouched', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-qflag-mig-'));
  const upTo039 = join(dir, 'm039');
  mkdirSync(upTo039);
  for (const file of readdirSync(MIGRATIONS_DIR)) if (!file.startsWith('040-')) copyFileSync(join(MIGRATIONS_DIR, file), join(upTo039, file));
  const db = openDb(join(dir, 'test.db'));
  try {
    runMigrations(db, upTo039);
    const { userId, a, answer } = seed(db);
    answer(a.id);
    const objects = () => Object.fromEntries(db.prepare("SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all().map((r) => [r.name, r.sql]));
    const rows = () => Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => [r.name, db.prepare(`SELECT * FROM "${r.name}" ORDER BY rowid`).all()]));
    const objectsBefore = objects();
    const rowsBefore = rows();
    assert.equal(objectsBefore.exercise_flag_events, undefined);

    runMigrations(db, MIGRATIONS_DIR);
    const objectsAfter = objects();
    for (const [name, sql] of Object.entries(objectsBefore)) assert.equal(objectsAfter[name], sql, `${name} is unchanged`);
    assert.deepEqual(Object.keys(objectsAfter).filter((name) => !(name in objectsBefore)).sort(), ['exercise_flag_events', 'exercise_flag_events_no_delete', 'exercise_flag_events_no_update', 'idx_exercise_flag_events_exercise']);
    const rowsAfter = rows();
    delete rowsAfter.exercise_flag_events;
    delete rowsAfter.schema_migrations;
    delete rowsBefore.schema_migrations;
    assert.deepEqual(rowsAfter, rowsBefore, 'no existing row changed');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM exercise_flag_events').get().n, 0);
    assert.ok(userId);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('HTTP: the routes need a session and a CSRF token, are owner-scoped, validate input and leave the statistics sources byte-identical', async () => {
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
    const { unit } = learningUnits.create(db, aliceId, { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-10-01' });
    const exercise = exercises.create(db, aliceId, { unitId: unit.id, question: 'Qual é o hormônio da saciedade?', answer: 'Leptina', provenance: 'MANUAL' });
    const open = attempts.start(db, aliceId, { exerciseId: exercise.id });
    const done = attempts.start(db, aliceId, { exerciseId: exercise.id });
    attempts.submit(db, aliceId, done.id, { outcome: 'INCORRECT', assessmentMethod: 'SELF_REPORT' });

    const call = (s, method, url, body, extra = {}) => app.inject({ method, url: `/v1${url}`, headers: { origin: ORIGIN, 'content-type': 'application/json', ...(s ? { cookie: s.cookie, ...(extra.noCsrf ? {} : { 'x-csrf-token': s.csrf }) } : {}) }, payload: body ?? {} });
    const json = (res) => JSON.parse(res.body);
    const statistics = async () => ({
      evidence: (await call(alice, 'GET', '/learning-evidence')).body,
      agenda: (await call(alice, 'GET', '/agenda?date=2026-11-04')).body,
      signals: (await call(alice, 'GET', '/unit-signals')).body,
      reinforcement: (await call(alice, 'GET', '/reinforcement')).body,
      ledger: JSON.stringify(ledger(db)),
    });
    const statsBefore = await statistics();

    assert.equal((await call(null, 'GET', '/question-flags')).statusCode, 401);
    assert.equal((await call(null, 'POST', `/attempts/${done.id}/flag`, { reason: 'OTHER' })).statusCode, 401);
    assert.equal((await call(alice, 'POST', `/attempts/${done.id}/flag`, { reason: 'OTHER' }, { noCsrf: true })).statusCode, 403);
    assert.equal((await call(alice, 'POST', `/exercises/${exercise.id}/unflag`, {}, { noCsrf: true })).statusCode, 403);
    assert.equal((await call(alice, 'POST', `/attempts/${done.id}/flag`, {})).statusCode, 400, 'reason is required');
    const badReason = await call(alice, 'POST', `/attempts/${done.id}/flag`, { reason: 'NOPE' });
    assert.equal(badReason.statusCode, 400);
    assert.equal(json(badReason).error.field, 'reason');
    assert.equal((await call(alice, 'POST', `/attempts/${done.id}/flag`, { reason: 'OTHER', comment: 'y'.repeat(501) })).statusCode, 400);
    const notYet = await call(alice, 'POST', `/attempts/${open.id}/flag`, { reason: 'OTHER' });
    assert.equal(notYet.statusCode, 400);
    assert.equal(json(notYet).error.msg.code, 'ATTEMPT_NOT_SUBMITTED');
    assert.equal((await call(bob, 'POST', `/attempts/${done.id}/flag`, { reason: 'OTHER' })).statusCode, 404, 'bob cannot mark alice\'s question');
    assert.equal((await call(bob, 'POST', `/exercises/${exercise.id}/unflag`)).statusCode, 404);
    assert.equal(events(db).length, 0, 'every refusal wrote nothing');

    const ok = await call(alice, 'POST', `/attempts/${done.id}/flag`, { reason: 'CONFUSING_STATEMENT', comment: 'não entendi o que pergunta' });
    assert.equal(ok.statusCode, 201);
    assert.deepEqual({ ...json(ok).flag, flaggedAt: 'x' }, { exerciseId: exercise.id, attemptId: done.id, reason: 'CONFUSING_STATEMENT', comment: 'não entendi o que pergunta', flaggedAt: 'x' });
    assert.equal(json(await call(alice, 'GET', '/question-flags')).flags.length, 1);
    assert.deepEqual(json(await call(bob, 'GET', '/question-flags')).flags, [], 'bob sees none of alice\'s marks');

    const back = await call(alice, 'POST', `/exercises/${exercise.id}/unflag`);
    assert.equal(back.statusCode, 200);
    assert.equal(json(back).flag, null);
    assert.deepEqual(json(await call(alice, 'GET', '/question-flags')).flags, []);
    assert.deepEqual(await statistics(), statsBefore, 'grades, evidence, agenda and signals are exactly as before the mark');
  } finally { await app.close(); cleanup(); }
});

