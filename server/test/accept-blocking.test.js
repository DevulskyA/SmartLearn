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
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// AI_OUTPUT = DRAFT, enforced by the server: a HIGH ("wrong or unsupported medical content") finding cannot slip into accepted
// study material silently. A question needs the reviewer's explicit ACCEPT (or REJECT); a summary needs an explicit acknowledgement.
// MEDIUM and LOW stay advisory.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const ACCEPT = { newSubjectName: 'Fisiologia', studyDate: '2026-10-03' };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-accept-block-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email = 'b@example.com') {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

/** A real draft (test double) whose stored audit is replaced by exactly the given findings. */
async function draftWithFindings(db, userId, sourcesDir, findings) {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf(['Pagina um de fisiologia', 'Pagina dois de fisiologia']), originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  const created = await drafts.createDraft(db, userId, proposal.id, {});
  const row = db.prepare('SELECT draft_json FROM generated_drafts WHERE id = ?').get(created.id);
  const content = JSON.parse(row.draft_json);
  content.audit = { result: 'REPAIR', findings };
  db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify(content), created.id);
  return drafts.getDraft(db, userId, created.id);
}

const finding = (severity, scope) => ({ issue: 'TEST_FINDING', severity, scope, generatedClaim: 'claim', sourceEvidence: 'evidence', repair: 'fix' });
const unitCount = (db) => db.prepare('SELECT COUNT(*) AS n FROM learning_units').get().n;

test('a HIGH finding on a question blocks acceptance until the reviewer accepts that question; nothing is created meanwhile', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftWithFindings(db, userId, sourcesDir, [finding('HIGH', 'question:0')]);
    assert.throws(() => acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision }), (err) => err instanceof AcceptDraftError && err.code === 'FINDINGS_UNRESOLVED');
    assert.equal(unitCount(db), 0);

    const blocked = drafts.getDraft(db, userId, draft.id);
    assert.equal(previewAcceptance(db, userId, draft.id, { ...ACCEPT }).blockers.questions.length, 1);

    const q = blocked.questions[0];
    drafts.reviseQuestion(db, userId, draft.id, q.id, { status: 'ACCEPTED', expectedVersion: q.version });
    const after = drafts.getDraft(db, userId, draft.id);
    assert.equal(previewAcceptance(db, userId, draft.id, { ...ACCEPT }).blockers.questions.length, 0);
    const result = acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: after.revision });
    assert.equal(result.exerciseCount, after.questions.length);
  } finally { cleanup(); }
});

test('rejecting the flagged question resolves it: the rest of the lesson is accepted', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftWithFindings(db, userId, sourcesDir, [finding('HIGH', 'question:0')]);
    const q = draft.questions[0];
    drafts.reviseQuestion(db, userId, draft.id, q.id, { status: 'REJECTED', expectedVersion: q.version });
    const after = drafts.getDraft(db, userId, draft.id);
    const result = acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: after.revision });
    assert.equal(result.exerciseCount, after.questions.length - 1);
  } finally { cleanup(); }
});

test('a HIGH finding on the summary needs the reviewer\'s explicit acknowledgement', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftWithFindings(db, userId, sourcesDir, [finding('HIGH', 'summary')]);
    assert.throws(() => acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision }), (err) => err.code === 'FINDINGS_UNRESOLVED');
    assert.equal(unitCount(db), 0);
    assert.throws(() => acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision, acknowledgeSummaryFindings: 'yes' }), (err) => err.code === 'FINDINGS_UNRESOLVED', 'only a real true counts');
    assert.equal(previewAcceptance(db, userId, draft.id, { ...ACCEPT }).blockers.summary, 1);
    assert.equal(previewAcceptance(db, userId, draft.id, { ...ACCEPT, acknowledgeSummaryFindings: true }).blockers.summary, 0);
    const result = acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision, acknowledgeSummaryFindings: true });
    assert.ok(result.unit.id);
  } finally { cleanup(); }
});

test('MEDIUM and LOW findings are advisory: they never block', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftWithFindings(db, userId, sourcesDir, [finding('MEDIUM', 'summary'), finding('MEDIUM', 'question:0'), finding('LOW', 'question:1')]);
    const result = acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision });
    assert.ok(result.unit.id);
  } finally { cleanup(); }
});

test('the draft the screen loads carries what blocks acceptance, so the screen never re-derives the rule', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftWithFindings(db, userId, sourcesDir, [finding('HIGH', 'summary'), finding('HIGH', 'question:0')]);
    assert.equal(draft.acceptanceBlockers.summary, 1);
    assert.equal(draft.acceptanceBlockers.questions.length, 1);
    const q = draft.questions[0];
    drafts.reviseQuestion(db, userId, draft.id, q.id, { status: 'ACCEPTED', expectedVersion: q.version });
    assert.equal(drafts.getDraft(db, userId, draft.id).acceptanceBlockers.questions.length, 0);
  } finally { cleanup(); }
});

test('HIGH findings that are only about how the content teaches (too thin, answer leaked in a hint) do not block', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const pedagogy = (issue, scope) => ({ ...finding('HIGH', scope), issue });
    const draft = await draftWithFindings(db, userId, sourcesDir, [pedagogy('SUMMARY_TOO_THIN', 'summary'), pedagogy('HINT_REVEALS_ANSWER', 'question:0')]);
    assert.equal(draft.acceptanceBlockers.summary + draft.acceptanceBlockers.questions.length, 0);
    assert.ok(acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision }).unit.id);
  } finally { cleanup(); }
});

test('end to end with the real deterministic audit: an invented value in the summary blocks; fixing it and re-auditing releases the acceptance', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const draft = await draftWithFindings(db, userId, sourcesDir, []);
    // the reviewer (or the model) leaves a dose the source never states
    const bad = drafts.reviseSummary(db, userId, draft.id, { summary: 'A pagina de fisiologia descreve a dose de 987 mg por dia.', expectedVersion: draft.summaryVersion });
    const audited = drafts.reauditDraft(db, userId, draft.id).draft;
    assert.ok(audited.audit.findings.some((f) => f.issue === 'SUMMARY_UNSUPPORTED_VALUE' && f.severity === 'HIGH'));
    assert.throws(() => acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: audited.revision }), (err) => err.code === 'FINDINGS_UNRESOLVED');
    assert.equal(unitCount(db), 0);

    const fixed = drafts.reviseSummary(db, userId, draft.id, { summary: 'A pagina de fisiologia descreve o tema da aula.', expectedVersion: audited.summaryVersion });
    const clean = drafts.reauditDraft(db, userId, draft.id).draft;
    assert.ok(!clean.audit.findings.some((f) => f.severity === 'HIGH' && f.entityType === 'SUMMARY' && f.issue === 'SUMMARY_UNSUPPORTED_VALUE'));
    assert.equal(clean.acceptanceBlockers.summary, 0);
    assert.ok(acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: clean.revision }).unit.id);
    void bad; void fixed;
  } finally { cleanup(); }
});

test('a critical MODEL finding survives an edit of something else, and goes only when the text it judged changes', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db);
    const model = (scope) => ({ ...finding('HIGH', scope), source: 'MODEL' });
    const draft = await draftWithFindings(db, userId, sourcesDir, [model('summary'), model('question:0')]);
    // accepting question 1 (unrelated to both findings) must not erase them
    const q1 = draft.questions[1];
    const afterOther = drafts.reviseQuestion(db, userId, draft.id, q1.id, { status: 'ACCEPTED', expectedVersion: q1.version });
    assert.equal(afterOther.acceptanceBlockers.summary, 1);
    assert.deepEqual(afterOther.acceptanceBlockers.questions, [draft.questions[0].id]);
    // accepting the flagged question itself resolves ONLY that one; the summary point stays
    const q0 = afterOther.questions[0];
    const afterOwn = drafts.reviseQuestion(db, userId, draft.id, q0.id, { status: 'ACCEPTED', expectedVersion: q0.version });
    assert.equal(afterOwn.acceptanceBlockers.questions.length, 0);
    assert.equal(afterOwn.acceptanceBlockers.summary, 1);
    // rewriting the summary is a different text than the one the finding judged: that finding goes
    const rewritten = drafts.reviseSummary(db, userId, draft.id, { summary: 'A pagina de fisiologia descreve o tema da aula.', expectedVersion: afterOwn.summaryVersion });
    assert.equal(rewritten.acceptanceBlockers.summary, 0);
    // adding or removing a question breaks the position the findings were addressed by: none is trusted any more
    const other = makeUser(db, 'c@example.com');
    const again = await draftWithFindings(db, other, sourcesDir, [model('question:0')]);
    const removed = drafts.deleteQuestion(db, other, again.id, again.questions[1].id);
    assert.equal(removed.acceptanceBlockers.questions.length, 0);
  } finally { cleanup(); }
});
