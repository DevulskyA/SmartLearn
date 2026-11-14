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
import * as jobs from '../src/services/generation-jobs.js';
import { acceptDraft } from '../src/services/accept-draft.js';
import { generateDraft as fakeGenerateDraft, FAKE_PROVIDER_NAME } from '../src/ai/fake-provider.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// Regenerating a summary is an explicit act that keeps the previous one until the student decides (spec RESUMO-ATUAL-E-LIXEIRA-2026-11-12):
//   - the new draft becomes the current one and the previous DRAFT is kept, UNTOUCHED, with a decision pending;
//   - while a decision is pending, generating again is refused BEFORE any provider is reached (no credit can be spent);
//   - KEEP_NEW deletes the previous draft; RESTORE_PREVIOUS deletes the new one; neither spends credit;
//   - no decision: the previous draft expires after 30 days and the new one stays current;
//   - an ACCEPTED lesson is never replaced, deleted or expired by this: it is a lesson in study with reviews.

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const TEST_ORIGIN = 'https://smartlearn.test';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const DAY_MS = 24 * 60 * 60 * 1000;
const ACCEPT = { newSubjectName: 'Fisiologia', studyDate: '2026-10-03' };

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-replace-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { dir, db, sourcesDir: join(dir, 'sources'), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

function spyProvider() {
  const spy = { name: FAKE_PROVIDER_NAME, live: false, calls: 0, generate: (input) => { spy.calls += 1; return fakeGenerateDraft(input); } };
  return spy;
}

async function oneUnit(db, userId, sourcesDir, text = 'conteudo de teste da aula') {
  const source = sourceStorage.acceptUpload(db, userId, { buffer: buildFixturePdf([text]), originalName: 'aula.pdf', contentType: 'application/pdf', sourcesDir, ...UPLOAD_DEFAULTS });
  await extractSource(db, userId, source.id, { sourcesDir });
  const [proposal] = proposals.chunkSource(db, userId, source.id, { maxPagesPerChunk: 10 });
  return { source, proposal };
}

const row = (db, id) => db.prepare('SELECT * FROM generated_drafts WHERE id = ?').get(id);
const exists = (db, id) => row(db, id) !== undefined;
const record = (db, userId, proposalId) => db.prepare('SELECT * FROM draft_replacements WHERE user_id = ? AND proposal_id = ?').get(userId, proposalId);
const draftCount = (db, userId) => db.prepare('SELECT COUNT(*) AS n FROM generated_drafts WHERE user_id = ?').get(userId).n;
const at = (iso) => () => new Date(iso);

// two drafts of one proposal: `first` (the previous) and `second` (the new, regenerated one)
async function twoDrafts(db, sourcesDir, email, now = at('2026-11-12T10:00:00.000Z')) {
  const userId = makeUser(db, email);
  const { source, proposal } = await oneUnit(db, userId, sourcesDir);
  const providerImpl = spyProvider();
  const first = await drafts.createDraft(db, userId, proposal.id, { providerImpl, now });
  const second = await drafts.createDraft(db, userId, proposal.id, { providerImpl, regenerate: true, now });
  return { userId, source, proposal, providerImpl, first, second, now };
}

test('migration 043 adds only a new table: the drafts that already exist are not touched', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'rp0@example.com');
    const { proposal } = await oneUnit(db, userId, sourcesDir);
    const draft = await drafts.createDraft(db, userId, proposal.id, { providerImpl: spyProvider() });
    const before = JSON.stringify(row(db, draft.id));
    const columns = db.prepare('PRAGMA table_info(generated_drafts)').all().map((c) => c.name);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'draft_replacements'").get(), 'the table exists');
    assert.equal(JSON.stringify(row(db, draft.id)), before);
    assert.ok(!columns.includes('expires_at') && !columns.includes('replaces_draft_id'), 'generated_drafts itself gained no column');
  } finally { cleanup(); }
});

test('the first generation of a unit has nothing to replace: no decision is recorded', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'rp1@example.com');
    const { proposal } = await oneUnit(db, userId, sourcesDir);
    await drafts.createDraft(db, userId, proposal.id, { providerImpl: spyProvider() });
    assert.equal(record(db, userId, proposal.id), undefined);
    assert.equal(drafts.pendingDecision(db, userId, proposal.id), null);
  } finally { cleanup(); }
});

test('regenerating over a DRAFT keeps the previous one untouched, records the decision and sets a 30-day expiry', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'rp2@example.com');
    const { proposal } = await oneUnit(db, userId, sourcesDir);
    const providerImpl = spyProvider();
    const now = at('2026-11-12T10:00:00.000Z');
    const first = await drafts.createDraft(db, userId, proposal.id, { providerImpl, now });
    const before = JSON.stringify(row(db, first.id));
    const second = await drafts.createDraft(db, userId, proposal.id, { providerImpl, regenerate: true, now });
    assert.equal(providerImpl.calls, 2);
    assert.equal(JSON.stringify(row(db, first.id)), before, 'the previous draft is byte-identical');
    const pending = drafts.pendingDecision(db, userId, proposal.id);
    assert.equal(pending.previousDraftId, first.id);
    assert.equal(pending.newDraftId, second.id);
    assert.equal(pending.expiresAt, '2026-12-12T10:00:00.000Z');
    assert.equal(pending.createdAt, '2026-11-12T10:00:00.000Z');
  } finally { cleanup(); }
});

test('while a decision is pending, regenerating is refused before any provider call and leaves everything as it was', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, proposal, providerImpl } = await twoDrafts(db, sourcesDir, 'rp3@example.com');
    const callsBefore = providerImpl.calls;
    const rowsBefore = draftCount(db, userId);
    const recordBefore = JSON.stringify(record(db, userId, proposal.id));
    await assert.rejects(() => drafts.createDraft(db, userId, proposal.id, { providerImpl, regenerate: true }), (err) => err.code === 'DECISION_PENDING');
    assert.equal(providerImpl.calls, callsBefore, 'no call reached a model');
    assert.equal(draftCount(db, userId), rowsBefore);
    assert.equal(JSON.stringify(record(db, userId, proposal.id)), recordBefore);
  } finally { cleanup(); }
});

test('two regenerates at once: the second finds the first decision and stores no draft that no decision covers', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'rp3b@example.com');
    const { proposal } = await oneUnit(db, userId, sourcesDir);
    const now = at('2026-11-12T10:00:00.000Z');
    await drafts.createDraft(db, userId, proposal.id, { providerImpl: spyProvider(), now });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const slow = { name: FAKE_PROVIDER_NAME, live: false, calls: 0, generate: async (input) => { slow.calls += 1; await gate; return fakeGenerateDraft(input); } };
    const a = drafts.createDraft(db, userId, proposal.id, { providerImpl: slow, regenerate: true, now });
    const b = drafts.createDraft(db, userId, proposal.id, { providerImpl: slow, regenerate: true, now });
    release();
    const results = await Promise.allSettled([a, b]);
    assert.equal(slow.calls, 2, 'both passed the early check (the race is real)');
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'DECISION_PENDING');
    assert.equal(draftCount(db, userId), 2, 'the previous draft and ONE new draft; no orphan');
    assert.ok(drafts.pendingDecision(db, userId, proposal.id));
  } finally { cleanup(); }
});

test('a plain request (no regenerate) while a decision is pending still reuses the current draft with no provider call', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, proposal, providerImpl, second } = await twoDrafts(db, sourcesDir, 'rp4@example.com');
    const callsBefore = providerImpl.calls;
    const again = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    assert.equal(again.id, second.id);
    assert.equal(again.reused, true);
    assert.equal(providerImpl.calls, callsBefore);
  } finally { cleanup(); }
});

test('KEEP_NEW deletes the previous draft and clears the decision; the new one stays current with no provider call', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, proposal, providerImpl, first, second, now } = await twoDrafts(db, sourcesDir, 'rp5@example.com');
    const callsBefore = providerImpl.calls;
    const result = drafts.decideReplacement(db, userId, second.id, 'KEEP_NEW', now);
    assert.deepEqual(result, { decision: 'KEEP_NEW', currentDraftId: second.id, deletedDraftId: first.id });
    assert.equal(exists(db, first.id), false, 'what the student discarded is not kept');
    assert.equal(exists(db, second.id), true);
    assert.equal(record(db, userId, proposal.id), undefined);
    const again = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    assert.equal(again.id, second.id);
    assert.equal(providerImpl.calls, callsBefore, 'deciding spends nothing');
  } finally { cleanup(); }
});

test('RESTORE_PREVIOUS deletes the new draft and the previous one is current again, with no provider call', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, proposal, providerImpl, first, second, now } = await twoDrafts(db, sourcesDir, 'rp6@example.com');
    const callsBefore = providerImpl.calls;
    const previousBefore = JSON.stringify(row(db, first.id));
    const result = drafts.decideReplacement(db, userId, second.id, 'RESTORE_PREVIOUS', now);
    assert.deepEqual(result, { decision: 'RESTORE_PREVIOUS', currentDraftId: first.id, deletedDraftId: second.id });
    assert.equal(exists(db, second.id), false);
    assert.equal(JSON.stringify(row(db, first.id)), previousBefore);
    assert.equal(record(db, userId, proposal.id), undefined);
    const again = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    assert.equal(again.id, first.id);
    assert.equal(again.reused, true);
    assert.equal(providerImpl.calls, callsBefore);
  } finally { cleanup(); }
});

const markEdited = (db, id) => {
  const content = JSON.parse(row(db, id).draft_json);
  db.prepare('UPDATE generated_drafts SET draft_json = ? WHERE id = ?').run(JSON.stringify({ ...content, summaryOrigin: 'HUMAN_EDITED', summaryEditedAt: '2026-11-12T11:00:00.000Z' }), id);
};

test('a draft the student edited is never deleted by a decision until it is confirmed (both directions)', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const a = await twoDrafts(db, sourcesDir, 'rp-edit1@example.com');
    markEdited(db, a.second.id);
    assert.throws(() => drafts.decideReplacement(db, a.userId, a.second.id, 'RESTORE_PREVIOUS'), (err) => err.code === 'DISCARD_NEEDS_CONFIRMATION');
    assert.throws(() => drafts.decideReplacement(db, a.userId, a.second.id, 'RESTORE_PREVIOUS', { confirmDiscard: false }), (err) => err.code === 'DISCARD_NEEDS_CONFIRMATION');
    assert.ok(exists(db, a.second.id) && exists(db, a.first.id) && record(db, a.userId, a.proposal.id), 'nothing deleted, decision still pending');
    // keeping the edited one deletes the plain previous: no confirmation needed
    const kept = drafts.decideReplacement(db, a.userId, a.second.id, 'KEEP_NEW');
    assert.equal(kept.deletedDraftId, a.first.id);

    const b = await twoDrafts(db, sourcesDir, 'rp-edit2@example.com');
    markEdited(db, b.first.id);
    assert.throws(() => drafts.decideReplacement(db, b.userId, b.second.id, 'KEEP_NEW'), (err) => err.code === 'DISCARD_NEEDS_CONFIRMATION');
    assert.ok(exists(db, b.first.id) && record(db, b.userId, b.proposal.id));
    const done = drafts.decideReplacement(db, b.userId, b.second.id, 'KEEP_NEW', { confirmDiscard: true });
    assert.equal(done.deletedDraftId, b.first.id);
    assert.ok(!exists(db, b.first.id) && !record(db, b.userId, b.proposal.id));

    const c = await twoDrafts(db, sourcesDir, 'rp-edit3@example.com');
    markEdited(db, c.second.id);
    const restored = drafts.decideReplacement(db, c.userId, c.second.id, 'RESTORE_PREVIOUS', { confirmDiscard: true });
    assert.equal(restored.currentDraftId, c.first.id);
    assert.ok(!exists(db, c.second.id));
  } finally { cleanup(); }
});

test('after a decision the student can regenerate again (the pending state is gone)', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, proposal, providerImpl, second, now } = await twoDrafts(db, sourcesDir, 'rp7@example.com');
    drafts.decideReplacement(db, userId, second.id, 'KEEP_NEW', now);
    const third = await drafts.createDraft(db, userId, proposal.id, { providerImpl, regenerate: true, now });
    assert.notEqual(third.id, second.id);
    assert.equal(drafts.pendingDecision(db, userId, proposal.id).previousDraftId, second.id);
  } finally { cleanup(); }
});

test('deciding with no pending decision, with an unknown value, or on a draft that is not the new one is refused and deletes nothing', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, first, second, now } = await twoDrafts(db, sourcesDir, 'rp8@example.com');
    const rows = draftCount(db, userId);
    await assert.rejects(async () => drafts.decideReplacement(db, userId, first.id, 'KEEP_NEW', now), (err) => err.code === 'INVALID_STATE', 'the previous draft is not the one that carries the decision');
    await assert.rejects(async () => drafts.decideReplacement(db, userId, second.id, 'SOMETHING_ELSE', now), (err) => err.code === 'VALIDATION_FAILED');
    assert.equal(draftCount(db, userId), rows);
    drafts.decideReplacement(db, userId, second.id, 'KEEP_NEW', now);
    await assert.rejects(async () => drafts.decideReplacement(db, userId, second.id, 'KEEP_NEW', now), (err) => err.code === 'INVALID_STATE', 'a repeated decision finds nothing pending');
    assert.equal(exists(db, second.id), true);
  } finally { cleanup(); }
});

test('regenerating over an ACCEPTED lesson is the old behaviour: a new draft, no decision recorded, the lesson untouched', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'rp9@example.com');
    const { proposal } = await oneUnit(db, userId, sourcesDir);
    const providerImpl = spyProvider();
    const draft = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    acceptDraft(db, userId, draft.id, { ...ACCEPT, expectedRevision: draft.revision });
    const accepted = JSON.stringify(row(db, draft.id));
    const fresh = await drafts.createDraft(db, userId, proposal.id, { providerImpl, regenerate: true });
    assert.notEqual(fresh.id, draft.id);
    assert.equal(record(db, userId, proposal.id), undefined);
    assert.equal(JSON.stringify(row(db, draft.id)), accepted);
  } finally { cleanup(); }
});

test('if the previous draft was accepted while the decision was pending, KEEP_NEW never deletes the lesson', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, proposal, first, second, now } = await twoDrafts(db, sourcesDir, 'rp10@example.com');
    acceptDraft(db, userId, first.id, { ...ACCEPT, expectedRevision: first.revision });
    const result = drafts.decideReplacement(db, userId, second.id, 'KEEP_NEW', now);
    assert.equal(result.deletedDraftId, null, 'nothing was deleted');
    assert.equal(row(db, first.id).status, 'ACCEPTED');
    assert.equal(exists(db, second.id), true);
    assert.equal(record(db, userId, proposal.id), undefined);
  } finally { cleanup(); }
});

test('if the new draft was accepted while the decision was pending, RESTORE_PREVIOUS is refused and nothing is deleted', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, proposal, first, second, now } = await twoDrafts(db, sourcesDir, 'rp11@example.com');
    acceptDraft(db, userId, second.id, { ...ACCEPT, expectedRevision: second.revision });
    await assert.rejects(async () => drafts.decideReplacement(db, userId, second.id, 'RESTORE_PREVIOUS', now), (err) => err.code === 'INVALID_STATE');
    assert.equal(exists(db, first.id), true);
    assert.equal(row(db, second.id).status, 'ACCEPTED');
    assert.ok(record(db, userId, proposal.id), 'the decision is still pending');
  } finally { cleanup(); }
});

test('expiry: before 30 days nothing happens; at 30 days the previous draft is deleted and the new one stays current', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, proposal, first, second } = await twoDrafts(db, sourcesDir, 'rp12@example.com', at('2026-11-12T10:00:00.000Z'));
    const justBefore = new Date(Date.parse('2026-11-12T10:00:00.000Z') + 30 * DAY_MS - 1);
    assert.equal(drafts.settleExpiredDecisions(db, { now: () => justBefore }), 0);
    assert.equal(exists(db, first.id), true);
    assert.ok(drafts.pendingDecision(db, userId, proposal.id));
    const dueAt = new Date(Date.parse('2026-11-12T10:00:00.000Z') + 30 * DAY_MS);
    assert.equal(drafts.settleExpiredDecisions(db, { now: () => dueAt }), 1);
    assert.equal(exists(db, first.id), false);
    assert.equal(exists(db, second.id), true);
    assert.equal(record(db, userId, proposal.id), undefined);
  } finally { cleanup(); }
});

test('expiry never deletes a previous draft that became a lesson, and never deletes the current draft', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, proposal, first, second } = await twoDrafts(db, sourcesDir, 'rp13@example.com', at('2026-11-12T10:00:00.000Z'));
    acceptDraft(db, userId, first.id, { ...ACCEPT, expectedRevision: first.revision });
    const later = new Date(Date.parse('2026-11-12T10:00:00.000Z') + 31 * DAY_MS);
    drafts.settleExpiredDecisions(db, { now: () => later });
    assert.equal(row(db, first.id).status, 'ACCEPTED');
    assert.equal(exists(db, second.id), true);
    assert.equal(record(db, userId, proposal.id), undefined);
  } finally { cleanup(); }
});

test('listing the drafts of a unit settles what expired first (the purge runs when the student looks)', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, proposal, first, second } = await twoDrafts(db, sourcesDir, 'rp14@example.com', at('2026-11-12T10:00:00.000Z'));
    const later = () => new Date(Date.parse('2026-11-12T10:00:00.000Z') + 40 * DAY_MS);
    const listed = drafts.listDrafts(db, userId, proposal.id, { now: later });
    assert.deepEqual(listed.map((d) => d.id), [second.id]);
    assert.equal(exists(db, first.id), false);
  } finally { cleanup(); }
});

test('a job that points at a draft removed by a decision loses only that pointer; the job itself stays as history', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, proposal, second, now } = await twoDrafts(db, sourcesDir, 'rp15@example.com');
    const at0 = now().toISOString();
    db.prepare(`INSERT INTO generation_jobs (user_id, proposal_id, state, phase, provider, source_language, generation_locale, scope_digest, regenerate, estimated_units, created_at, last_activity_at, finished_at, draft_id)
      VALUES (?, ?, 'SUCCEEDED', 'DONE', ?, 'pt', 'pt-BR', 'digest', 1, 0, ?, ?, ?, ?)`).run(userId, proposal.id, FAKE_PROVIDER_NAME, at0, at0, at0, second.id);
    const jobId = db.prepare('SELECT id FROM generation_jobs WHERE user_id = ?').get(userId).id;
    drafts.decideReplacement(db, userId, second.id, 'RESTORE_PREVIOUS', now);
    const job = db.prepare('SELECT state, draft_id FROM generation_jobs WHERE id = ?').get(jobId);
    assert.equal(job.state, 'SUCCEEDED');
    assert.equal(job.draft_id, null);
  } finally { cleanup(); }
});

test('removing the source while a decision is pending still works and takes the decision with it', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, source, proposal } = await twoDrafts(db, sourcesDir, 'rp16@example.com');
    sourceStorage.remove(db, userId, source.id, { sourcesDir, mediaDir: join(sourcesDir, 'media') });
    assert.equal(draftCount(db, userId), 0);
    assert.equal(record(db, userId, proposal.id), undefined);
  } finally { cleanup(); }
});

test('another student never sees or decides a pending decision', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, proposal, first, second, now } = await twoDrafts(db, sourcesDir, 'rp17@example.com');
    const other = makeUser(db, 'rp17b@example.com');
    assert.equal(drafts.pendingDecision(db, other, proposal.id), null);
    await assert.rejects(async () => drafts.decideReplacement(db, other, second.id, 'KEEP_NEW', now), (err) => err.code === 'NOT_FOUND');
    assert.equal(exists(db, first.id), true);
    assert.ok(drafts.pendingDecision(db, userId, proposal.id));
  } finally { cleanup(); }
});

test('a generation job for a regenerate is refused up front while a decision is pending, and leaves no job row', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, proposal } = await twoDrafts(db, sourcesDir, 'rp18@example.com');
    assert.throws(() => jobs.createJob(db, userId, proposal.id, { provider: { name: FAKE_PROVIDER_NAME, live: false, plannedCalls: 1 }, regenerate: true }), (err) => err.code === 'DECISION_PENDING');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM generation_jobs WHERE user_id = ?').get(userId).n, 0);
    // a job that is not a regenerate is unaffected
    const ok = jobs.createJob(db, userId, proposal.id, { provider: { name: FAKE_PROVIDER_NAME, live: false, plannedCalls: 1 }, regenerate: false });
    assert.equal(ok.created, true);
  } finally { cleanup(); }
});

test('HTTP: GET the decision, POST the decision (a repeat is 404, a draft without a decision is 409) and a regenerate while pending is 409', async () => {
  const { dir, db, sourcesDir } = tmpDb();
  const providerImpl = spyProvider();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir, ...UPLOAD_DEFAULTS }, ai: { providerImpl } });
  try {
    const email = 'rp19@example.com';
    const password = 'a genuinely long test password 1';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
    const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    const { proposal } = await oneUnit(db, userId, sourcesDir);
    const headers = { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' };
    const post = (url, payload) => app.inject({ method: 'POST', url, headers, payload });
    const get = (url) => app.inject({ method: 'GET', url, headers: { cookie } });

    const first = JSON.parse((await post(`/v1/proposals/${proposal.id}/drafts`, {})).body).draft;
    assert.deepEqual(JSON.parse((await get(`/v1/proposals/${proposal.id}/decision`)).body), { pending: null });
    const second = JSON.parse((await post(`/v1/proposals/${proposal.id}/drafts`, { regenerate: true })).body).draft;

    const pending = JSON.parse((await get(`/v1/proposals/${proposal.id}/decision`)).body).pending;
    assert.equal(pending.previousDraftId, first.id);
    assert.equal(pending.newDraftId, second.id);
    assert.ok(pending.expiresAt);

    const blocked = await post(`/v1/proposals/${proposal.id}/drafts`, { regenerate: true });
    assert.equal(blocked.statusCode, 409);
    assert.equal(JSON.parse(blocked.body).error.code, 'DECISION_PENDING');
    assert.equal(providerImpl.calls, 2);

    const bad = await post(`/v1/drafts/${second.id}/decision`, { decision: 'NOPE' });
    assert.equal(bad.statusCode, 400);

    // DELETE /drafts/:id exists on the running server: a draft in a pending decision answers 409 (not 404), nothing is deleted
    const del = (url) => app.inject({ method: 'DELETE', url, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf } });
    const inDecision = await del(`/v1/drafts/${first.id}?confirmDiscard=true`);
    assert.equal(inDecision.statusCode, 409);
    assert.equal((await del(`/v1/drafts/999999`)).statusCode, 404);

    const decided = await post(`/v1/drafts/${second.id}/decision`, { decision: 'RESTORE_PREVIOUS' });
    assert.equal(decided.statusCode, 200);
    assert.equal(JSON.parse(decided.body).currentDraftId, first.id);
    // the new draft was deleted by RESTORE_PREVIOUS, so repeating the request finds no such draft; the previous one carries no decision
    const repeated = await post(`/v1/drafts/${second.id}/decision`, { decision: 'RESTORE_PREVIOUS' });
    assert.equal(repeated.statusCode, 404);
    const onPrevious = await post(`/v1/drafts/${first.id}/decision`, { decision: 'KEEP_NEW' });
    assert.equal(onPrevious.statusCode, 409);
    assert.deepEqual(JSON.parse((await get(`/v1/proposals/${proposal.id}/decision`)).body), { pending: null });
  } finally {
    await app.close();
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

// Discarding an unfinished summary (the student's "Descartar rascunho"): only a plain DRAFT goes; the book, the unit and lessons stay.
test('DISCARD DRAFT: a plain draft is deleted, an edited one needs confirmation, a lesson or a pending decision is never discarded', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'dd1@example.com');
    const other = makeUser(db, 'dd2@example.com');
    const { source, proposal } = await oneUnit(db, userId, sourcesDir);
    const providerImpl = spyProvider();

    // 1. a plain draft is discarded; the unit and the book remain; the job loses its pointer but stays as history
    const plain = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    assert.throws(() => drafts.discardDraftById(db, other, plain.id), (e) => e.code === 'NOT_FOUND', 'another student cannot discard it');
    assert.ok(exists(db, plain.id));
    const done = drafts.discardDraftById(db, userId, plain.id);
    assert.deepEqual(done, { discardedDraftId: plain.id, proposalId: proposal.id });
    assert.equal(exists(db, plain.id), false);
    assert.ok(db.prepare('SELECT 1 FROM content_proposals WHERE id = ?').get(proposal.id), 'the unit stays');
    assert.ok(db.prepare('SELECT 1 FROM sources WHERE id = ?').get(source.id), 'the book stays');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM generation_jobs WHERE draft_id IS NOT NULL AND user_id = ?').get(userId).n, 0);
    assert.equal(providerImpl.calls, 1, 'no provider call, no credit');

    // 2. a draft the student edited needs the explicit confirmation
    const edited = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    drafts.reviseSummary(db, userId, edited.id, { summary: 'Meu resumo, escrito por mim, com a minha explicação do tema.' });
    assert.throws(() => drafts.discardDraftById(db, userId, edited.id), (e) => e.code === 'DISCARD_NEEDS_CONFIRMATION');
    assert.ok(exists(db, edited.id), 'nothing deleted without the confirmation');
    drafts.discardDraftById(db, userId, edited.id, { confirmDiscard: true });
    assert.equal(exists(db, edited.id), false);

    // 3. an accepted draft is a lesson in study: never discarded, even with the confirmation
    const accepted = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    acceptDraft(db, userId, accepted.id, { ...ACCEPT, expectedRevision: accepted.revision });
    assert.throws(() => drafts.discardDraftById(db, userId, accepted.id, { confirmDiscard: true }), (e) => e.code === 'INVALID_STATE');
    assert.ok(exists(db, accepted.id));
  } finally { cleanup(); }
});

test('DISCARD DRAFT: a draft that takes part in a pending replacement decision is not discarded; the HTTP route answers 409 for it', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const { userId, first, second } = await twoDrafts(db, sourcesDir, 'dd3@example.com');
    for (const id of [first.id, second.id]) {
      assert.throws(() => drafts.discardDraftById(db, userId, id, { confirmDiscard: true }), (e) => e.code === 'INVALID_STATE');
      assert.ok(exists(db, id));
    }
  } finally { cleanup(); }
});

test('DISCARD DRAFT over HTTP: DELETE /drafts/:id removes a plain draft (200) and then answers 404', async () => {
  const { dir, db, sourcesDir } = tmpDb();
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir, ...UPLOAD_DEFAULTS }, ai: { providerImpl: spyProvider() } });
  try {
    const email = 'dd4@example.com';
    const password = 'a genuinely long test password 1';
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password } });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
    const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    const { proposal } = await oneUnit(db, userId, sourcesDir);
    const headers = { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' };
    const draft = JSON.parse((await app.inject({ method: 'POST', url: `/v1/proposals/${proposal.id}/drafts`, headers, payload: {} })).body).draft;
    const del = await app.inject({ method: 'DELETE', url: `/v1/drafts/${draft.id}`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf } });
    assert.equal(del.statusCode, 200);
    assert.equal(exists(db, draft.id), false);
    assert.equal((await app.inject({ method: 'DELETE', url: `/v1/drafts/${draft.id}`, headers: { origin: TEST_ORIGIN, cookie, 'x-csrf-token': csrf } })).statusCode, 404);
  } finally {
    await app.close();
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('TRANSLATE: a draft requested in another language is written for that language, the student\'s saved preference is not changed, and the previous version waits for the choice', async () => {
  const { db, sourcesDir, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'tr1@example.com');
    const { proposal } = await oneUnit(db, userId, sourcesDir);
    const providerImpl = spyProvider();
    const original = await drafts.createDraft(db, userId, proposal.id, { providerImpl });
    const preference = () => db.prepare('SELECT generation_locale FROM user_settings WHERE user_id = ?').get(userId).generation_locale;
    assert.equal(preference(), 'pt-BR');
    const translated = await drafts.createDraft(db, userId, proposal.id, { providerImpl, regenerate: true, generationLocaleOverride: 'en' });
    assert.equal(translated.generationLocale, 'en');
    assert.equal(preference(), 'pt-BR', 'a translation never changes the saved language');
    assert.equal(exists(db, original.id), true, 'the previous version is kept');
    assert.equal(record(db, userId, proposal.id).previous_draft_id, original.id, 'and a decision is pending');
    // an unsupported language is ignored, never turned into a near one
    drafts.decideReplacement(db, userId, translated.id, 'KEEP_NEW');
    const ignored = await drafts.createDraft(db, userId, proposal.id, { providerImpl, regenerate: true, generationLocaleOverride: 'xx' });
    assert.equal(ignored.generationLocale, 'pt-BR');
  } finally { cleanup(); }
});
