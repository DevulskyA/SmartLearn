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
import { acceptDraft, previewAcceptance, AcceptDraftError } from '../src/services/accept-draft.js';
import { validateDraft, DraftValidationError } from '../src/ai/draft-schema.js';
import { CODEX_PROVIDER_NAME } from '../src/ai/codex-provider.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// SUMMARY FIRST: the Resumo Mestre is available without the question batch. Deterministic provider (no model, no network); the real-Codex
// timing is measured separately by scripts/real-codex-split.mjs, run by the owner.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const SEGMENTS = [{ pageIndex: 1, text: 'a' }, { pageIndex: 2, text: 'b' }];

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-summary-first-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES ('s@example.com', 's@example.com', 'h', 's', 'scrypt', '{}', ?, ?)`).run(now, now).lastInsertRowid;
}

/** Stands in for the Codex provider: records what it was asked and answers a summary with no questions, like the summary-only call does. */
function summaryOnlyProvider(seen) {
  return {
    name: CODEX_PROVIDER_NAME, live: false,
    async generate(input) {
      seen.push({ deferQuestions: input.deferQuestions });
      return {
        summary: '## Filtracao glomerular\n\nA filtracao depende da pressao hidrostatica e do coeficiente de filtracao.',
        summarySourceSpans: [{ pageIndex: 1 }], summaryEvidence: [], questions: [], modelVersion: 'codex:test', promptVersion: '10', language: 'pt-BR',
      };
    },
  };
}

async function proposalFor(db, userId, sourcesDir) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['Filtracao glomerular depende da pressao.', 'Segunda pagina da aula.']), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  return proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 })[0];
}

test('validateDraft: an empty question list is accepted ONLY for a summary-only generation', () => {
  const raw = { summary: 'Resumo', summarySourceSpans: [{ pageIndex: 1 }], summaryEvidence: [], questions: [], modelVersion: 'm', promptVersion: '10' };
  assert.throws(() => validateDraft(raw, { segments: SEGMENTS }), DraftValidationError);
  const ok = validateDraft(raw, { segments: SEGMENTS, allowNoQuestions: true });
  assert.deepEqual([ok.summary, ok.questions.length], ['Resumo', 0]);
  const bad = { ...raw, questions: [{ question: 'q', answer: 'a', sourceSpans: [{ pageIndex: 99 }] }] };
  assert.throws(() => validateDraft(bad, { segments: SEGMENTS, allowNoQuestions: true }), DraftValidationError, 'questions that were sent are still validated');
});

test('summary-only draft: created without questions, opens, is accepted into a lesson with its 16 reviews and no exercises; the study date is the one the student gives', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const proposal = await proposalFor(db, userId, sourcesDir);
    const seen = [];
    const draft = await drafts.createDraft(db, userId, proposal.id, { providerImpl: summaryOnlyProvider(seen), codex: { deferQuestions: true }, generationLocaleOverride: 'pt-BR' });
    assert.deepEqual(seen, [{ deferQuestions: true }]);
    assert.equal(draft.questions.length, 0);
    assert.equal(draft.content?.questionsDeferred ?? draft.questionsDeferred, true);
    assert.equal(draft.audit?.findings?.some((f) => f.issue === 'QUESTION_VOLUME_OUT_OF_RANGE') ?? false, false);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM learning_units').get().n, 0, 'preparing the summary creates no lesson and no review calendar');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM review_tasks').get().n, 0);

    const edited = drafts.reviseSummary(db, userId, draft.id, { summary: '## Filtracao glomerular\n\nTexto revisado pelo aluno.', expectedVersion: draft.summaryVersion ?? 1 });
    assert.ok(edited, 'the summary can be edited while there are no questions');

    const current = drafts.getDraft(db, userId, draft.id);
    const accept = { newSubjectName: 'Fisiologia', studyDate: '2026-11-20', expectedRevision: current.revision, acknowledgeSummaryFindings: true };
    const preview = previewAcceptance(db, userId, draft.id, accept);
    assert.equal(preview.exercises.length, 0);
    const result = acceptDraft(db, userId, draft.id, accept);
    assert.equal(result.exerciseCount, 0);
    assert.equal(result.reviewCount, 16);
    assert.equal(result.unit.studyDate, '2026-11-20');
    assert.match(db.prepare('SELECT summary_body FROM learning_units WHERE id = ?').get(result.unit.id).summary_body, /revisado pelo aluno/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM exercises').get().n, 0);
  } finally { cleanup(); }
});

test('a draft that HAD questions and lost them all to rejection is still refused; a normal generation is unchanged (no deferQuestions, questions required)', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const proposal = await proposalFor(db, userId, sourcesDir);
    const draft = await drafts.createDraft(db, userId, proposal.id, {});
    assert.ok(draft.questions.length >= 1, 'the default generation still brings questions');
    for (const q of draft.questions) drafts.reviseQuestion(db, userId, draft.id, q.id, { status: 'REJECTED', expectedVersion: q.version });
    const current = drafts.getDraft(db, userId, draft.id);
    assert.throws(() => acceptDraft(db, userId, draft.id, { newSubjectName: 'F', studyDate: '2026-11-20', expectedRevision: current.revision, acknowledgeSummaryFindings: true }),
      (err) => err instanceof AcceptDraftError && err.code === 'VALIDATION_FAILED');
  } finally { cleanup(); }
});
