import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { bankPracticeFor } from '../src/corpus/bank-practice.js';
import { buildApp } from '../src/app.js';
const ORIGIN = 'https://smartlearn.test';

// BANK PRACTICE on a SYNTHETIC database: extra questions for a lesson from the student's own accepted questions of OTHER lessons.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const NOW = new Date('2026-11-14T12:00:00.000Z');
const iso = (daysAgo) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-bank-practice-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
const user = (db, email) => db.prepare("INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at) VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)").run(email, email, iso(0), iso(0)).lastInsertRowid;

function lesson(db, userId, title) {
  const subject = db.prepare('SELECT id FROM subjects WHERE user_id = ?').get(userId)?.id
    ?? db.prepare('INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(userId, 'Fisiologia', iso(0), iso(0)).lastInsertRowid;
  return db.prepare('INSERT INTO learning_units (user_id, subject_id, title, study_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, subject, title, '2026-11-01', iso(0), iso(0)).lastInsertRowid;
}
function question(db, userId, unitId, text, answer = 'resposta') {
  const ex = db.prepare('INSERT INTO exercises (user_id, unit_id, order_index, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(userId, unitId, iso(0), iso(0)).lastInsertRowid;
  const ver = db.prepare("INSERT INTO exercise_versions (user_id, exercise_id, question, answer, provenance, created_at) VALUES (?, ?, ?, ?, 'AI_GENERATED', ?)").run(userId, ex, text, answer, iso(0)).lastInsertRowid;
  return { ex: Number(ex), ver: Number(ver) };
}

test('other lessons of the same account that match by text are offered; the lesson itself and other accounts never are', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = user(db, 'a@x.test'); const b = user(db, 'b@x.test');
    const target = lesson(db, a, 'Filtração glomerular');
    const other = lesson(db, a, 'Anatomia do rim e filtração');
    const unrelated = lesson(db, a, 'Potencial de ação cardíaco');
    question(db, a, target, 'Pergunta da própria aula sobre filtração glomerular?');
    const hit = question(db, a, other, 'Qual estrutura realiza a filtração do plasma?');
    question(db, a, unrelated, 'Qual íon inicia a despolarização do nó sinoatrial?');
    const foreign = lesson(db, b, 'Filtração glomerular');
    question(db, b, foreign, 'Pergunta de outra conta sobre filtração glomerular');

    const result = bankPracticeFor(db, a, target, { now: NOW });
    assert.deepEqual(result.items.map((i) => i.exerciseId), [hit.ex]);
    assert.equal(result.items[0].unitTitle, 'Anatomia do rim e filtração');
    assert.equal(result.lesson.title, 'Filtração glomerular');
    assert.equal(bankPracticeFor(db, b, target, { now: NOW }), null, 'a lesson of another account is not found');
  } finally { cleanup(); }
});

test('recently shown questions are skipped, archived ones never appear, and the limit is respected and capped', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = user(db, 'a@x.test');
    const target = lesson(db, a, 'Filtração glomerular');
    const other = lesson(db, a, 'Filtração e reabsorção tubular');
    const fresh = question(db, a, other, 'Pergunta nova sobre filtração tubular?');
    const shown = question(db, a, other, 'Pergunta já vista sobre filtração tubular?');
    const archived = question(db, a, other, 'Pergunta arquivada sobre filtração tubular?');
    db.prepare('UPDATE exercises SET archived_at = ? WHERE id = ?').run(iso(0), archived.ex);
    db.prepare('INSERT INTO exercise_attempts (user_id, unit_id, exercise_version_id, started_at) VALUES (?, ?, ?, ?)').run(a, other, shown.ver, iso(2));

    const ids = bankPracticeFor(db, a, target, { now: NOW }).items.map((i) => i.exerciseId);
    assert.deepEqual(ids, [fresh.ex]);
    for (let i = 0; i < 14; i += 1) question(db, a, other, `Mais uma pergunta ${i} sobre filtração e reabsorção?`);
    assert.equal(bankPracticeFor(db, a, target, { now: NOW, limit: 2 }).items.length, 2);
    assert.equal(bankPracticeFor(db, a, target, { now: NOW, limit: 999 }).items.length, 10, 'capped');
    assert.equal(bankPracticeFor(db, a, target, { now: NOW, limit: 0 }).items.length, 5, 'an invalid limit falls back to the default');
  } finally { cleanup(); }
});

test('an empty bank answers an empty list, not an error', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = user(db, 'a@x.test');
    const target = lesson(db, a, 'Filtração glomerular');
    assert.deepEqual(bankPracticeFor(db, a, target, { now: NOW }), { lesson: { id: Number(target), title: 'Filtração glomerular' }, bank: 0, items: [] });
  } finally { cleanup(); }
});

test('GET /v1/bank-practice: anonymous is 401, a lesson of another account is 404, bad parameters are 400, the owner gets the list', async () => {
  const { db, cleanup } = tmpDb();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN] });
  try {
    const pw = 'a genuinely long test password 1';
    const session = async (email) => {
      await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: ORIGIN }, payload: { email, password: pw } });
      const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: { email, password: pw } });
      return { cookie: login.headers['set-cookie'].split(';')[0] };
    };
    const alice = await session('alice@example.com'); const bob = await session('bob@example.com');
    const aliceId = db.prepare("SELECT id FROM users WHERE email = 'alice@example.com'").get().id;
    const target = lesson(db, aliceId, 'Filtração glomerular');
    const other = lesson(db, aliceId, 'Filtração e reabsorção tubular');
    const q = question(db, aliceId, other, 'Pergunta sobre filtração tubular?');
    const get = (s, query) => app.inject({ method: 'GET', url: `/v1/bank-practice${query}`, headers: s ? { cookie: s.cookie } : {} });
    assert.equal((await get(null, `?unitId=${target}`)).statusCode, 401);
    assert.equal((await get(bob, `?unitId=${target}`)).statusCode, 404);
    assert.equal((await get(alice, '?unitId=abc')).statusCode, 400);
    assert.equal((await get(alice, `?unitId=${target}&limit=1.5`)).statusCode, 400);
    const ok = await get(alice, `?unitId=${target}`);
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.json().items.map((i) => i.exerciseId), [q.ex]);
  } finally { await app.close(); cleanup(); }
});
