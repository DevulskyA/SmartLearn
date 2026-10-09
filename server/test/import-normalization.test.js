import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeLegacyExport, ImportNormalizationError } from '../../shared/import-normalization.js';

function loadFixture(name) {
  const path = fileURLToPath(new URL('./import-fixtures/' + name, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('T25: v1 legacy fixture (studyRecords/sources, no schemaVersion) normalizes correctly', () => {
  const result = normalizeLegacyExport(loadFixture('v1-legacy.json'));
  assert.equal(result.sourceVersion, 1);
  assert.equal(result.subjects.length, 1);
  assert.equal(result.subjects[0].name, 'Fisiologia');
  assert.equal(result.learningUnits.length, 1);
  assert.equal(result.learningUnits[0].title, 'Homeostase');
  assert.equal(result.learningUnits[0].sourceText, 'Guyton cap. 1');
  assert.equal(result.reviewTasks.length, 1);
  assert.equal(result.reviewTasks[0].legacyUnitId, 1);
  // Neither reviewDone nor questionsDone in this fixture — no evidence
  // fabricated from an incomplete review.
  assert.deepEqual(result.learningEvidence, []);
});

test('T25: v2 fixture synthesizes REVIEW evidence only from a completed+scored task, not an unfinished one', () => {
  const result = normalizeLegacyExport(loadFixture('v2-schema.json'));
  assert.equal(result.sourceVersion, 2);
  assert.equal(result.reviewTasks.length, 2);
  assert.equal(result.learningEvidence.length, 1);
  assert.deepEqual(result.learningEvidence[0], {
    legacyUnitId: 1,
    legacyReviewTaskId: 1,
    context: 'REVIEW',
    questionsCount: 20,
    correctCount: 16,
    evidenceDate: '2026-01-11',
  });
  assert.equal(result.exercises.length, 1);
  assert.equal(result.exercises[0].provenance, 'MANUAL');
});

test('T25: v3 fixture keeps its explicit learningEvidence as-is, cross-linked to the right review task', () => {
  const result = normalizeLegacyExport(loadFixture('v3-schema.json'));
  assert.equal(result.sourceVersion, 3);
  assert.equal(result.learningEvidence.length, 1);
  assert.equal(result.learningEvidence[0].legacyReviewTaskId, 1);
  assert.equal(result.exercises[0].provenance, 'SOURCE');
});

test('T25: normalization is deterministic — running it twice on the same source yields identical output', () => {
  const raw = loadFixture('v3-schema.json');
  const first = normalizeLegacyExport(JSON.parse(JSON.stringify(raw)));
  const second = normalizeLegacyExport(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(first, second);
});

test('T25: cosmetic gaps (missing color/sortOrder) are defaulted and reported as warnings, not silently dropped', () => {
  // v1-legacy.json's subject has no color but DOES have sort_order:0 — real
  // v1 exports never carried a color field at all (added later).
  const colorResult = normalizeLegacyExport(loadFixture('v1-legacy.json'));
  assert.ok(colorResult.warnings.some((w) => w.code === 'DEFAULTED_COLOR'));

  const raw = loadFixture('v1-legacy.json');
  delete raw.subjects[0].sort_order;
  const sortResult = normalizeLegacyExport(raw);
  assert.ok(sortResult.warnings.some((w) => w.code === 'DEFAULTED_SORT_ORDER'));
});

test('T25: unknown schemaVersion is rejected, never partially accepted', () => {
  assert.throws(
    () => normalizeLegacyExport(loadFixture('unsupported-version.json')),
    (err) => err instanceof ImportNormalizationError && err.issues.some((i) => i.code === 'UNSUPPORTED_VERSION'),
  );
});

test('T25: a learningUnit referencing a nonexistent subject (cross-unit dangling ref) rejects the whole import', () => {
  assert.throws(
    () => normalizeLegacyExport(loadFixture('cross-unit-dangling-ref.json')),
    (err) => err instanceof ImportNormalizationError && err.issues.some((i) => i.code === 'DANGLING_SUBJECT_REF'),
  );
});

test('T25: a duplicate id within the same entity type rejects the whole import', () => {
  assert.throws(
    () => normalizeLegacyExport(loadFixture('duplicate-id.json')),
    (err) => err instanceof ImportNormalizationError && err.issues.some((i) => i.code === 'DUPLICATE_ID'),
  );
});

test('T25: an impossible calendar date (Feb 30) rejects the whole import', () => {
  assert.throws(
    () => normalizeLegacyExport(loadFixture('invalid-date.json')),
    (err) => err instanceof ImportNormalizationError && err.issues.some((i) => i.code === 'INVALID_DATE'),
  );
});

test('T25: a missing/unknown exercise provenance rejects rather than guessing where it came from', () => {
  assert.throws(
    () => normalizeLegacyExport(loadFixture('invalid-provenance.json')),
    (err) => err instanceof ImportNormalizationError && err.issues.some((i) => i.code === 'INVALID_PROVENANCE'),
  );
});

test('T25: correctCount greater than questionsCount rejects the whole import', () => {
  assert.throws(
    () => normalizeLegacyExport(loadFixture('invalid-counts.json')),
    (err) => err instanceof ImportNormalizationError && err.issues.some((i) => i.code === 'INVALID_COUNTS'),
  );
});

test('T25: a completed+scored review task with no matching evidence row is detected, not silently dropped', () => {
  assert.throws(
    () => normalizeLegacyExport(loadFixture('v3-missing-evidence-row.json')),
    (err) => err instanceof ImportNormalizationError && err.issues.some((i) => i.code === 'MISSING_EVIDENCE_ROW'),
  );
});

test('T25: multiple issues in one source are all reported together, not just the first', () => {
  const raw = loadFixture('duplicate-id.json');
  raw.learningUnits.push({ id: 1, subjectId: 999, sourceText: '', studyDate: '2026-13-01', title: 'X', summaryBody: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  try {
    normalizeLegacyExport(raw);
    assert.fail('expected ImportNormalizationError');
  } catch (err) {
    assert.ok(err instanceof ImportNormalizationError);
    const codes = err.issues.map((i) => i.code);
    assert.ok(codes.includes('DUPLICATE_ID'));
    assert.ok(codes.includes('DANGLING_SUBJECT_REF'));
    assert.ok(err.issues.length >= 2);
  }
});

test('T25: malformed top-level input (not an object) is rejected with a clear reason', () => {
  assert.throws(
    () => normalizeLegacyExport(null),
    (err) => err instanceof ImportNormalizationError && err.issues.some((i) => i.code === 'INVALID_INPUT'),
  );
  assert.throws(
    () => normalizeLegacyExport('not json'),
    (err) => err instanceof ImportNormalizationError && err.issues.some((i) => i.code === 'INVALID_INPUT'),
  );
});
