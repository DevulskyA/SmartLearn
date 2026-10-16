// T-F6-06b — persistence CONTRACT suite (DEBT-006, part 1).
//
// ONE set of behavioural cases (create / read / update / delete, ordering,
// stable ids) executed IDENTICALLY against every persistence adapter that
// T-F6-06a classified VIVO:
//
//   - "BrowserStore" : src/db.js createBrowserStore() — real code, real
//                      JSON round trip through a localStorage shim (the same
//                      shim every existing db.js test uses). Live: Web
//                      default (REMOTE_MODE unset/false, no Tauri runtime).
//   - "RemoteDB"     : src/remote-store.js -> src/api-client.js -> a REAL
//                      Fastify server on a real SQLite file (the exact
//                      pipeline Desktop uses, REMOTE_MODE=true + loopback).
//                      Nothing mocked: only a browser-like cookie/Origin
//                      shim, as test/remote-store.test.js already does.
//
// The Tauri-SQLite branch of src/db.js is MORTO (see the sensor at the end)
// and is not exercised here; IndexedDB (offline-store.js) is a read-through
// cache and sync is out of scope (spec §7).
//
// Only behaviour BOTH adapters promise is asserted. Known, deliberate shape
// differences (remote createWithReviews returns {unit,...} and generates the
// 16 reviews itself; local returns the unit and takes the review rows) are
// absorbed by the per-adapter `createUnit` helper below, never by loosening
// an assertion.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/src/db.js';
import { runMigrations } from '../server/src/migrations.js';
import { buildApp } from '../server/src/app.js';
import { generateReviewDates, REVIEW_DAY_OFFSETS } from '../shared/review-schedule.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../server/migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';

// -- harness: browser-ish globals ------------------------------------------
const lsStore = {};
globalThis.localStorage = {
  getItem: (key) => lsStore[key] ?? null,
  setItem: (key, value) => { lsStore[key] = value; },
  removeItem: (key) => { delete lsStore[key]; },
  clear: () => { for (const k of Object.keys(lsStore)) delete lsStore[k]; },
};

// -- harness: one real server for the RemoteDB adapter ---------------------
const dir = mkdtempSync(join(tmpdir(), 'sl-contract-'));
const db = openDb(join(dir, 'test.db'));
runMigrations(db, MIGRATIONS_DIR);
const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], trustProxy: true });
await app.listen({ port: 0, host: '127.0.0.1' });
globalThis.window = { __SMARTLEARN_API_BASE__: `http://127.0.0.1:${app.server.address().port}` };

const { setCsrfToken, apiRequest } = await import('../src/api-client.js');
const { DB: RemoteDB } = await import('../src/remote-store.js');
const { DB: LocalDB } = await import('../src/db.js');

const realFetch = globalThis.fetch;
test.after(async () => {
  globalThis.fetch = realFetch;
  await app.close();
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// Registration is rate-limited per client IP; every case gets a fresh account AND
// a distinct (proxied) client IP so the limiter never couples cases together.
function browserlikeFetch(origin, clientIp) {
  let cookie = null;
  return async (url, opts = {}) => {
    const headers = { ...opts.headers, Origin: origin, 'X-Forwarded-For': clientIp };
    if (cookie) headers.Cookie = cookie;
    const res = await realFetch(url, { ...opts, headers });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return res;
  };
}

let accountSeq = 0;

// -- adapters under contract ------------------------------------------------
// fresh(): returns an EMPTY store (no data from any previous case).
// createUnit(): the one place where the two adapters' entry points differ.
const adapters = [
  {
    name: 'BrowserStore',
    async fresh() {
      localStorage.clear();
      await LocalDB.init();
      return LocalDB;
    },
    async createUnit(store, { subjectId, title, studyDate }) {
      const tasks = generateReviewDates(studyDate).map((dueDate, i) => ({ reviewNumber: i + 1, dueDate }));
      const unit = await store.learningUnits.createWithReviews({ subjectId, title, studyDate, sourceText: '' }, tasks);
      return unit.id;
    },
  },
  {
    name: 'RemoteDB',
    async fresh() {
      accountSeq += 1;
      const email = `contract-${accountSeq}@example.com`;
      const password = 'a genuinely long test password 1';
      globalThis.fetch = browserlikeFetch(TEST_ORIGIN, `10.1.${Math.floor(accountSeq / 250)}.${accountSeq % 250 + 1}`);
      await apiRequest('/v1/auth/register', { method: 'POST', body: { email, password } });
      await apiRequest('/v1/auth/login', { method: 'POST', body: { email, password } });
      const me = await apiRequest('/v1/auth/me');
      setCsrfToken(me.csrfToken);
      return RemoteDB;
    },
    async createUnit(store, { subjectId, title, studyDate }) {
      const created = await store.learningUnits.createWithReviews({ subjectId, title, studyDate });
      return created.unit.id;
    },
    cleanup() { globalThis.fetch = realFetch; setCsrfToken(null); },
  },
];

const names = (rows) => rows.map((r) => r.name);

for (const adapter of adapters) {
  const t = (title, fn) => test(`[${adapter.name}] ${title}`, async () => {
    const store = await adapter.fresh();
    try { await fn(store); } finally { adapter.cleanup?.(); }
  });

  // -- subjects ---------------------------------------------------------------
  t('subjects: create returns the persisted row; getAll lists it with the same id', async (s) => {
    const created = await s.subjects.create('Anatomia', 'DISC-GREEN');
    assert.ok(created.id != null);
    assert.equal(created.name, 'Anatomia');
    assert.equal(created.color, 'DISC-GREEN');
    assert.equal(created.isActive, true);
    const all = await s.subjects.getAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, created.id);
    assert.equal(all[0].name, 'Anatomia');
  });

  t('subjects: getAll is ordered by creation, NOT alphabetically (ordering contract)', async (s) => {
    await s.subjects.create('Zoologia');
    await s.subjects.create('Anatomia');
    await s.subjects.create('Mitologia');
    assert.deepEqual(names(await s.subjects.getAll()), ['Zoologia', 'Anatomia', 'Mitologia']);
    assert.deepEqual(names(await s.subjects.getActive()), ['Zoologia', 'Anatomia', 'Mitologia']);
  });

  t('subjects: ids are unique, stable across reads and across update', async (s) => {
    const a = await s.subjects.create('Alfa');
    const b = await s.subjects.create('Beta');
    assert.notEqual(a.id, b.id);
    const before = (await s.subjects.getAll()).map((r) => r.id);
    assert.deepEqual((await s.subjects.getAll()).map((r) => r.id), before, 'two reads must agree');
    await s.subjects.update(a.id, { name: 'Alfa Renomeada' });
    assert.deepEqual((await s.subjects.getAll()).map((r) => r.id), before, 'update must not change ids or order');
  });

  t('subjects: update changes the name and is visible on the next read', async (s) => {
    const a = await s.subjects.create('Fisio');
    const updated = await s.subjects.update(a.id, { name: 'Fisiologia' });
    assert.equal(updated.name, 'Fisiologia');
    assert.equal((await s.subjects.getAll())[0].name, 'Fisiologia');
  });

  t('subjects: deactivate hides from getActive but keeps the row and id in getAll', async (s) => {
    const a = await s.subjects.create('Arquivar');
    await s.subjects.create('Manter');
    await s.subjects.deactivate(a.id);
    assert.deepEqual(names(await s.subjects.getActive()), ['Manter']);
    const all = await s.subjects.getAll();
    assert.equal(all.length, 2);
    const archived = all.find((r) => r.id === a.id);
    assert.equal(archived.isActive, false);
  });

  t('subjects: a duplicate name (case-insensitive) is rejected and nothing is added', async (s) => {
    await s.subjects.create('Bioquimica');
    await assert.rejects(() => s.subjects.create('bioquimica'));
    assert.equal((await s.subjects.getAll()).length, 1);
  });

  t('subjects: deleteIfEmpty removes an empty subject and only that one', async (s) => {
    const a = await s.subjects.create('Vazia');
    const b = await s.subjects.create('Outra');
    await s.subjects.deleteIfEmpty(a.id);
    const rest = await s.subjects.getAll();
    assert.deepEqual(rest.map((r) => r.id), [b.id]);
  });

  t('subjects: deleteIfEmpty REFUSES a subject that owns a unit and keeps both', async (s) => {
    const a = await s.subjects.create('Com aula');
    await adapter.createUnit(s, { subjectId: a.id, title: 'Aula 1', studyDate: '2020-01-01' });
    await assert.rejects(() => s.subjects.deleteIfEmpty(a.id));
    assert.equal((await s.subjects.getAll()).length, 1);
    assert.equal((await s.learningUnits.getAll()).length, 1);
  });

  // -- learning units -----------------------------------------------------------
  t('learningUnits: create persists a unit retrievable by getAll with a stable id', async (s) => {
    const subj = await s.subjects.create('Farmaco');
    const id = await adapter.createUnit(s, { subjectId: subj.id, title: 'Cinetica', studyDate: '2020-03-10' });
    const all = await s.learningUnits.getAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, id);
    assert.equal(all[0].title, 'Cinetica');
    assert.equal(all[0].subjectId, subj.id);
    assert.equal(all[0].studyDate, '2020-03-10');
    assert.deepEqual((await s.learningUnits.getAll()).map((u) => u.id), [id]);
  });

  t('learningUnits: getAll is newest studyDate first, ties newest id first (ordering contract)', async (s) => {
    const subj = await s.subjects.create('Ordem');
    const old = await adapter.createUnit(s, { subjectId: subj.id, title: 'Antiga', studyDate: '2020-01-01' });
    const newest = await adapter.createUnit(s, { subjectId: subj.id, title: 'Nova', studyDate: '2020-06-01' });
    const tieA = await adapter.createUnit(s, { subjectId: subj.id, title: 'Empate A', studyDate: '2020-03-01' });
    const tieB = await adapter.createUnit(s, { subjectId: subj.id, title: 'Empate B', studyDate: '2020-03-01' });
    assert.deepEqual((await s.learningUnits.getAll()).map((u) => u.id), [newest, tieB, tieA, old]);
  });

  t('learningUnits: getByDate returns only that date', async (s) => {
    const subj = await s.subjects.create('Datas');
    await adapter.createUnit(s, { subjectId: subj.id, title: 'Dia 1', studyDate: '2020-01-01' });
    const day2 = await adapter.createUnit(s, { subjectId: subj.id, title: 'Dia 2', studyDate: '2020-01-02' });
    assert.deepEqual((await s.learningUnits.getByDate('2020-01-02')).map((u) => u.id), [day2]);
    assert.deepEqual(await s.learningUnits.getByDate('2019-12-31'), []);
  });

  t('learningUnits: update changes title and summary, keeps the id and the subject', async (s) => {
    const subj = await s.subjects.create('Edicao');
    const id = await adapter.createUnit(s, { subjectId: subj.id, title: 'Antes', studyDate: '2020-01-01' });
    await s.learningUnits.update(id, { title: 'Depois', summaryBody: 'Resumo novo' });
    const [unit] = await s.learningUnits.getAll();
    assert.equal(unit.id, id);
    assert.equal(unit.title, 'Depois');
    assert.equal(unit.summaryBody, 'Resumo novo');
    assert.equal(unit.subjectId, subj.id);
  });

  // -- review tasks ---------------------------------------------------------------
  t('reviewTasks: getOverdue is ordered by dueDate and is the exact set due before the reference date', async (s) => {
    const subj = await s.subjects.create('Revisao');
    await adapter.createUnit(s, { subjectId: subj.id, title: 'Aula', studyDate: '2020-01-01' });
    const reference = '2020-06-01';
    const expectedDue = generateReviewDates('2020-01-01').filter((d) => d < reference);
    assert.ok(expectedDue.length > 1, 'fixture must produce several overdue reviews');
    const overdue = await s.reviewTasks.getOverdue(reference);
    assert.deepEqual(overdue.map((r) => r.dueDate), expectedDue);
    assert.equal(new Set(overdue.map((r) => r.id)).size, overdue.length, 'ids must be unique');
    assert.ok(overdue.every((r) => r.reviewDone === false));
  });

  t('reviewTasks: completeReviewWithEvidence removes the task from overdue, keeps other ids, records REVIEW evidence', async (s) => {
    const subj = await s.subjects.create('Concluir');
    const unitId = await adapter.createUnit(s, { subjectId: subj.id, title: 'Aula', studyDate: '2020-01-01' });
    const reference = '2020-06-01';
    const before = await s.reviewTasks.getOverdue(reference);
    const target = before[0];
    await s.completeReviewWithEvidence({ taskId: target.id, questionsCount: 4, correctCount: 3 });
    const after = await s.reviewTasks.getOverdue(reference);
    assert.deepEqual(after.map((r) => r.id), before.slice(1).map((r) => r.id));
    const evidence = (await s.learningEvidence.getAll()).filter((e) => e.context === 'REVIEW');
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].unitId, unitId);
    assert.equal(evidence[0].reviewTaskId, target.id);
    assert.equal(evidence[0].scorePercent, 75);
  });

  // -- exercises --------------------------------------------------------------------
  async function unitFor(s, subjectName = 'Exercicios') {
    const subj = await s.subjects.create(subjectName);
    return adapter.createUnit(s, { subjectId: subj.id, title: 'Aula', studyDate: '2020-01-01' });
  }

  t('exercises: create persists question/answer/hint/provenance; getAll returns it with the same id', async (s) => {
    const unitId = await unitFor(s);
    const created = await s.exercises.create(unitId, { questionText: 'O que e X?', answerText: 'E Y', hintText: 'Pense em Z', provenance: 'MANUAL' });
    assert.ok(created.id != null);
    const [row] = await s.exercises.getAll(unitId);
    assert.equal(row.id, created.id);
    assert.equal(row.questionText, 'O que e X?');
    assert.equal(row.answerText, 'E Y');
    assert.equal(row.hintText, 'Pense em Z');
    assert.equal(row.provenance, 'MANUAL');
    assert.equal(row.unitId, unitId);
  });

  t('exercises: getAll is in creation order, scoped to its unit (ordering contract)', async (s) => {
    const unitId = await unitFor(s, 'Disc A');
    const otherUnit = await unitFor(s, 'Disc B');
    const q1 = await s.exercises.create(unitId, { questionText: 'Q1', provenance: 'MANUAL' });
    const q2 = await s.exercises.create(unitId, { questionText: 'Q2', provenance: 'MANUAL' });
    const q3 = await s.exercises.create(unitId, { questionText: 'Q3', provenance: 'MANUAL' });
    await s.exercises.create(otherUnit, { questionText: 'Outra', provenance: 'MANUAL' });
    assert.deepEqual((await s.exercises.getAll(unitId)).map((e) => e.id), [q1.id, q2.id, q3.id]);
  });

  t('exercises: update changes the text and keeps the id and position', async (s) => {
    const unitId = await unitFor(s);
    const q1 = await s.exercises.create(unitId, { questionText: 'Q1', answerText: 'A1', provenance: 'MANUAL' });
    const q2 = await s.exercises.create(unitId, { questionText: 'Q2', answerText: 'A2', provenance: 'MANUAL' });
    await s.exercises.update(q1.id, { questionText: 'Q1 editada', answerText: 'A1 editada', hintText: null, provenance: 'MANUAL' });
    const rows = await s.exercises.getAll(unitId);
    assert.deepEqual(rows.map((e) => e.id), [q1.id, q2.id]);
    assert.equal(rows[0].questionText, 'Q1 editada');
    assert.equal(rows[0].answerText, 'A1 editada');
  });

  t('exercises: delete removes it from getAll, leaves the others in order', async (s) => {
    const unitId = await unitFor(s);
    const q1 = await s.exercises.create(unitId, { questionText: 'Q1', provenance: 'MANUAL' });
    const q2 = await s.exercises.create(unitId, { questionText: 'Q2', provenance: 'MANUAL' });
    const q3 = await s.exercises.create(unitId, { questionText: 'Q3', provenance: 'MANUAL' });
    await s.exercises.delete(q2.id);
    assert.deepEqual((await s.exercises.getAll(unitId)).map((e) => e.id), [q1.id, q3.id]);
  });

  t('exercises: an empty question is rejected and nothing is stored', async (s) => {
    const unitId = await unitFor(s);
    await assert.rejects(() => s.exercises.create(unitId, { questionText: '   ', provenance: 'MANUAL' }));
    assert.equal((await s.exercises.getAll(unitId)).length, 0);
  });

  // -- learning evidence -----------------------------------------------------------------
  t('learningEvidence: create persists; score is a percentage; getAll returns the same id', async (s) => {
    const unitId = await unitFor(s);
    const created = await s.learningEvidence.create({ unitId, context: 'EXTERNAL', questionsCount: 10, correctCount: 9, evidenceDate: '2026-01-01' });
    assert.ok(created.id != null);
    assert.equal(created.scorePercent, 90);
    const [row] = await s.learningEvidence.getAll();
    assert.equal(row.id, created.id);
    assert.equal(row.unitId, unitId);
    assert.equal(row.context, 'EXTERNAL');
    assert.equal(row.questionsCount, 10);
    assert.equal(row.correctCount, 9);
    assert.equal(row.evidenceDate, '2026-01-01');
  });

  t('learningEvidence: getAll is oldest evidenceDate first, ties by creation (ordering contract); getByUnit scopes', async (s) => {
    const u1 = await unitFor(s, 'Disc U1');
    const u2 = await unitFor(s, 'Disc U2');
    const late = await s.learningEvidence.create({ unitId: u1, context: 'EXTERNAL', questionsCount: 5, correctCount: 5, evidenceDate: '2026-03-01' });
    const early = await s.learningEvidence.create({ unitId: u1, context: 'EXTERNAL', questionsCount: 5, correctCount: 1, evidenceDate: '2026-01-01' });
    const tieFirst = await s.learningEvidence.create({ unitId: u2, context: 'EXTERNAL', questionsCount: 2, correctCount: 1, evidenceDate: '2026-02-01' });
    const tieSecond = await s.learningEvidence.create({ unitId: u2, context: 'EXTERNAL', questionsCount: 2, correctCount: 2, evidenceDate: '2026-02-01' });
    assert.deepEqual((await s.learningEvidence.getAll()).map((e) => e.id), [early.id, tieFirst.id, tieSecond.id, late.id]);
    assert.deepEqual((await s.learningEvidence.getByUnit(u1)).map((e) => e.id), [early.id, late.id]);
  });

  t('learningEvidence: correct > questions is rejected and nothing is stored', async (s) => {
    const unitId = await unitFor(s);
    await assert.rejects(() => s.learningEvidence.create({ unitId, context: 'EXTERNAL', questionsCount: 3, correctCount: 4, evidenceDate: '2026-01-01' }));
    assert.equal((await s.learningEvidence.getAll()).length, 0);
  });

  // -- settings ---------------------------------------------------------------------------
  t('settings: get exposes the fixed review schedule offsets', async (s) => {
    const settings = await s.settings.get();
    assert.deepEqual([...settings.reviewSchedule], [...REVIEW_DAY_OFFSETS]);
  });
}

// -- MORTO sensor (T-F6-06a classification) -----------------------------------
// The third adapter — src/db.js's Tauri-SQLite branch — is unreachable in
// the shipped Desktop because the window init script ALWAYS sets
// REMOTE_MODE=true (both branches). If someone adds a Tauri path that does
// not set it, this fails and T-F6-06a's classification must be redone
// (and the Tauri branch added to this contract suite).
test('MORTO sensor: the Tauri window init script sets REMOTE_MODE=true on every branch', () => {
  const lib = readFileSync(fileURLToPath(new URL('../src-tauri/src/lib.rs', import.meta.url)), 'utf8');
  const start = lib.indexOf('let init_script = if local_authority');
  assert.ok(start > 0, 'init_script assignment not found in lib.rs');
  const block = lib.slice(start, lib.indexOf('.to_string()', start));
  const literals = block.match(/window\.__SMARTLEARN_REMOTE_MODE__ = true;/g) ?? [];
  assert.equal(literals.length, 2, 'both the local-authority and the plain branch must set REMOTE_MODE=true');
  assert.ok(!/REMOTE_MODE__ = false/.test(block));
});
