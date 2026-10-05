import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import * as drafts from '../src/services/generated-drafts.js';
import { acceptDraft } from '../src/services/accept-draft.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// T-F2-04: provenance per question and per draft. A generated question says who generated it; a human edit changes its origin
// to HUMAN_EDITED WITHOUT erasing who generated it; a human-added question has no generator; a draft written before this existed
// is read as GENERATED + legacy (presumed), WITHOUT writing anything. Accepting never depends on origin.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const SPANS = [{ pageIndex: 1 }];
const json = (x) => JSON.stringify(x);

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-prov-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

// A GENERATED draft straight from createDraft (fake provider), so the provenance written at generation time is what is under test.
async function generated(db, sourcesDir, email) {
  const userId = makeUser(db, email);
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['conteudo de teste da aula']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  const draft = await drafts.createDraft(db, userId, proposal.id, {});
  return { userId, draftId: draft.id, draft };
}

// Adds two more generated-like questions through the fixture-only whole-list path, so there are three questions to compare.
function withThree(db, userId, draft) {
  const extra = (x) => ({ question: `Pergunta ${x}?`, answer: `Resposta ${x}`, explanation: null, hint: null, sourceSpans: SPANS });
  return drafts.replaceDraftContent(db, userId, draft.id, { questions: [extra('A'), extra('B'), extra('C')] });
}

const expectedGeneratedBy = (d) => ({ provider: d.provider, modelVersion: d.modelVersion, promptVersion: d.promptVersion });

test('a freshly generated draft: every question is GENERATED with the generator recorded; the summary is GENERATED; nothing is marked legacy', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { draft } = await generated(db, sourcesDir, 'prov1@example.com');
    assert.ok(draft.questions.length >= 1);
    for (const q of draft.questions) {
      assert.equal(q.origin, 'GENERATED');
      assert.deepEqual(q.generatedBy, expectedGeneratedBy(draft));
      assert.equal(q.editedAt, null);
      assert.ok(!q.legacy);
    }
    assert.equal(draft.summaryOrigin, 'GENERATED');
    assert.equal(draft.summaryEditedAt, null);
  } finally { cleanup(); }
});

test('editing a question TEXT makes only that question HUMAN_EDITED (editedAt set, generatedBy kept); the others are byte-identical', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft: first } = await generated(db, sourcesDir, 'prov2@example.com');
    const draft = withThree(db, userId, first);
    const [q1, q2, q3] = draft.questions;
    const after = drafts.reviseQuestion(db, userId, draftId, q2.id, { answer: 'Resposta B corrigida pelo revisor' });
    assert.equal(json(after.questions[0]), json(q1));
    assert.equal(json(after.questions[2]), json(q3));
    const edited = after.questions[1];
    assert.equal(edited.origin, 'HUMAN_EDITED');
    assert.match(edited.editedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(edited.generatedBy, q2.generatedBy, 'who generated it is not erased');
    assert.equal(json(drafts.getDraft(db, userId, draftId).questions[1]), json(edited), 'round-trip through the database');
  } finally { cleanup(); }
});

test('a review-status change or an edit that changes nothing does NOT make a question HUMAN_EDITED', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft: first } = await generated(db, sourcesDir, 'prov3@example.com');
    const draft = withThree(db, userId, first);
    const q = draft.questions[1];
    const rejected = drafts.reviseQuestion(db, userId, draftId, q.id, { status: 'REJECTED' });
    assert.equal(rejected.questions[1].origin, q.origin);
    assert.equal(rejected.questions[1].editedAt, q.editedAt ?? null);
    const same = drafts.reviseQuestion(db, userId, draftId, q.id, { answer: q.answer });
    assert.equal(same.questions[1].origin, q.origin);
  } finally { cleanup(); }
});

test('editing the summary marks the SUMMARY HUMAN_EDITED and leaves every question provenance untouched', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft: first } = await generated(db, sourcesDir, 'prov4@example.com');
    const draft = withThree(db, userId, first);
    const after = drafts.reviseSummary(db, userId, draftId, { summary: `${draft.summary} Complemento do revisor.` });
    assert.equal(after.summaryOrigin, 'HUMAN_EDITED');
    assert.match(after.summaryEditedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(json(after.questions), json(draft.questions));
  } finally { cleanup(); }
});

test('a human-added question has origin HUMAN_ADDED and no generator; editing it keeps it HUMAN_ADDED', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId } = await generated(db, sourcesDir, 'prov5@example.com');
    const added = drafts.addQuestion(db, userId, draftId, { question: 'Pergunta nova?', answer: 'Resposta nova', explanation: null, hint: null, sourceSpans: SPANS });
    const q = added.questions[added.questions.length - 1];
    assert.equal(q.origin, 'HUMAN_ADDED');
    assert.equal(q.generatedBy, null);
    const edited = drafts.reviseQuestion(db, userId, draftId, q.id, { answer: 'Resposta nova revista' });
    const again = edited.questions[edited.questions.length - 1];
    assert.equal(again.origin, 'HUMAN_ADDED');
    assert.equal(again.generatedBy, null);
    assert.match(again.editedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally { cleanup(); }
});

test('a legacy draft (stored without any provenance) is read as GENERATED + legacy, identically on every read, and READING WRITES NOTHING', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft } = await generated(db, sourcesDir, 'prov6@example.com');
    // Rewrite the stored JSON the way drafts looked before T-F2-04: no origin / generatedBy / editedAt / summaryOrigin.
    const row = db.prepare('SELECT draft_json FROM generated_drafts WHERE id = ?').get(draftId);
    const old = JSON.parse(row.draft_json);
    delete old.summaryOrigin; delete old.summaryEditedAt;
    old.questions = old.questions.map(({ origin, generatedBy, editedAt, legacy, ...rest }) => rest);
    db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify(old), draftId);
    const stored = () => db.prepare('SELECT draft_json, revision, updated_at FROM generated_drafts WHERE id = ?').get(draftId);
    const before = json(stored());

    const first = drafts.getDraft(db, userId, draftId);
    const second = drafts.getDraft(db, userId, draftId);
    assert.equal(json(first.questions), json(second.questions), 'same provenance on every read');
    for (const q of first.questions) {
      assert.equal(q.origin, 'GENERATED');
      assert.equal(q.legacy, true);
      assert.deepEqual(q.generatedBy, expectedGeneratedBy(draft), 'presumed from the draft row');
      assert.equal(q.editedAt, null);
    }
    assert.equal(first.summaryOrigin, 'GENERATED');
    assert.equal(json(stored()), before, 'the stored row is byte-identical after reading');
  } finally { cleanup(); }
});

test('accepting a draft does not depend on origin: GENERATED, HUMAN_EDITED, HUMAN_ADDED and legacy questions all become exercises (REJECTED excluded)', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft: first } = await generated(db, sourcesDir, 'prov7@example.com');
    const draft = withThree(db, userId, first);
    drafts.reviseQuestion(db, userId, draftId, draft.questions[1].id, { answer: 'Resposta B corrigida pelo revisor' });
    drafts.addQuestion(db, userId, draftId, { question: 'Pergunta nova?', answer: 'Resposta nova', explanation: null, hint: null, sourceSpans: SPANS });
    const row = db.prepare('SELECT draft_json FROM generated_drafts WHERE id = ?').get(draftId);
    const stored = JSON.parse(row.draft_json);
    const { origin: _o, generatedBy: _g, editedAt: _e, legacy: _l, ...legacyShape } = stored.questions[2]; // the third question reads as legacy
    stored.questions[2] = legacyShape;
    db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify(stored), draftId);
    const current = drafts.getDraft(db, userId, draftId);
    assert.deepEqual(new Set(current.questions.map((q) => q.origin)), new Set(['GENERATED', 'HUMAN_EDITED', 'HUMAN_ADDED']));
    const rejected = drafts.reviseQuestion(db, userId, draftId, current.questions[0].id, { status: 'REJECTED' });
    const result = acceptDraft(db, userId, draftId, { newSubjectName: 'Fisiologia', studyDate: '2026-10-03', expectedRevision: rejected.revision });
    assert.equal(result.exerciseCount, rejected.questions.length - 1);
  } finally { cleanup(); }
});

test('the next edit of a legacy draft persists provenance; untouched legacy questions stay marked legacy (presumed), edited ones become HUMAN_EDITED', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft: first } = await generated(db, sourcesDir, 'prov8@example.com');
    const draft = withThree(db, userId, first);
    const row = db.prepare('SELECT draft_json FROM generated_drafts WHERE id = ?').get(draftId);
    const old = JSON.parse(row.draft_json);
    old.questions = old.questions.map(({ origin, generatedBy, editedAt, legacy, ...rest }) => rest);
    db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify(old), draftId);
    const after = drafts.reviseQuestion(db, userId, draftId, draft.questions[1].id, { answer: 'Resposta B corrigida pelo revisor' });
    assert.equal(after.questions[1].origin, 'HUMAN_EDITED');
    assert.deepEqual(after.questions[1].generatedBy, expectedGeneratedBy(draft));
    assert.equal(after.questions[0].origin, 'GENERATED');
    assert.equal(after.questions[0].legacy, true);
    const persisted = JSON.parse(db.prepare('SELECT draft_json FROM generated_drafts WHERE id = ?').get(draftId).draft_json);
    assert.equal(persisted.questions[0].origin, 'GENERATED', 'now stored, no longer only derived at read time');
  } finally { cleanup(); }
});

test('a RECORDED generated question (not legacy) edited by a human becomes HUMAN_EDITED and keeps exactly the generatedBy it was born with', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, draftId, draft } = await generated(db, sourcesDir, 'prov9@example.com');
    const born = draft.questions[0];
    assert.equal(born.origin, 'GENERATED');
    assert.ok(!born.legacy, 'recorded at generation, not presumed');
    const after = drafts.reviseQuestion(db, userId, draftId, born.id, { answer: 'Resposta corrigida pelo revisor' });
    const edited = after.questions[0];
    assert.equal(edited.origin, 'HUMAN_EDITED');
    assert.ok(!edited.legacy);
    assert.deepEqual(edited.generatedBy, born.generatedBy);
    assert.equal(edited.version, born.version + 1);
  } finally { cleanup(); }
});
