import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import * as drafts from '../src/services/generated-drafts.js';
import * as exercisesService from '../src/services/exercises.js';
import { acceptDraft, AcceptDraftError } from '../src/services/accept-draft.js';
import * as learningUnitsService from '../src/services/learning-units.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-accept-draft-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const sourcesDir = join(dir, 'sources');
  return { db, sourcesDir, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)
  `).run(email, email, now, now).lastInsertRowid;
}

async function makeDraft(db, userId, sourcesDir, pagesText) {
  const buffer = buildFixturePdf(pagesText);
  const source = sourceStorage.acceptUpload(db, userId, { buffer, originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  const draft = await drafts.createDraft(db, userId, proposal.id, {});
  return { source, proposal, draft };
}

test('accepting a draft creates exactly one subject/unit/16 reviews/N exercises with AI_GENERATED provenance and resolvable citations', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a@example.com');
    const { source, draft } = await makeDraft(db, userId, sourcesDir, ['Farmacocinética básica', 'Farmacodinâmica básica']);

    const result = acceptDraft(db, userId, draft.id, { newSubjectName: 'Farmacologia', studyDate: '2026-03-01', expectedRevision: draft.revision });
    assert.equal(result.reviewCount, 16);
    assert.equal(result.exerciseCount, 2);
    assert.equal(result.acceptedBy, userId);

    const { n: subjectCount } = db.prepare('SELECT COUNT(*) as n FROM subjects WHERE user_id = ?').get(userId);
    assert.equal(subjectCount, 1);
    const { n: unitCount } = db.prepare('SELECT COUNT(*) as n FROM learning_units WHERE user_id = ?').get(userId);
    assert.equal(unitCount, 1);
    const { n: reviewCount } = db.prepare('SELECT COUNT(*) as n FROM review_tasks WHERE user_id = ? AND unit_id = ?').get(userId, result.unit.id);
    assert.equal(reviewCount, 16);
    const versions = db.prepare(`
      SELECT ev.* FROM exercise_versions ev
      JOIN exercises e ON e.user_id = ev.user_id AND e.id = ev.exercise_id
      WHERE ev.user_id = ? AND e.unit_id = ?
    `).all(userId, result.unit.id);
    assert.equal(versions.length, 2);
    assert.ok(versions.every((v) => v.provenance === 'AI_GENERATED'));

    // Citations remain resolvable: every cited page actually has real
    // extracted text in source_pages, and the citation's own frozen
    // snapshot matches it at acceptance time (A1: the snapshot is what
    // survives a LATER re-extraction, proven in the dedicated test below).
    for (const version of versions) {
      const citations = db.prepare('SELECT * FROM exercise_source_citations WHERE user_id = ? AND exercise_version_id = ?').all(userId, version.id);
      assert.ok(citations.length > 0);
      for (const citation of citations) {
        assert.equal(citation.source_id, source.id);
        const page = db.prepare('SELECT text FROM source_pages WHERE user_id = ? AND source_id = ? AND page_index = ?').get(userId, citation.source_id, citation.page_index);
        assert.ok(page, 'a citation must resolve to a real source_pages row');
        assert.ok(page.text.length > 0);
        assert.equal(citation.page_text_snapshot, page.text);
        assert.ok(citation.parser_version_snapshot);
      }
    }

    const draftRow = db.prepare('SELECT status, accepted_unit_id FROM generated_drafts WHERE id = ?').get(draft.id);
    assert.equal(draftRow.status, 'ACCEPTED');
    assert.equal(draftRow.accepted_unit_id, result.unit.id);
  } finally { cleanup(); }
});

test('A1: a historical citation stays reconstructible after the source is re-extracted with different content', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'a2@example.com');
    const { source, draft } = await makeDraft(db, userId, sourcesDir, ['Texto original da página um']);
    const result = acceptDraft(db, userId, draft.id, { newSubjectName: 'Farmacologia A1', studyDate: '2026-03-01', expectedRevision: draft.revision });

    const [version] = db.prepare(`
      SELECT ev.* FROM exercise_versions ev
      JOIN exercises e ON e.user_id = ev.user_id AND e.id = ev.exercise_id
      WHERE ev.user_id = ? AND e.unit_id = ?
    `).all(userId, result.unit.id);
    const [citation] = db.prepare('SELECT * FROM exercise_source_citations WHERE user_id = ? AND exercise_version_id = ?').all(userId, version.id);
    assert.equal(citation.page_text_snapshot, 'Texto original da página um');

    // Simulate a later re-extraction that produces DIFFERENT text for the
    // exact same (source_id, page_index) -- e.g. a parser upgrade, or a
    // fix for a bad first pass. This is exactly what
    // source-extraction.js's DELETE+INSERT re-extraction does for real.
    db.prepare('UPDATE source_pages SET text = ? WHERE user_id = ? AND source_id = ? AND page_index = ?')
      .run('Texto COMPLETAMENTE DIFERENTE após reextração', userId, source.id, citation.page_index);

    const citationAfter = db.prepare('SELECT page_text_snapshot FROM exercise_source_citations WHERE id = ?').get(citation.id);
    assert.equal(
      citationAfter.page_text_snapshot,
      'Texto original da página um',
      'a historical citation must keep pointing to what was actually shown, immune to a later re-extraction of the same page',
    );
  } finally { cleanup(); }
});

test('C3: accepting with a stale expectedRevision after a concurrent edit is an explicit conflict, never a silent publish of the un-reviewed content', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c3@example.com');
    const { draft } = await makeDraft(db, userId, sourcesDir, ['conteudo original do rascunho']);
    const staleRevision = draft.revision;

    // Someone (or another tab) edits the draft between when this caller
    // read it and when they click accept.
    drafts.reviseDraft(db, userId, draft.id, {
      summary: 'Resumo revisado por outra sessão',
      questions: [{ question: 'Pergunta revisada?', answer: 'Resposta revisada', hint: null, sourceSpans: [{ pageIndex: 1 }] }],
    });

    assert.throws(
      () => acceptDraft(db, userId, draft.id, { newSubjectName: 'Farmacologia', studyDate: '2026-03-01', expectedRevision: staleRevision }),
      (err) => err.code === 'REVISION_CONFLICT',
    );
    assert.equal(db.prepare('SELECT COUNT(*) as n FROM learning_units WHERE user_id = ?').get(userId).n, 0, 'a revision conflict must create nothing');

    // Accepting with the CURRENT revision succeeds and publishes the
    // content the caller would see if they reloaded — the edited version,
    // not the stale one they originally fetched.
    const current = drafts.getDraft(db, userId, draft.id);
    const result = acceptDraft(db, userId, draft.id, { newSubjectName: 'Farmacologia', studyDate: '2026-03-01', expectedRevision: current.revision });
    const [version] = db.prepare(`
      SELECT ev.question, ev.answer FROM exercise_versions ev
      JOIN exercises e ON e.user_id = ev.user_id AND e.id = ev.exercise_id
      WHERE ev.user_id = ? AND e.unit_id = ?
    `).all(userId, result.unit.id);
    assert.equal(version.question, 'Pergunta revisada?');
    assert.equal(version.answer, 'Resposta revisada');
  } finally { cleanup(); }
});

test('acceptDraft requires an explicit expectedRevision — omitting it is a validation error, never an implicit accept-whatever-is-current', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c3b@example.com');
    const { draft } = await makeDraft(db, userId, sourcesDir, ['conteudo']);

    assert.throws(
      () => acceptDraft(db, userId, draft.id, { newSubjectName: 'X', studyDate: '2026-03-01' }),
      (err) => err.code === 'VALIDATION_FAILED' && err.field === 'expectedRevision',
    );
  } finally { cleanup(); }
});

test('repeated acceptance returns the exact same result and creates nothing new', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b@example.com');
    const { draft } = await makeDraft(db, userId, sourcesDir, ['conteudo unico']);

    const first = acceptDraft(db, userId, draft.id, { newSubjectName: 'Farmacologia', studyDate: '2026-03-01', expectedRevision: draft.revision });
    const second = acceptDraft(db, userId, draft.id, { newSubjectName: 'Ignorado desta vez', studyDate: '2099-01-01', expectedRevision: draft.revision });
    assert.deepEqual(first, second, 'a repeated acceptance must return the identical first result, ignoring any new params');

    assert.equal(db.prepare('SELECT COUNT(*) as n FROM subjects WHERE user_id = ?').get(userId).n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) as n FROM learning_units WHERE user_id = ?').get(userId).n, 1);
  } finally { cleanup(); }
});

test('a midway failure (foreign-owned subjectId) leaves zero partial rows and the draft still DRAFT', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'c@example.com');
    const otherUserId = makeUser(db, 'other@example.com');
    const foreignSubjectId = db.prepare(`
      INSERT INTO subjects (user_id, name, created_at, updated_at) VALUES (?, 'Foreign', ?, ?)
    `).run(otherUserId, new Date().toISOString(), new Date().toISOString()).lastInsertRowid;

    const { draft } = await makeDraft(db, userId, sourcesDir, ['conteudo']);

    assert.throws(
      () => acceptDraft(db, userId, draft.id, { subjectId: foreignSubjectId, studyDate: '2026-03-01', expectedRevision: draft.revision }),
      (err) => err instanceof AcceptDraftError && err.code === 'NOT_FOUND',
    );

    assert.equal(db.prepare('SELECT COUNT(*) as n FROM learning_units WHERE user_id = ?').get(userId).n, 0, 'no unit may exist after a failed acceptance');
    assert.equal(db.prepare('SELECT COUNT(*) as n FROM review_tasks WHERE user_id = ?').get(userId).n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) as n FROM exercises WHERE user_id = ?').get(userId).n, 0);
    const draftRow = db.prepare('SELECT status FROM generated_drafts WHERE id = ?').get(draft.id);
    assert.equal(draftRow.status, 'DRAFT', 'a failed acceptance must never leave the draft ACCEPTED');
  } finally { cleanup(); }
});

test('a calendar-invalid studyDate is rejected before any row is written', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'd@example.com');
    const { draft } = await makeDraft(db, userId, sourcesDir, ['conteudo']);

    // generateReviewDates (shared/review-schedule.js) throws a plain Error
    // for a calendar-invalid date — same as learning-units.js's own
    // create() does; accept-draft.js does not re-wrap it.
    assert.throws(() => acceptDraft(db, userId, draft.id, { newSubjectName: 'X', studyDate: '2026-02-30', expectedRevision: draft.revision }));
    assert.equal(db.prepare('SELECT COUNT(*) as n FROM learning_units WHERE user_id = ?').get(userId).n, 0);
  } finally { cleanup(); }
});

test('AI-generated and manually-authored exercises coexist on the same unit with distinct provenance', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'e@example.com');
    const { draft } = await makeDraft(db, userId, sourcesDir, ['conteudo']);
    const result = acceptDraft(db, userId, draft.id, { newSubjectName: 'Farmacologia', studyDate: '2026-03-01', expectedRevision: draft.revision });

    const manual = exercisesService.create(db, userId, { unitId: result.unit.id, question: 'Pergunta manual', answer: 'Resposta manual', provenance: 'MANUAL' });
    assert.equal(manual.currentVersion.provenance, 'MANUAL');

    const allVersions = db.prepare(`
      SELECT DISTINCT ev.provenance FROM exercise_versions ev
      JOIN exercises e ON e.user_id = ev.user_id AND e.id = ev.exercise_id
      WHERE ev.user_id = ? AND e.unit_id = ?
    `).all(userId, result.unit.id).map((r) => r.provenance).sort();
    assert.deepEqual(allVersions, ['AI_GENERATED', 'MANUAL']);
  } finally { cleanup(); }
});

test('a user cannot accept a draft owned by another user', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userA = makeUser(db, 'f@example.com');
    const userB = makeUser(db, 'g@example.com');
    const { draft } = await makeDraft(db, userA, sourcesDir, ['conteudo']);

    assert.throws(() => acceptDraft(db, userB, draft.id, { newSubjectName: 'X', studyDate: '2026-03-01', expectedRevision: draft.revision }), (err) => err.code === 'NOT_FOUND');
  } finally { cleanup(); }
});

test('HTTP: full pipeline over real HTTP — upload, extract, chunk, draft, and accept produce a real usable unit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-accept-draft-http-'));
  const path = join(dir, 'test.db');
  const sourcesDir = join(dir, 'sources');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir, ...UPLOAD_DEFAULTS } });
  try {
    const email = 'httpaccept@example.com';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: 'a genuinely long test password 1' } });
    const cookie = loginRes.headers['set-cookie'].split(';')[0];
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
    const csrfToken = JSON.parse(me.body).csrfToken;

    const boundary = 'sl-accept-boundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'),
      buildFixturePdf(['pagina real']),
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
    ]);
    const uploadRes = await app.inject({
      method: 'POST', url: '/v1/sources',
      headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    const sourceId = JSON.parse(uploadRes.body).source.id;
    await app.inject({ method: 'POST', url: `/v1/sources/${sourceId}/extract`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken } });
    const chunkRes = await app.inject({
      method: 'POST', url: `/v1/sources/${sourceId}/proposals`,
      headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json' }, payload: {},
    });
    const proposalId = JSON.parse(chunkRes.body).proposals[0].id;
    const draftRes = await app.inject({
      method: 'POST', url: `/v1/proposals/${proposalId}/drafts`,
      headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json' }, payload: {},
    });
    const draftBody = JSON.parse(draftRes.body).draft;
    const draftId = draftBody.id;

    const acceptRes = await app.inject({
      method: 'POST', url: `/v1/drafts/${draftId}/accept`,
      headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { newSubjectName: 'Farmacologia HTTP', studyDate: '2026-03-01', expectedRevision: draftBody.revision },
    });
    assert.equal(acceptRes.statusCode, 200);
    const acceptance = JSON.parse(acceptRes.body).acceptance;
    assert.equal(acceptance.reviewCount, 16);

    const unitRes = await app.inject({ method: 'GET', url: `/v1/learning-units/${acceptance.unit.id}`, headers: { cookie } });
    assert.equal(unitRes.statusCode, 200);

    const exercisesRes = await app.inject({ method: 'GET', url: `/v1/learning-units/${acceptance.unit.id}/exercises`, headers: { cookie } });
    assert.equal(JSON.parse(exercisesRes.body).exercises.length, acceptance.exerciseCount);

    // Idempotent retry over HTTP too.
    const secondAcceptRes = await app.inject({
      method: 'POST', url: `/v1/drafts/${draftId}/accept`,
      headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { newSubjectName: 'Different', studyDate: '2099-01-01', expectedRevision: draftBody.revision },
    });
    assert.equal(secondAcceptRes.statusCode, 200);
    assert.deepEqual(JSON.parse(secondAcceptRes.body).acceptance, acceptance);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

// CONTENT-QUALITY CQ-2: the Resumo Mestre's own provenance survives acceptance, frozen.
test('an accepted unit exposes the source pages its Resumo Mestre came from, frozen at acceptance and owner-scoped; manual units have none', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'summ-src@example.com');
    const otherId = makeUser(db, 'summ-src-other@example.com');
    const { source, draft } = await makeDraft(db, userId, sourcesDir, ['Texto original da página um', 'Texto original da página dois']);
    assert.deepEqual(draft.summarySourceSpans.map((s) => s.pageIndex), [1, 2], 'a provider that does not say gets the whole range, never an empty origin');
    const result = acceptDraft(db, userId, draft.id, { newSubjectName: 'Renal', studyDate: '2026-03-01', expectedRevision: draft.revision });

    const sources = learningUnitsService.summarySources(db, userId, result.unit.id);
    assert.deepEqual(sources.map((s) => [s.sourceName, s.pageIndex, s.pageText]), [
      ['aula.pdf', 1, 'Texto original da página um'],
      ['aula.pdf', 2, 'Texto original da página dois'],
    ]);

    // frozen: a later re-extraction of the same page must not change what the summary points to
    db.prepare('UPDATE source_pages SET text = ? WHERE user_id = ? AND source_id = ? AND page_index = 1').run('OUTRO TEXTO', userId, source.id);
    assert.equal(learningUnitsService.summarySources(db, userId, result.unit.id)[0].pageText, 'Texto original da página um');

    // owner-scoped
    assert.throws(() => learningUnitsService.summarySources(db, otherId, result.unit.id), (e) => e.code === 'NOT_FOUND');

    // a manually created unit has no summary provenance (and nothing is invented for it)
    const manual = learningUnitsService.create(db, userId, { newSubjectName: 'Manual', title: 'Aula manual', summaryBody: 'Resumo digitado', studyDate: '2026-03-02' });
    assert.deepEqual(learningUnitsService.summarySources(db, userId, manual.unit.id), []);
  } finally { cleanup(); }
});

test('a draft whose summary cites only some pages freezes exactly those pages, not the whole proposal', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'summ-part@example.com');
    const { draft } = await makeDraft(db, userId, sourcesDir, ['Página um', 'Página dois', 'Página três']);
    drafts.reviseDraft(db, userId, draft.id, {});
    const row = db.prepare('SELECT draft_json, revision FROM generated_drafts WHERE id = ?').get(draft.id);
    const content = JSON.parse(row.draft_json);
    content.summarySourceSpans = [{ pageIndex: 2 }];
    db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify(content), draft.id);
    const result = acceptDraft(db, userId, draft.id, { newSubjectName: 'Parcial', studyDate: '2026-03-01', expectedRevision: row.revision });
    assert.deepEqual(learningUnitsService.summarySources(db, userId, result.unit.id).map((s) => s.pageIndex), [2]);
  } finally { cleanup(); }
});
