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
import { createJob, createQuestionsJob, getJob } from '../src/services/generation-jobs.js';
import { createJobRunner } from '../src/services/generation-job-runner.js';
import { setReuseConsent, isReuseGranted } from '../src/services/shared-reuse.js';
import { CODEX_PROVIDER_NAME } from '../src/ai/codex-provider.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// REUSE between accounts (migration 046): a student whose text equals a text another student already had reviewed receives that content as a
// draft of their own, with NO model call. Every provider is a counting FAKE: "no new call" is the counter, not a promise.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const OPTS = { timeout: 60_000 };
const PAGES = ['Filtracao glomerular depende da pressao hidrostatica.', 'Segunda pagina: o ritmo de filtracao glomerular.'];
const good = (n, page = 1) => ({ question: `Pergunta ${n}: de que depende a filtracao glomerular?`, answer: 'Da pressao hidrostatica.', explanation: 'A pressao empurra o filtrado.', hint: 'Pense na forca.', questionType: 'OPEN', sourceSpans: [{ pageIndex: page }] });
const INPUT = { newSubjectName: 'Fisiologia Renal', studyDate: '2026-10-03' };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-shared-reuse-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { db, sourcesDir: join(dir, 'sources'), cleanup: () => { try { db.close(); } catch { /* closed */ } rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}
function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}
/** A provider that counts every call it receives. `withQuestions: false` is the summary-first shape (Codex defers the questions). */
function counting({ withQuestions = true, live = false } = {}) {
  const p = {
    name: CODEX_PROVIDER_NAME, live, languageContract: 'NOT_APPLICABLE', calls: 0, questionCalls: 0,
    async generate(input) {
      p.calls += 1;
      const page = input?.segments?.[0]?.pageIndex ?? 1;
      return { summary: '## Filtracao glomerular\n\nA filtracao depende da pressao hidrostatica.', summarySourceSpans: [{ pageIndex: page }], summaryEvidence: [], questions: withQuestions ? [good(1, page), good(2, page)] : [], modelVersion: 'codex:test', promptVersion: '10', language: 'pt-BR' };
    },
    async generateQuestions(input) {
      p.questionCalls += 1;
      const page = input?.segments?.[0]?.pageIndex ?? 1;
      return { questions: [good(3, page), good(4, page)], modelVersion: 'codex:test', promptVersion: '10' };
    },
  };
  return p;
}
async function proposalFor(ctx, userId, pages = PAGES, name = 'costanzo.pdf', range = null) {
  const source = sourceStorage.acceptUpload(ctx.db, userId, { buffer: buildFixturePdf(pages), originalName: name, contentType: 'application/pdf', sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(ctx.db, userId, source.id, { sourcesDir: ctx.sourcesDir });
  const list = proposals.chunkSource(ctx.db, userId, source.id, { maxPagesPerChunk: range ?? 10 });
  return { source, proposal: list[0], all: list };
}
const generate = (ctx, userId, proposal, provider, extra = {}) => drafts.createDraft(ctx.db, userId, proposal.id, { providerImpl: provider, generationLocaleOverride: 'pt-BR', ...extra });
const lessonCount = (db, userId) => db.prepare('SELECT COUNT(*) AS n FROM learning_units WHERE user_id = ?').get(userId).n;
const exerciseCount = (db, userId) => db.prepare('SELECT COUNT(*) AS n FROM exercises WHERE user_id = ?').get(userId).n;
const shared = (db) => db.prepare('SELECT * FROM shared_content').all();

/** Student A opted in, generated, reviewed WITHOUT editing and accepted. Returns the first student's world. */
async function contributor(ctx, { consent = true, pages = PAGES, withQuestions = true } = {}) {
  const userId = makeUser(ctx.db, 'a@example.com');
  if (consent) setReuseConsent(ctx.db, userId, true);
  const { proposal, source } = await proposalFor(ctx, userId, pages);
  const provider = counting({ withQuestions });
  const draft = await generate(ctx, userId, proposal, provider, withQuestions ? {} : { codex: { deferQuestions: true } });
  acceptDraft(ctx.db, userId, draft.id, { ...INPUT, expectedRevision: draft.revision });
  return { userId, proposal, source, provider, draft };
}

test('two students, same text: the second gets the reviewed summary and questions as a DRAFT with no model call and no credit', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const a = await contributor(ctx);
    assert.equal(a.provider.calls, 1);
    assert.equal(shared(ctx.db).length, 1, 'the accepted unedited content was offered once');

    const bId = makeUser(ctx.db, 'b@example.com');
    const { proposal } = await proposalFor(ctx, bId);
    const providerB = counting();
    const reservationsBefore = ctx.db.prepare('SELECT COUNT(*) AS n FROM generation_reservations').get().n;
    const draft = await generate(ctx, bId, proposal, providerB);

    assert.equal(providerB.calls, 0, 'no new model call for reviewed content of the same text');
    assert.equal(draft.sharedReuse, true);
    assert.equal(draft.status, 'DRAFT', 'AI_OUTPUT = DRAFT: reused content is still reviewed by the student who receives it');
    assert.match(draft.summary, /pressao hidrostatica/);
    assert.equal(draft.questions.length, 2);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM generation_reservations').get().n, reservationsBefore, 'nothing was reserved or charged');
    assert.equal(shared(ctx.db)[0].reuse_count, 1);

    // B's draft belongs to B: A's own lesson is untouched and nothing of A is readable from it
    assert.equal(lessonCount(ctx.db, bId), 0);
    assert.equal(JSON.stringify(draft).includes('a@example.com'), false);
    assert.equal('contributor_user_id' in draft, false);
    const accepted = acceptDraft(ctx.db, bId, draft.id, { ...INPUT, expectedRevision: draft.revision });
    assert.equal(accepted.exerciseCount, 2);
    assert.equal(lessonCount(ctx.db, bId), 1);
    assert.equal(lessonCount(ctx.db, a.userId), 1, 'A keeps their own lesson, unchanged');
    assert.equal(exerciseCount(ctx.db, a.userId), 2);
  } finally { ctx.cleanup(); }
});

test('a different passage of the same book is a miss: it is generated normally', OPTS, async () => {
  const ctx = tmpDb();
  try {
    await contributor(ctx);
    const bId = makeUser(ctx.db, 'b@example.com');
    // the same book, but B selected only the second page: other segments, other digest
    const { all } = await proposalFor(ctx, bId, PAGES, 'costanzo.pdf', 1);
    assert.ok(all.length >= 2, 'the book was cut into separate passages');
    const providerB = counting();
    const draft = await generate(ctx, bId, all[1], providerB);
    assert.equal(providerB.calls, 1);
    assert.equal(draft.sharedReuse, undefined);
  } finally { ctx.cleanup(); }
});

test('another edition (other text) is a miss, and two editions that declare different ISBNs never share even with equal text', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const a = await contributor(ctx);
    ctx.db.prepare('UPDATE sources SET bib_isbn = ?, bib_edition = ? WHERE user_id = ? AND id = ?').run('9780323086141', '7', a.userId, a.source.id);
    ctx.db.prepare('UPDATE shared_content SET bib_isbn = ?, bib_edition = ?').run('9780323086141', '7');

    // other edition, other text
    const bId = makeUser(ctx.db, 'b@example.com');
    const { proposal: other } = await proposalFor(ctx, bId, ['Filtracao glomerular na oitava edicao foi reescrita.', 'Segunda pagina nova.']);
    const providerB = counting();
    await generate(ctx, bId, other, providerB);
    assert.equal(providerB.calls, 1, 'different text, different digest');

    // equal text but the file says it is edition 8 / another ISBN: a coincidence is not a reason to share
    const cId = makeUser(ctx.db, 'c@example.com');
    const { proposal, source } = await proposalFor(ctx, cId);
    ctx.db.prepare('UPDATE sources SET bib_isbn = ?, bib_edition = ? WHERE user_id = ? AND id = ?').run('9781455745890', '8', cId, source.id);
    const providerC = counting();
    await generate(ctx, cId, proposal, providerC);
    assert.equal(providerC.calls, 1, 'known, different editions never reuse');

    // the same edition declared by both is still a hit
    const dId = makeUser(ctx.db, 'd@example.com');
    const { proposal: same, source: sameSource } = await proposalFor(ctx, dId);
    ctx.db.prepare('UPDATE sources SET bib_isbn = ?, bib_edition = ? WHERE user_id = ? AND id = ?').run('9780323086141', '7', dId, sameSource.id);
    const providerD = counting();
    const draft = await generate(ctx, dId, same, providerD);
    assert.equal(providerD.calls, 0);
    assert.equal(draft.sharedReuse, true);
  } finally { ctx.cleanup(); }
});

test('nothing is offered without opt-in, and turning it off withdraws what was offered', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const a = await contributor(ctx, { consent: false });
    assert.equal(isReuseGranted(ctx.db, a.userId), false, 'off by default');
    assert.equal(shared(ctx.db).length, 0, 'no consent, nothing contributed');

    const b = makeUser(ctx.db, 'b@example.com');
    const { proposal: pb } = await proposalFor(ctx, b);
    const providerB = counting();
    await generate(ctx, b, pb, providerB);
    assert.equal(providerB.calls, 1, 'no entry: generated normally');

    // C opts in and accepts: offered. Then C withdraws: D generates again.
    const c = makeUser(ctx.db, 'c@example.com');
    setReuseConsent(ctx.db, c, true);
    const { proposal: pc } = await proposalFor(ctx, c);
    const dc = await generate(ctx, c, pc, counting());
    acceptDraft(ctx.db, c, dc.id, { ...INPUT, expectedRevision: dc.revision });
    assert.equal(shared(ctx.db).filter((s) => s.status === 'ACTIVE').length, 1);
    setReuseConsent(ctx.db, c, false);
    const d = makeUser(ctx.db, 'd@example.com');
    const { proposal: pd } = await proposalFor(ctx, d);
    const providerD = counting();
    await generate(ctx, d, pd, providerD);
    assert.equal(providerD.calls, 1, 'withdrawn content is not offered');
    assert.equal(shared(ctx.db).filter((s) => s.status === 'ACTIVE').length, 0);
  } finally { ctx.cleanup(); }
});

test('only unedited AI content is offered: a student-edited summary, an edited question, a rejected one and a human-added one stay private', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const a = makeUser(ctx.db, 'a@example.com');
    setReuseConsent(ctx.db, a, true);
    const { proposal } = await proposalFor(ctx, a);
    const draft = await generate(ctx, a, proposal, counting());
    const [first, second] = draft.questions;
    drafts.reviseQuestion(ctx.db, a, draft.id, first.id, { answer: 'Resposta que o aluno corrigiu.' });
    drafts.reviseQuestion(ctx.db, a, draft.id, second.id, { status: 'REJECTED' });
    drafts.addQuestion(ctx.db, a, draft.id, { question: 'Pergunta minha?', answer: 'Minha resposta.', explanation: 'Minha explicação.', hint: 'Minha dica.', sourceSpans: [{ pageIndex: 1 }] });
    const current = drafts.getDraft(ctx.db, a, draft.id);
    acceptDraft(ctx.db, a, draft.id, { ...INPUT, expectedRevision: current.revision });
    const [entry] = shared(ctx.db);
    const offered = JSON.parse(entry.questions_json);
    assert.equal(offered.length, 0, 'edited, rejected and human-added questions are not offered');
    assert.equal(JSON.stringify(entry).includes('Minha'), false);

    // an edited summary is never offered at all
    const b = makeUser(ctx.db, 'b@example.com');
    setReuseConsent(ctx.db, b, true);
    ctx.db.prepare('DELETE FROM shared_content').run();
    const { proposal: pb } = await proposalFor(ctx, b);
    const db2 = await generate(ctx, b, pb, counting());
    drafts.reviseSummary(ctx.db, b, db2.id, { summary: 'Resumo reescrito pelo aluno: filtracao depende da pressao.', expectedVersion: db2.summaryVersion });
    const cur2 = drafts.getDraft(ctx.db, b, db2.id);
    acceptDraft(ctx.db, b, db2.id, { ...INPUT, expectedRevision: cur2.revision });
    assert.equal(shared(ctx.db).length, 0, 'an edited summary is not offered');
  } finally { ctx.cleanup(); }
});

test('summary first: the questions of a reviewed summary come with no call; a summary without questions asks the model once, and those questions then serve the next student', OPTS, async () => {
  const ctx = tmpDb();
  try {
    // A accepted the summary only (summary-first): the entry has no questions yet
    const a = await contributor(ctx, { withQuestions: false });
    assert.equal(JSON.parse(shared(ctx.db)[0].questions_json).length, 0);

    // B receives the summary with no call, in the summary-first shape; asking for the questions is one real call
    const b = makeUser(ctx.db, 'b@example.com');
    setReuseConsent(ctx.db, b, true);
    const { proposal: pb } = await proposalFor(ctx, b);
    const providerB = counting({ withQuestions: false });
    const draftB = await generate(ctx, b, pb, providerB, { codex: { deferQuestions: true } });
    assert.equal(providerB.calls, 0);
    assert.equal(draftB.sharedReuse, true);
    assert.equal(draftB.questionsDeferred, true);
    assert.equal(draftB.questions.length, 0);
    const withQuestions = await drafts.generateDeferredQuestions(ctx.db, b, draftB.id, { providerImpl: providerB });
    assert.equal(providerB.questionCalls, 1, 'no reviewed questions exist yet: the model is asked once');
    assert.equal(withQuestions.questions.length, 2);
    acceptDraft(ctx.db, b, draftB.id, { ...INPUT, expectedRevision: drafts.getDraft(ctx.db, b, draftB.id).revision });
    assert.equal(JSON.parse(shared(ctx.db)[0].questions_json).length, 2, 'B reviewed the questions: they join the entry');

    // C: summary AND questions with no call at all
    const c = makeUser(ctx.db, 'c@example.com');
    const { proposal: pc } = await proposalFor(ctx, c);
    const providerC = counting({ withQuestions: false });
    const draftC = await generate(ctx, c, pc, providerC, { codex: { deferQuestions: true } });
    assert.equal(providerC.calls + providerC.questionCalls, 0);
    assert.equal(draftC.questions.length, 2);
    assert.equal(draftC.questionsDeferred, undefined);
    void a;

    // D reuses only the questions: summary-first draft whose entry already holds reviewed questions, asked for later
    const d = makeUser(ctx.db, 'd@example.com');
    const { proposal: pd } = await proposalFor(ctx, d);
    ctx.db.prepare("UPDATE shared_content SET status = 'WITHDRAWN'").run();
    const providerD = counting({ withQuestions: false });
    const draftD = await generate(ctx, d, pd, providerD, { codex: { deferQuestions: true } });
    assert.equal(providerD.calls, 1, 'entry withdrawn: summary generated by the model');
    ctx.db.prepare("UPDATE shared_content SET status = 'ACTIVE'").run();
    const later = await drafts.generateDeferredQuestions(ctx.db, d, draftD.id, { providerImpl: providerD });
    assert.equal(providerD.questionCalls, 0, 'reviewed questions for the same text are reused: no second call');
    assert.equal(later.questions.length, 2);
  } finally { ctx.cleanup(); }
});

test('isolation: B can neither see nor change A\'s data through the reuse', OPTS, async () => {
  const ctx = tmpDb();
  try {
    const a = await contributor(ctx);
    const aDraftBefore = JSON.stringify(ctx.db.prepare('SELECT * FROM generated_drafts WHERE user_id = ?').all(a.userId));
    const b = makeUser(ctx.db, 'b@example.com');
    const { proposal } = await proposalFor(ctx, b);
    const reused = await generate(ctx, b, proposal, counting());
    assert.equal(reused.sharedReuse, true);
    // B's edits stay B's: the entry and A's rows are not touched
    drafts.reviseSummary(ctx.db, b, reused.id, { summary: 'Resumo do B: filtracao depende da pressao.', expectedVersion: reused.summaryVersion });
    assert.equal(JSON.stringify(ctx.db.prepare('SELECT * FROM generated_drafts WHERE user_id = ?').all(a.userId)), aDraftBefore);
    assert.match(JSON.parse(shared(ctx.db)[0].summary_json).summary, /pressao hidrostatica/);
    // A's draft is invisible to B
    assert.throws(() => drafts.getDraft(ctx.db, b, a.draft.id));
  } finally { ctx.cleanup(); }
});

test('through the background job: the summary and then the questions are reused with no provider call and nothing reserved, the job still ends SUCCEEDED', OPTS, async () => {
  const ctx = tmpDb();
  try {
    await contributor(ctx, { withQuestions: false });
    const b = makeUser(ctx.db, 'b@example.com');
    const { proposal } = await proposalFor(ctx, b);
    const provider = counting({ withQuestions: false, live: true });
    const runner = createJobRunner(ctx.db, { settings: () => ({ providerImpl: provider, maxInputChars: 50_000, codex: { deferQuestions: true } }), cancelGraceMs: 20_000, hardLimitMs: 60_000 });
    const { job } = createJob(ctx.db, b, proposal.id, { provider: { name: provider.name, live: true, plannedCalls: 1 } });
    await runner.start({ ...job, userId: b });
    const done = getJob(ctx.db, b, job.id);
    assert.equal(done.state, 'SUCCEEDED');
    assert.equal(provider.calls, 0, 'the job reused reviewed content: no model call');
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM generation_reservations').get().n, 0, 'nothing was reserved');
    const draft = drafts.getDraft(ctx.db, b, done.draftId);
    assert.equal(draft.sharedReuse ?? draft.reusedFrom != null, true);
    assert.equal(draft.questionsDeferred, true);

    // reviewed questions for the same text appear meanwhile (another student's acceptance): the questions job reuses them too
    ctx.db.prepare('UPDATE shared_content SET questions_json = ?').run(JSON.stringify([good(1), good(2)]));
    const qjob = createQuestionsJob(ctx.db, b, draft.id, { provider: { name: provider.name, live: true, plannedCalls: 1 } });
    await runner.start({ ...qjob.job, userId: b });
    assert.equal(getJob(ctx.db, b, qjob.job.id).state, 'SUCCEEDED');
    assert.equal(provider.questionCalls, 0);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM generation_reservations').get().n, 0);
    assert.equal(drafts.getDraft(ctx.db, b, draft.id).questions.length, 2);
  } finally { ctx.cleanup(); }
});
