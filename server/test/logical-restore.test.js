import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';
import { createLogicalExport } from '../src/backup.js';
import { REVIEW_DAY_OFFSETS } from '../../shared/review-schedule.js';

// IMPORT-1: restoring the student's OWN logical export (GET /v1/export) into an
// EMPTY account. The main proof is export A -> restore B -> export B, compared as
// LOGICAL content and relationships (ids are remapped, so each id/foreign key is
// rewritten to its ordinal within the set before comparing) — never just counts.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const PASSWORD = 'a genuinely long test password 1';

async function freshApp() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-logical-restore-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN] });
  return { app, db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function post(app, url, payload, headers = {}) {
  return app.inject({ method: 'POST', url, payload, headers: { origin: TEST_ORIGIN, ...headers } });
}

async function registerAndAuth(app, email) {
  await post(app, '/v1/auth/register', { email, password: PASSWORD });
  const loginRes = await post(app, '/v1/auth/login', { email, password: PASSWORD });
  const cookie = loginRes.headers['set-cookie'].split(';')[0];
  const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
  const body = JSON.parse(me.body);
  return { cookie, csrfToken: body.csrfToken, userId: body.user.id };
}

const authed = (account) => ({ cookie: account.cookie, 'x-csrf-token': account.csrfToken });

async function exportOf(app, account) {
  const res = await app.inject({ method: 'GET', url: '/v1/export', headers: { cookie: account.cookie } });
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body);
}

async function previewRaw(app, account, rawSource) {
  return post(app, '/v1/imports/preview', { rawSource }, authed(account));
}

async function previewOk(app, account, rawSource) {
  const res = await previewRaw(app, account, rawSource);
  assert.equal(res.statusCode, 200, res.body);
  return JSON.parse(res.body).preview;
}

const commitRaw = (app, account, previewId) => post(app, `/v1/imports/${previewId}/commit`, {}, authed(account));

const DATA_TABLES = [
  'subjects', 'learning_units', 'review_tasks', 'exercises', 'exercise_versions', 'learning_evidence',
  'exercise_attempts', 'learning_events', 'exams', 'exam_items', 'exam_evidence',
];

function countsOf(db, userId) {
  const out = {};
  for (const table of DATA_TABLES) out[table] = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(userId).n;
  return out;
}

const ZERO = Object.fromEntries(DATA_TABLES.map((t) => [t, 0]));

/**
 * A realistic, deliberately awkward account: an archived subject, an archived
 * exercise with two versions, evidence of every type (one without counts), a
 * correction event that points at an earlier event, an exam in progress and a
 * corrected exam linked to two evidences, a chosen timezone.
 */
function seedRichAccount(db, userId) {
  const t = (day) => `2026-03-${String(day).padStart(2, '0')}T10:00:00.000Z`;
  const run = (sql, ...params) => db.prepare(sql).run(...params).lastInsertRowid;

  const S1 = run('INSERT INTO subjects (user_id, name, color, is_active, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', userId, 'Farmacologia', 'DISC-GREEN', 1, 0, t(1), t(1));
  const S2 = run('INSERT INTO subjects (user_id, name, color, is_active, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', userId, 'História clínica', 'DISC-BLUE', 0, 3, t(2), t(9));

  const U1 = run('INSERT INTO learning_units (user_id, subject_id, title, source_text, summary_body, study_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', userId, S1, 'Farmacocinética', 'Goodman cap. 3', 'Absorção, distribuição, metabolismo e excreção.', '2026-03-03', t(3), t(3));
  const U2 = run('INSERT INTO learning_units (user_id, subject_id, title, source_text, summary_body, study_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', userId, S2, 'Anamnese', null, null, '2026-03-04', t(4), t(5));

  const RT1 = run('INSERT INTO review_tasks (user_id, unit_id, offset_days, due_date, completed_at, created_at) VALUES (?,?,?,?,?,?)', userId, U1, 1, '2026-03-04', t(4), t(3));
  run('INSERT INTO review_tasks (user_id, unit_id, offset_days, due_date, completed_at, created_at) VALUES (?,?,?,?,?,?)', userId, U1, 7, '2026-03-10', null, t(3));
  run('INSERT INTO review_tasks (user_id, unit_id, offset_days, due_date, completed_at, created_at) VALUES (?,?,?,?,?,?)', userId, U2, 1, '2026-03-05', null, t(4));

  const E1 = run('INSERT INTO exercises (user_id, unit_id, order_index, created_at, updated_at, archived_at) VALUES (?,?,?,?,?,?)', userId, U1, 0, t(3), t(6), null);
  const E2 = run('INSERT INTO exercises (user_id, unit_id, order_index, created_at, updated_at, archived_at) VALUES (?,?,?,?,?,?)', userId, U1, 1, t(3), t(7), t(7));
  const E3 = run('INSERT INTO exercises (user_id, unit_id, order_index, created_at, updated_at, archived_at) VALUES (?,?,?,?,?,?)', userId, U2, 0, t(4), t(4), null);

  const insertVersion = (exerciseId, question, answer, hint, provenance, createdAt, explanation, questionType) => run(
    'INSERT INTO exercise_versions (user_id, exercise_id, question, answer, hint, provenance, created_at, explanation, question_type) VALUES (?,?,?,?,?,?,?,?,?)',
    userId, exerciseId, question, answer, hint, provenance, createdAt, explanation, questionType);
  const V1 = insertVersion(E1, 'O que é biodisponibilidade?', 'Fração que atinge a circulação.', 'Via de administração', 'SOURCE', t(3), null, 'RECALL');
  const V2 = insertVersion(E1, 'O que é biodisponibilidade (revisada)?', 'Fração inalterada que atinge a circulação sistêmica.', null, 'MANUAL', t(6), 'Compare IV (100%) com oral.', 'CONCEPT');
  const V3 = insertVersion(E2, 'Meia-vida?', 'Tempo para reduzir à metade.', null, 'AI_GENERATED', t(3), null, null);
  const V4 = insertVersion(E3, 'Como organizar a anamnese?', null, null, 'MANUAL', t(4), null, null);

  const insertEvidence = (unitId, taskId, type, q, c, date) => run(
    'INSERT INTO learning_evidence (user_id, unit_id, review_task_id, type, questions_count, correct_count, evidence_date, created_at) VALUES (?,?,?,?,?,?,?,?)',
    userId, unitId, taskId, type, q, c, date, t(4));
  const EV1 = insertEvidence(U1, RT1, 'REVIEW', 10, 9, '2026-03-04');
  const EV2 = insertEvidence(U1, null, 'INITIAL_PRACTICE', 5, 5, '2026-03-03');
  insertEvidence(U2, null, 'EXTERNAL', null, null, '2026-03-05');

  const insertAttempt = (unitId, versionId, status, assistance, startedAt, submittedAt, taskId, evidenceId) => run(
    'INSERT INTO exercise_attempts (user_id, unit_id, competency_id, exercise_version_id, status, max_assistance, started_at, submitted_at, review_task_id, evidence_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
    userId, unitId, null, versionId, status, assistance, startedAt, submittedAt, taskId, evidenceId);
  const AT1 = insertAttempt(U1, V1, 'SUBMITTED', 'HINT', t(4), t(4), RT1, EV1);
  insertAttempt(U1, V2, 'STARTED', 'NONE', t(6), null, null, null);
  const AT3 = insertAttempt(U2, V4, 'ABANDONED', 'NONE', t(5), null, null, null);

  const insertEvent = (unitId, attemptId, versionId, corrects, kind, seq, outcome, used, occurred, confidence) => run(
    `INSERT INTO learning_events (user_id, unit_id, competency_id, attempt_id, exercise_version_id, corrects_event_id, kind, sequence, outcome,
       assistance_available, assistance_used, assessment_method, provenance, schema_version, occurred_at, recorded_at, confidence)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    userId, unitId, null, attemptId, versionId, corrects, kind, seq, outcome, 'HINT', used, 'SELF_REPORT', 'APP', 1, occurred, occurred, confidence);
  const LE1 = insertEvent(U1, AT1, V1, null, 'ATTEMPT', 1, 'INCORRECT', 'HINT', t(4), 0.5);
  insertEvent(U1, AT1, V1, LE1, 'CORRECTION', 2, 'CORRECT', 'HINT', t(5), null);
  insertEvent(U2, AT3, V4, null, 'ATTEMPT', 1, 'UNKNOWN', 'NONE', t(5), 0);

  const X1 = run('INSERT INTO exams (user_id, unit_id, status, started_at, submitted_at, corrected_at, evidence_id, subject_id) VALUES (?,?,?,?,?,?,?,?)', userId, U1, 'CORRECTED', t(8), t(8), t(9), EV2, S1);
  const X2 = run('INSERT INTO exams (user_id, unit_id, status, started_at, submitted_at, corrected_at, evidence_id, subject_id) VALUES (?,?,?,?,?,?,?,?)', userId, U2, 'IN_PROGRESS', t(10), null, null, null, S2);
  const insertItem = (examId, exerciseId, versionId, position, answer, outcome) => run(
    'INSERT INTO exam_items (user_id, exam_id, exercise_id, exercise_version_id, position, student_answer, outcome) VALUES (?,?,?,?,?,?,?)',
    userId, examId, exerciseId, versionId, position, answer, outcome);
  insertItem(X1, E1, V1, 0, 'Fração absorvida', 'CORRECT');
  insertItem(X1, E2, V3, 1, 'Não sei', 'INCORRECT');
  insertItem(X2, E3, V4, 0, null, null);
  db.prepare('INSERT INTO exam_evidence (user_id, exam_id, evidence_id) VALUES (?,?,?)').run(userId, X1, EV2);
  db.prepare('INSERT INTO exam_evidence (user_id, exam_id, evidence_id) VALUES (?,?,?)').run(userId, X1, EV1);

  db.prepare('INSERT INTO user_settings (user_id, timezone, review_schedule, updated_at) VALUES (?,?,?,?)')
    .run(userId, 'America/Manaus', JSON.stringify(REVIEW_DAY_OFFSETS), t(11));
}

// Independent of the implementation on purpose: which column references which set.
const FOREIGN_KEYS = {
  subjects: {},
  learningUnits: { subject_id: 'subjects' },
  reviewTasks: { unit_id: 'learningUnits' },
  exercises: { unit_id: 'learningUnits' },
  exerciseVersions: { exercise_id: 'exercises' },
  learningEvidence: { unit_id: 'learningUnits', review_task_id: 'reviewTasks' },
  exerciseAttempts: { unit_id: 'learningUnits', exercise_version_id: 'exerciseVersions', review_task_id: 'reviewTasks', evidence_id: 'learningEvidence' },
  learningEvents: { unit_id: 'learningUnits', attempt_id: 'exerciseAttempts', exercise_version_id: 'exerciseVersions', corrects_event_id: 'learningEvents' },
  exams: { unit_id: 'learningUnits', evidence_id: 'learningEvidence', subject_id: 'subjects' },
  examItems: { exam_id: 'exams', exercise_id: 'exercises', exercise_version_id: 'exerciseVersions' },
  examEvidence: { exam_id: 'exams', evidence_id: 'learningEvidence' },
};

/** Rewrites every id and foreign key to its ordinal in the set, drops user_id and volatile metadata. */
function canonical(exportJson) {
  const ordinals = {};
  for (const key of Object.keys(FOREIGN_KEYS)) {
    ordinals[key] = new Map((exportJson[key] ?? []).filter((r) => 'id' in r).sort((a, b) => a.id - b.id).map((r, i) => [r.id, i + 1]));
  }
  const sets = {};
  for (const [key, fks] of Object.entries(FOREIGN_KEYS)) {
    sets[key] = (exportJson[key] ?? []).map((row) => {
      const out = {};
      for (const [col, value] of Object.entries(row)) {
        if (col === 'user_id') continue;
        if (col === 'id') out.id = ordinals[key].get(value);
        else if (col in fks && value !== null) {
          const mapped = ordinals[fks[col]].get(value);
          assert.ok(mapped !== undefined, `${key}.${col}=${value} must point at a row of ${fks[col]}`);
          out[col] = mapped;
        } else out[col] = value;
      }
      return out;
    }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return { exportVersion: exportJson.exportVersion, schemaVersion: exportJson.schemaVersion, settings: exportJson.settings, sets };
}

test('IMPORT-1: export A -> restore B -> export B is logically equivalent (content AND relationships)', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    seedRichAccount(db, a.userId);
    const exportA = await exportOf(app, a);

    const b = await registerAndAuth(app, 'b@example.com');
    const preview = await previewOk(app, b, exportA);
    const res = await commitRaw(app, b, preview.id);
    assert.equal(res.statusCode, 200, res.body);
    const { commit } = JSON.parse(res.body);
    assert.equal(commit.kind, 'LOGICAL_RESTORE');

    const exportB = await exportOf(app, b);

    // The fixture is not trivially small: every set has rows, so equivalence means something.
    for (const key of Object.keys(FOREIGN_KEYS)) assert.ok(exportA[key].length > 0, `fixture needs ${key} rows`);
    assert.deepEqual(commit.counts, Object.fromEntries(Object.keys(FOREIGN_KEYS).map((k) => [k, exportA[k].length])));

    assert.deepEqual(canonical(exportB), canonical(exportA));

    // ...and ids really were remapped (this is not an accidental copy of A's ids).
    assert.notDeepEqual(exportB.subjects.map((s) => s.id), exportA.subjects.map((s) => s.id));
    // Spot checks on what the student cares about, stated directly rather than via the helper.
    assert.equal(exportB.settings.timezone, 'America/Manaus');
    assert.deepEqual(exportB.subjects.map((s) => [s.name, s.is_active]), [['Farmacologia', 1], ['História clínica', 0]]);
    assert.equal(exportB.exercises.filter((e) => e.archived_at !== null).length, 1);
    assert.equal(exportB.examItems.find((i) => i.student_answer === 'Fração absorvida').outcome, 'CORRECT');
    const correction = exportB.learningEvents.find((e) => e.kind === 'CORRECTION');
    assert.equal(exportB.learningEvents.find((e) => e.id === correction.corrects_event_id).kind, 'ATTEMPT');

    // A is untouched by B's restore.
    assert.deepEqual({ ...(await exportOf(app, a)), exportedAt: null }, { ...exportA, exportedAt: null });
  } finally { cleanup(); }
});

test('IMPORT-1: the restored account keeps working — a second round trip (B -> C) is equivalent too', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    seedRichAccount(db, a.userId);
    const b = await registerAndAuth(app, 'b@example.com');
    await commitRaw(app, b, (await previewOk(app, b, await exportOf(app, a))).id);
    const c = await registerAndAuth(app, 'c@example.com');
    await commitRaw(app, c, (await previewOk(app, c, await exportOf(app, b))).id);
    assert.deepEqual(canonical(await exportOf(app, c)), canonical(await exportOf(app, a)));
  } finally { cleanup(); }
});

test('IMPORT-1: preview writes zero learning rows and reports counts plus the explicit materials exclusion', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    seedRichAccount(db, a.userId);
    const b = await registerAndAuth(app, 'b@example.com');
    const preview = await previewOk(app, b, await exportOf(app, a));

    assert.deepEqual(countsOf(db, b.userId), ZERO);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_settings WHERE user_id = ?').get(b.userId).n, 0);
    assert.equal(preview.kind, 'LOGICAL_RESTORE');
    assert.deepEqual(preview.conflicts, []);
    assert.equal(preview.counts.subjects, 2);
    assert.equal(preview.counts.learningEvents, 3);
    assert.equal(preview.counts.examEvidence, 2);
    const warning = preview.warnings.find((w) => w.code === 'MATERIALS_NOT_RESTORED');
    assert.ok(warning, 'the preview must say materials are not restored');
    assert.match(warning.message, /PDFs/);
  } finally { cleanup(); }
});

test('IMPORT-1: a non-empty account is refused safely, at preview and again at commit', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    seedRichAccount(db, a.userId);
    const exportA = await exportOf(app, a);

    // (1) Already has learning data: refused at preview, nothing stored.
    const b = await registerAndAuth(app, 'b@example.com');
    db.prepare("INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, 'Minha disciplina', 'x', 'x')").run(b.userId);
    const refused = await previewRaw(app, b, exportA);
    assert.equal(refused.statusCode, 409);
    const body = JSON.parse(refused.body);
    assert.equal(body.error.code, 'RESTORE_REQUIRES_EMPTY_ACCOUNT');
    assert.deepEqual(body.error.details.present, { subjects: 1 });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM import_previews WHERE user_id = ?').get(b.userId).n, 0);

    // (2) Only materials exist (no learning rows): still not empty.
    const c = await registerAndAuth(app, 'c@example.com');
    db.prepare("INSERT INTO sources (user_id, filename, original_name, content_type, byte_size, checksum, created_at) VALUES (?, 'f', 'o.pdf', 'application/pdf', 10, 'abc', 'x')").run(c.userId);
    assert.equal(JSON.parse((await previewRaw(app, c, exportA)).body).error.code, 'RESTORE_REQUIRES_EMPTY_ACCOUNT');

    // (3) Empty at preview time, filled before the commit: the commit re-checks and writes nothing.
    const d = await registerAndAuth(app, 'd@example.com');
    const preview = await previewOk(app, d, exportA);
    db.prepare("INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, 'Chegou depois', 'x', 'x')").run(d.userId);
    const late = await commitRaw(app, d, preview.id);
    assert.equal(late.statusCode, 409);
    assert.equal(JSON.parse(late.body).error.code, 'RESTORE_REQUIRES_EMPTY_ACCOUNT');
    assert.deepEqual(countsOf(db, d.userId), { ...ZERO, subjects: 1 });
  } finally { cleanup(); }
});

test('IMPORT-1: an inconsistent reference rejects the whole file — 400, every problem listed, nothing stored', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    seedRichAccount(db, a.userId);
    const exportA = await exportOf(app, a);
    const b = await registerAndAuth(app, 'b@example.com');

    const broken = structuredClone(exportA);
    broken.examItems[0].exercise_version_id = 999999; // dangling reference
    broken.learningEvidence[0].correct_count = 99; // contradicts questions_count
    const res = await previewRaw(app, b, broken);
    assert.equal(res.statusCode, 400);
    const { error } = JSON.parse(res.body);
    assert.equal(error.code, 'INVALID_SOURCE');
    const codes = error.details.issues.map((i) => i.code);
    assert.ok(codes.includes('DANGLING_REFERENCE') && codes.includes('INVALID_COUNT'), `both problems reported, got ${codes}`);
    assert.deepEqual(countsOf(db, b.userId), ZERO);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM import_previews WHERE user_id = ?').get(b.userId).n, 0);
  } finally { cleanup(); }
});

test('IMPORT-1: a failure in the middle of the commit rolls EVERYTHING back (earlier sets included)', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    seedRichAccount(db, a.userId);
    const b = await registerAndAuth(app, 'b@example.com');
    const preview = await previewOk(app, b, await exportOf(app, a));

    // Simulate a corrupted stored preview: the LAST sets reference something that cannot be resolved.
    const row = db.prepare('SELECT normalized_json FROM import_previews WHERE id = ?').get(preview.id);
    const normalized = JSON.parse(row.normalized_json);
    normalized.sets.examEvidence[0].evidence_id = 424242;
    db.prepare('UPDATE import_previews SET normalized_json = ? WHERE id = ?').run(JSON.stringify(normalized), preview.id);

    const res = await commitRaw(app, b, preview.id);
    assert.equal(res.statusCode, 500);
    assert.equal(JSON.parse(res.body).error.code, 'IMPORT_INTEGRITY_ERROR');
    assert.deepEqual(countsOf(db, b.userId), ZERO, 'subjects..exam_items were inserted before the failure and must be gone');
    assert.equal(db.prepare('SELECT committed_at FROM import_previews WHERE id = ?').get(preview.id).committed_at, null);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_settings WHERE user_id = ?').get(b.userId).n, 0);
  } finally { cleanup(); }
});

test('IMPORT-1: a count that disagrees with the preview aborts and rolls back', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    seedRichAccount(db, a.userId);
    const b = await registerAndAuth(app, 'b@example.com');
    const preview = await previewOk(app, b, await exportOf(app, a));
    const row = db.prepare('SELECT report_json FROM import_previews WHERE id = ?').get(preview.id);
    const report = JSON.parse(row.report_json);
    report.counts.subjects += 1;
    db.prepare('UPDATE import_previews SET report_json = ? WHERE id = ?').run(JSON.stringify(report), preview.id);

    const res = await commitRaw(app, b, preview.id);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(countsOf(db, b.userId), ZERO);
  } finally { cleanup(); }
});

test('IMPORT-1: repeating the commit returns the original result and duplicates nothing', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    seedRichAccount(db, a.userId);
    const b = await registerAndAuth(app, 'b@example.com');
    const preview = await previewOk(app, b, await exportOf(app, a));
    const first = JSON.parse((await commitRaw(app, b, preview.id)).body).commit;
    const afterFirst = countsOf(db, b.userId);
    const secondRes = await commitRaw(app, b, preview.id);
    assert.equal(secondRes.statusCode, 200);
    assert.deepEqual(JSON.parse(secondRes.body).commit, first);
    assert.deepEqual(countsOf(db, b.userId), afterFirst);
    assert.ok(afterFirst.learning_events > 0);
  } finally { cleanup(); }
});

test('IMPORT-1: isolation — another user can neither read nor commit my preview, and my data is never touched', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    seedRichAccount(db, a.userId);
    const exportA = await exportOf(app, a);
    const before = countsOf(db, a.userId);

    const b = await registerAndAuth(app, 'b@example.com');
    const preview = await previewOk(app, b, exportA);

    const c = await registerAndAuth(app, 'c@example.com');
    assert.equal((await app.inject({ method: 'GET', url: `/v1/imports/${preview.id}`, headers: { cookie: c.cookie } })).statusCode, 404);
    assert.equal((await commitRaw(app, c, preview.id)).statusCode, 404);
    assert.deepEqual(countsOf(db, c.userId), ZERO);

    await commitRaw(app, b, preview.id);
    assert.deepEqual(countsOf(db, a.userId), before, 'restoring into B must not change A');
    // Every restored row belongs to B and to nobody else.
    for (const table of DATA_TABLES) {
      const foreign = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id NOT IN (?, ?)`).get(a.userId, b.userId).n;
      assert.equal(foreign, 0, table);
    }
  } finally { cleanup(); }
});

test('IMPORT-1: an account that never touched settings restores no settings row (same defaults as before)', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    seedRichAccount(db, a.userId);
    db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(a.userId);
    const exportA = await exportOf(app, a);
    assert.equal(exportA.settings.updatedAt, null);

    const b = await registerAndAuth(app, 'b@example.com');
    await commitRaw(app, b, (await previewOk(app, b, exportA)).id);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_settings WHERE user_id = ?').get(b.userId).n, 0);
    assert.deepEqual(canonical(await exportOf(app, b)), canonical(exportA));
  } finally { cleanup(); }
});

test('IMPORT-1: an export with nothing in it restores to an equally empty account', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    const exportA = await exportOf(app, a);
    const b = await registerAndAuth(app, 'b@example.com');
    const preview = await previewOk(app, b, exportA);
    assert.ok(Object.values(preview.counts).every((n) => n === 0));
    assert.equal((await commitRaw(app, b, preview.id)).statusCode, 200);
    assert.deepEqual(canonical(await exportOf(app, b)), canonical(exportA));
  } finally { cleanup(); }
});

test('IMPORT-1: the route accepts a realistic backup above the 1 MiB framework default, and still refuses past the configured cap', async () => {
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    seedRichAccount(db, a.userId);
    const exportA = await exportOf(app, a);
    const b = await registerAndAuth(app, 'b@example.com');

    const big = structuredClone(exportA);
    big.learningUnits[0].summary_body = 'x'.repeat(1_600_000);
    assert.ok(JSON.stringify(big).length > 1024 * 1024);
    assert.equal((await previewRaw(app, b, big)).statusCode, 200);

    const tooBig = structuredClone(exportA);
    tooBig.learningUnits[0].summary_body = 'x'.repeat(config.importMaxBytes + 1000);
    assert.equal((await previewRaw(app, b, tooBig)).statusCode, 413);
  } finally { cleanup(); }
});

test('IMPORT-1: logical export detection does not swallow the legacy importer', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const b = await registerAndAuth(app, 'b@example.com');
    const legacy = JSON.parse((await import('node:fs')).readFileSync(fileURLToPath(new URL('./import-fixtures/v3-schema.json', import.meta.url)), 'utf8'));
    const preview = await previewOk(app, b, legacy);
    assert.equal(preview.kind, undefined);
    assert.equal(preview.counts.subjects, 1);
  } finally { cleanup(); }
});

test('IMPORT-1: a non-object / unrelated payload is not mistaken for a logical export', async () => {
  const { app, cleanup } = await freshApp();
  try {
    const b = await registerAndAuth(app, 'b@example.com');
    const res = await previewRaw(app, b, { exportVersion: 2, subjects: [] });
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error.code, 'INVALID_SOURCE');
  } finally { cleanup(); }
});

test('IMPORT-1: createLogicalExport is the shape the restore consumes (guards export/restore drift)', async () => {
  // If a column is added to an exported table without teaching the restore about it, the unknown
  // field is reported as a warning at preview — never silently dropped.
  const { app, db, cleanup } = await freshApp();
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    seedRichAccount(db, a.userId);
    const exported = createLogicalExport(db, a.userId);
    const known = {
      subjects: 8, learningUnits: 9, reviewTasks: 7, exercises: 7, exerciseVersions: 10, learningEvidence: 9,
      exerciseAttempts: 11, learningEvents: 18, exams: 9, examItems: 8, examEvidence: 3,
    };
    for (const [key, columns] of Object.entries(known)) {
      assert.equal(Object.keys(exported[key][0]).length, columns, `${key} gained or lost a column — update shared/logical-import.js`);
    }
    const b = await registerAndAuth(app, 'b@example.com');
    const preview = await previewOk(app, b, exported);
    assert.equal(preview.warnings.filter((w) => w.code === 'UNKNOWN_FIELDS_IGNORED').length, 0);
  } finally { cleanup(); }
});

test('IMPORT-1: capacity is checked at PREVIEW — the student is told before confirming, and nothing is stored', async () => {
  const { app, db, cleanup } = await freshApp();
  const original = config.importMaxRows;
  try {
    const a = await registerAndAuth(app, 'a@example.com');
    seedRichAccount(db, a.userId);
    const exportA = await exportOf(app, a);
    const b = await registerAndAuth(app, 'b@example.com');

    config.importMaxRows = 10; // the fixture has well over 10 rows
    const res = await previewRaw(app, b, exportA);
    assert.equal(res.statusCode, 413);
    const { error } = JSON.parse(res.body);
    assert.equal(error.code, 'IMPORT_TOO_LARGE');
    assert.equal(error.details.maxRows, 10);
    assert.ok(error.details.rowTotal > 10);
    assert.deepEqual(countsOf(db, b.userId), ZERO);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM import_previews WHERE user_id = ?').get(b.userId).n, 0);

    config.importMaxRows = original; // back to normal: the very same file now previews and restores
    assert.equal((await commitRaw(app, b, (await previewOk(app, b, exportA)).id)).statusCode, 200);
  } finally { config.importMaxRows = original; cleanup(); }
});
