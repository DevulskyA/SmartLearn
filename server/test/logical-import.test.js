import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLogicalExport, isLogicalExport, LOGICAL_SETS } from '../../shared/logical-import.js';
import { ImportNormalizationError } from '../../shared/import-normalization.js';

// IMPORT-1 (pure validator). Each case breaks ONE rule of a valid export and expects that exact
// rule to be reported — so a validator that stops enforcing any single rule is caught.

const OPTS = { currentSchemaVersion: 29 };
const T = '2026-03-01T10:00:00.000Z';

function valid() {
  return {
    exportVersion: 1,
    exportedAt: T,
    schemaVersion: 29,
    user: { id: 1, email: 'a@example.com', createdAt: T },
    settings: { timezone: 'America/Sao_Paulo', reviewSchedule: [1, 2], updatedAt: null },
    subjects: [{ id: 1, user_id: 1, name: 'Farmacologia', color: 'DISC-GREEN', is_active: 1, sort_order: 0, created_at: T, updated_at: T }],
    learningUnits: [{ id: 1, user_id: 1, subject_id: 1, title: 'Aula', source_text: null, summary_body: 'r', study_date: '2026-03-01', created_at: T, updated_at: T }],
    reviewTasks: [{ id: 1, user_id: 1, unit_id: 1, offset_days: 1, due_date: '2026-03-02', completed_at: null, created_at: T }],
    exercises: [{ id: 1, user_id: 1, unit_id: 1, order_index: 0, created_at: T, updated_at: T, archived_at: null }],
    exerciseVersions: [{ id: 1, user_id: 1, exercise_id: 1, question: 'Pergunta?', answer: 'R', hint: null, provenance: 'MANUAL', created_at: T, explanation: null, question_type: null }],
    learningEvidence: [{ id: 1, user_id: 1, unit_id: 1, review_task_id: 1, type: 'REVIEW', questions_count: 10, correct_count: 9, evidence_date: '2026-03-02', created_at: T }],
    exerciseAttempts: [{ id: 1, user_id: 1, unit_id: 1, competency_id: null, exercise_version_id: 1, status: 'SUBMITTED', max_assistance: 'NONE', started_at: T, submitted_at: T, review_task_id: 1, evidence_id: 1 }],
    learningEvents: [
      { id: 1, user_id: 1, unit_id: 1, competency_id: null, attempt_id: 1, exercise_version_id: 1, corrects_event_id: null, kind: 'ATTEMPT', sequence: 1, outcome: 'INCORRECT', assistance_available: 'UNKNOWN', assistance_used: 'NONE', assessment_method: 'SELF_REPORT', provenance: 'APP', schema_version: 1, occurred_at: T, recorded_at: T, confidence: null },
      { id: 2, user_id: 1, unit_id: 1, competency_id: null, attempt_id: 1, exercise_version_id: 1, corrects_event_id: 1, kind: 'CORRECTION', sequence: 2, outcome: 'CORRECT', assistance_available: 'UNKNOWN', assistance_used: 'NONE', assessment_method: 'SELF_REPORT', provenance: 'APP', schema_version: 1, occurred_at: T, recorded_at: T, confidence: 0.5 },
    ],
    exams: [{ id: 1, user_id: 1, unit_id: 1, status: 'CORRECTED', started_at: T, submitted_at: T, corrected_at: T, evidence_id: 1, subject_id: 1 }],
    examItems: [{ id: 1, user_id: 1, exam_id: 1, exercise_id: 1, exercise_version_id: 1, position: 0, student_answer: 'x', outcome: 'CORRECT' }],
    examEvidence: [{ user_id: 1, exam_id: 1, evidence_id: 1 }],
  };
}

function issuesOf(raw) {
  try { normalizeLogicalExport(raw, OPTS); } catch (err) {
    assert.ok(err instanceof ImportNormalizationError, `expected ImportNormalizationError, got ${err}`);
    return err.issues.map((i) => i.code);
  }
  return [];
}

test('a valid export normalizes: rows by id, user_id dropped, no warnings except the materials note', () => {
  const result = normalizeLogicalExport(valid(), OPTS);
  assert.equal(result.sets.subjects[0].user_id, undefined);
  assert.deepEqual(result.warnings.map((w) => w.code), ['MATERIALS_NOT_RESTORED']);
  assert.deepEqual(Object.keys(result.sets), LOGICAL_SETS.map((s) => s.key));
  assert.equal(result.sets.learningEvents.length, 2);
});

test('isLogicalExport recognizes only objects carrying exportVersion', () => {
  assert.equal(isLogicalExport(valid()), true);
  for (const v of [null, undefined, 5, 'x', [], {}, { schemaVersion: 3, subjects: [] }]) assert.equal(isLogicalExport(v), false);
});

const REJECTED = [
  ['unsupported exportVersion', (r) => { r.exportVersion = 2; }, 'UNSUPPORTED_EXPORT_VERSION'],
  ['schema newer than the server', (r) => { r.schemaVersion = 30; }, 'SCHEMA_TOO_NEW'],
  ['missing schemaVersion', (r) => { delete r.schemaVersion; }, 'INVALID_SCHEMA_VERSION'],
  ['missing core set', (r) => { delete r.reviewTasks; }, 'MISSING_SET'],
  ['set that is not a list', (r) => { r.exercises = {}; }, 'INVALID_SET'],
  ['non-object row', (r) => { r.subjects.push(7); }, 'INVALID_ROW'],
  ['invalid id', (r) => { r.subjects[0].id = 0; }, 'INVALID_ID'],
  ['duplicate id', (r) => { r.subjects.push({ ...r.subjects[0], name: 'Outra' }); }, 'DUPLICATE_ID'],
  ['null in a NOT NULL column', (r) => { r.subjects[0].name = null; }, 'NULL_NOT_ALLOWED'],
  ['missing required column', (r) => { delete r.learningUnits[0].title; }, 'MISSING_FIELD'],
  ['wrong type', (r) => { r.reviewTasks[0].offset_days = '1'; }, 'INVALID_TYPE'],
  ['invalid timestamp', (r) => { r.subjects[0].created_at = 'ontem'; }, 'INVALID_DATE'],
  ['blank name', (r) => { r.subjects[0].name = '   '; }, 'BLANK_TEXT'],
  ['enum outside the allowed set', (r) => { r.learningEvidence[0].type = 'OTHER'; }, 'INVALID_ENUM'],
  ['is_active not 0/1', (r) => { r.subjects[0].is_active = 2; }, 'INVALID_ENUM'],
  ['subject names equal ignoring ASCII case', (r) => { r.subjects.push({ ...r.subjects[0], id: 2, name: 'farmacologia' }); }, 'DUPLICATE_SUBJECT_NAME'],
  ['questions_count zero', (r) => { r.learningEvidence[0].questions_count = 0; r.learningEvidence[0].correct_count = 0; }, 'INVALID_COUNT'],
  ['correct_count above questions_count', (r) => { r.learningEvidence[0].correct_count = 11; }, 'INVALID_COUNT'],
  ['correct_count without questions_count', (r) => { r.learningEvidence[0].questions_count = null; }, 'INVALID_COUNT'],
  ['attempt that references a competency', (r) => { r.exerciseAttempts[0].competency_id = 5; }, 'UNSUPPORTED_REFERENCE'],
  ['confidence above 1', (r) => { r.learningEvents[1].confidence = 1.2; }, 'INVALID_CONFIDENCE'],
  ['CORRECTION without the event it corrects', (r) => { r.learningEvents[1].corrects_event_id = null; }, 'INVALID_CORRECTION'],
  ['ATTEMPT that claims to correct something', (r) => { r.learningEvents[0].corrects_event_id = 2; }, 'INVALID_CORRECTION'],
  ['correction pointing forward in time', (r) => { r.learningEvents[1].corrects_event_id = 2; }, 'INVALID_CORRECTION'],
  ['repeated sequence inside one attempt', (r) => { r.learningEvents[1].sequence = 1; }, 'DUPLICATE_SEQUENCE'],
  ['negative exam position', (r) => { r.examItems[0].position = -1; }, 'INVALID_POSITION'],
  ['repeated position inside one exam', (r) => { r.examItems.push({ ...r.examItems[0], id: 2 }); }, 'DUPLICATE_POSITION'],
  ['repeated exam/evidence link', (r) => { r.examEvidence.push({ ...r.examEvidence[0] }); }, 'DUPLICATE_LINK'],
  ['dangling parent reference', (r) => { r.learningUnits[0].subject_id = 99; }, 'DANGLING_REFERENCE'],
  ['dangling reference in a nullable column', (r) => { r.exams[0].evidence_id = 99; }, 'DANGLING_REFERENCE'],
  ['dangling link without an id column', (r) => { r.examEvidence[0].exam_id = 99; }, 'DANGLING_REFERENCE'],
  ['settings missing', (r) => { delete r.settings; }, 'INVALID_SETTINGS'],
  ['settings without timezone', (r) => { r.settings.timezone = ''; }, 'INVALID_SETTINGS'],
];

for (const [name, mutate, code] of REJECTED) {
  test(`rejects: ${name} -> ${code}`, () => {
    const raw = valid();
    mutate(raw);
    assert.ok(issuesOf(raw).includes(code), `expected ${code}`);
  });
}

test('reports EVERY problem in one pass, not just the first', () => {
  const raw = valid();
  raw.subjects[0].name = null;
  raw.learningUnits[0].subject_id = 99;
  raw.learningEvidence[0].type = 'OTHER';
  const codes = issuesOf(raw);
  for (const code of ['NULL_NOT_ALLOWED', 'DANGLING_REFERENCE', 'INVALID_ENUM']) assert.ok(codes.includes(code), code);
});

test('older exports are accepted: tables added later are optional, columns with defaults are filled', () => {
  const raw = valid();
  for (const key of ['exerciseAttempts', 'learningEvents', 'exams', 'examItems', 'examEvidence']) delete raw[key];
  delete raw.subjects[0].color;
  delete raw.exercises[0].archived_at;
  delete raw.exerciseVersions[0].explanation;
  delete raw.exerciseVersions[0].question_type;
  const result = normalizeLogicalExport(raw, OPTS);
  assert.equal(result.sets.subjects[0].color, 'DISC-BLUE');
  assert.equal(result.sets.exercises[0].archived_at, null);
  assert.deepEqual([result.sets.exams, result.sets.examEvidence], [[], []]);
});

test('unknown columns are reported as a warning (never silently dropped); user_id is not "unknown"', () => {
  const raw = valid();
  raw.subjects[0].futureColumn = 'x';
  const result = normalizeLogicalExport(raw, OPTS);
  const warning = result.warnings.find((w) => w.code === 'UNKNOWN_FIELDS_IGNORED');
  assert.ok(warning);
  assert.match(warning.message, /futureColumn/);
  assert.doesNotMatch(warning.message, /user_id/);
  assert.equal(result.sets.subjects[0].futureColumn, undefined);
});

test('is pure and deterministic: same input twice, same output; the input is not mutated', () => {
  const raw = valid();
  const snapshot = JSON.stringify(raw);
  assert.deepEqual(normalizeLogicalExport(raw, OPTS), normalizeLogicalExport(raw, OPTS));
  assert.equal(JSON.stringify(raw), snapshot);
});

test('rows come out sorted by id regardless of the order in the file', () => {
  const raw = valid();
  raw.subjects.unshift({ ...raw.subjects[0], id: 2, name: 'Segunda' });
  assert.deepEqual(normalizeLogicalExport(raw, OPTS).sets.subjects.map((s) => s.id), [1, 2]);
});
