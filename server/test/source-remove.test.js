// DELETE /sources/:id: only a source nothing was derived from can be removed; otherwise 409 and nothing is deleted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';
const UPLOAD = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const PASSWORD = 'a genuinely long test password 1';

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-source-remove-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const sourcesDir = join(dir, 'sources');
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN], sources: { sourcesDir, ...UPLOAD } });
  const login = async (email) => {
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: ORIGIN }, payload: { email, password: PASSWORD } });
    const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: { email, password: PASSWORD } });
    const cookie = res.headers['set-cookie'].split(';')[0];
    const me = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body);
    return { cookie, csrf: me.csrfToken };
  };
  const mutate = (who, method, url, payload) => app.inject({ method, url, payload, headers: { origin: ORIGIN, cookie: who.cookie, 'x-csrf-token': who.csrf } });
  const upload = async (who, buffer) => {
    const boundary = '----slboundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="aula.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      buffer, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({ method: 'POST', url: '/v1/sources', headers: { origin: ORIGIN, cookie: who.cookie, 'x-csrf-token': who.csrf, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
    return JSON.parse(res.body).source.id;
  };
  const pages = (id) => db.prepare('SELECT COUNT(*) AS n FROM source_pages WHERE source_id = ?').get(id).n;
  const sources = (id) => db.prepare('SELECT COUNT(*) AS n FROM sources WHERE id = ?').get(id).n;
  return { app, db, dir, sourcesDir, login, mutate, upload, pages, sources, cleanup: async () => { await app.close(); db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

test('DELETE /sources/:id removes a source nothing was derived from, with its pages and its file; others and anonymous cannot', async () => {
  const t = await boot();
  try {
    const alice = await t.login('alice@example.com');
    const bob = await t.login('bob@example.com');
    const id = await t.upload(alice, buildFixturePdf(['pagina um', 'pagina dois']));
    assert.equal((await t.mutate(alice, 'POST', `/v1/sources/${id}/extract`)).statusCode, 200);
    assert.ok(t.pages(id) > 0, 'the extraction left pages to be removed');
    assert.equal(readdirSync(t.sourcesDir).length, 1);

    assert.equal((await t.mutate(bob, 'DELETE', `/v1/sources/${id}`)).statusCode, 404, 'another user cannot remove it');
    assert.equal((await t.app.inject({ method: 'DELETE', url: `/v1/sources/${id}`, headers: { origin: ORIGIN } })).statusCode, 401, 'anonymous cannot');
    assert.equal(t.sources(id), 1, 'refused requests deleted nothing');
    assert.equal(readdirSync(t.sourcesDir).length, 1);

    const res = await t.mutate(alice, 'DELETE', `/v1/sources/${id}`);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { removed: true, id });
    assert.equal(t.sources(id), 0);
    assert.equal(t.pages(id), 0);
    assert.equal(readdirSync(t.sourcesDir).length, 0, 'the PDF file is gone');
    assert.equal((await t.app.inject({ method: 'GET', url: `/v1/sources/${id}`, headers: { cookie: alice.cookie } })).statusCode, 404);
    assert.equal((await t.mutate(alice, 'DELETE', `/v1/sources/${id}`)).statusCode, 404, 'removing twice is a clean 404');
  } finally { await t.cleanup(); }
});

test('DELETE /sources/:id is refused with 409 and deletes nothing once a unit cites the source', async () => {
  const t = await boot();
  try {
    const alice = await t.login('alice@example.com');
    const id = await t.upload(alice, buildFixturePdf(['pagina um']));
    assert.equal((await t.mutate(alice, 'POST', `/v1/sources/${id}/extract`)).statusCode, 200);
    const unit = await t.mutate(alice, 'POST', '/v1/learning-units', { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-08-01' });
    assert.equal(unit.statusCode, 201);
    const userId = t.db.prepare('SELECT id FROM users WHERE email = ?').get('alice@example.com').id;
    t.db.prepare('INSERT INTO unit_summary_citations (user_id, unit_id, source_id, page_index, created_at) VALUES (?, ?, ?, 1, ?)')
      .run(userId, JSON.parse(unit.body).unit.id, id, new Date().toISOString());
    const pagesBefore = t.pages(id);

    const res = await t.mutate(alice, 'DELETE', `/v1/sources/${id}`);
    assert.equal(res.statusCode, 409);
    assert.equal(JSON.parse(res.body).error.code, 'SOURCE_HAS_UNITS');
    assert.equal(t.sources(id), 1, 'the source row stays');
    assert.equal(t.pages(id), pagesBefore, 'its pages stay');
    assert.equal(readdirSync(t.sourcesDir).length, 1, 'its file stays');
  } finally { await t.cleanup(); }
});

// ---- the other refusals, and what a removal takes with it ----------------------------------------------------------------------
const NOW = '2026-08-01T10:00:00.000Z';
async function sourceWithProposal(t) {
  const alice = await t.login('alice@example.com');
  const id = await t.upload(alice, buildFixturePdf(['pagina um']));
  const userId = t.db.prepare('SELECT id FROM users WHERE email = ?').get('alice@example.com').id;
  const proposalId = Number(t.db.prepare('INSERT INTO content_proposals (user_id, source_id, chunk_index, page_start, page_end, title, created_at, updated_at) VALUES (?, ?, 0, 1, 1, ?, ?, ?)').run(userId, id, 'Filtração glomerular', NOW, NOW).lastInsertRowid);
  const draft = (status) => Number(t.db.prepare("INSERT INTO generated_drafts (user_id, proposal_id, provider, model_version, prompt_version, status, draft_json, created_at) VALUES (?, ?, 'test', 'v1', 'p1', ?, '{}', ?)").run(userId, proposalId, status, NOW).lastInsertRowid);
  const job = (state, draftId = null) => Number(t.db.prepare("INSERT INTO generation_jobs (user_id, proposal_id, state, phase, provider, generation_locale, scope_digest, estimated_units, created_at, last_activity_at, draft_id) VALUES (?, ?, ?, 'x', 'test', 'pt-BR', 'd', 0, ?, ?, ?)").run(userId, proposalId, state, NOW, NOW, draftId).lastInsertRowid);
  const asset = (name) => {
    const uuid = '00000000-0000-4000-8000-00000000000' + name;
    t.db.prepare("INSERT INTO visual_assets (id, user_id, kind, filename, mime, width, height, byte_size, sha256, alt_text, source_id, page_index, crop_x, crop_y, crop_w, crop_h, crop_rotation, source_checksum, operation_key, created_at, updated_at) VALUES (?, ?, 'PDF_CROP', ?, 'image/png', 10, 10, 4, 'x', 'recorte', ?, 1, 0, 0, 1, 1, 0, 'c', ?, ?, ?)").run(uuid, userId, `crop-${name}.png`, id, `op-${name}`, NOW, NOW);
    mkdirSync(join(t.dir, 'media'), { recursive: true });
    writeFileSync(join(t.dir, 'media', `crop-${name}.png`), 'x');
    return uuid;
  };
  return { alice, id, userId, draft, job, asset };
}
const stays = (t, id, extra = {}) => {
  assert.equal(t.sources(id), 1, 'the source row stays');
  assert.equal(readdirSync(t.sourcesDir).length, 1, 'its file stays');
  for (const [table, expected] of Object.entries(extra)) assert.equal(t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, expected, `${table} untouched`);
};

test('DELETE /sources/:id is refused (409) when a draft of it was accepted into a unit', async () => {
  const t = await boot();
  try {
    const { alice, id, draft } = await sourceWithProposal(t);
    draft('ACCEPTED');
    const res = await t.mutate(alice, 'DELETE', `/v1/sources/${id}`);
    assert.equal(res.statusCode, 409);
    assert.equal(JSON.parse(res.body).error.code, 'SOURCE_HAS_UNITS');
    stays(t, id, { content_proposals: 1, generated_drafts: 1 });
  } finally { await t.cleanup(); }
});

test('DELETE /sources/:id is refused (409) while a unit still shows one of its figures', async () => {
  const t = await boot();
  try {
    const { alice, id, userId, asset } = await sourceWithProposal(t);
    const figure = asset('1');
    const unit = await t.mutate(alice, 'POST', '/v1/learning-units', { newSubjectName: 'Fisiologia', title: 'Aula', studyDate: '2026-08-01' });
    t.db.prepare('UPDATE learning_units SET summary_body = ? WHERE user_id = ? AND id = ?').run(`Veja [[fig:${figure}]] acima.`, userId, JSON.parse(unit.body).unit.id);
    const res = await t.mutate(alice, 'DELETE', `/v1/sources/${id}`);
    assert.equal(res.statusCode, 409);
    assert.equal(JSON.parse(res.body).error.code, 'SOURCE_HAS_UNITS');
    stays(t, id, { visual_assets: 1 });
    assert.ok(existsSync(join(t.dir, 'media', 'crop-1.png')), 'the crop file stays');
  } finally { await t.cleanup(); }
});

test('DELETE /sources/:id is refused (409, SOURCE_GENERATION_RUNNING) while a generation runs on it', async () => {
  const t = await boot();
  try {
    const { alice, id, job } = await sourceWithProposal(t);
    job('CALLING_PROVIDER');
    const res = await t.mutate(alice, 'DELETE', `/v1/sources/${id}`);
    assert.equal(res.statusCode, 409);
    assert.equal(JSON.parse(res.body).error.code, 'SOURCE_GENERATION_RUNNING');
    stays(t, id, { content_proposals: 1 });
  } finally { await t.cleanup(); }
});

test('DELETE /sources/:id takes the unaccepted drafts and unused crops with it and keeps the finished job as history', async () => {
  const t = await boot();
  try {
    const { alice, id, draft, job, asset } = await sourceWithProposal(t);
    const draftId = draft('DRAFT');
    const jobId = job('SUCCEEDED', draftId);
    asset('2');
    const res = await t.mutate(alice, 'DELETE', `/v1/sources/${id}`);
    assert.equal(res.statusCode, 200);
    assert.equal(t.sources(id), 0);
    for (const table of ['content_proposals', 'generated_drafts', 'visual_assets']) assert.equal(t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, `${table} emptied`);
    assert.equal(existsSync(join(t.dir, 'media', 'crop-2.png')), false, 'the crop file is gone');
    const history = t.db.prepare('SELECT id, draft_id FROM generation_jobs').all();
    assert.deepEqual(history, [{ id: jobId, draft_id: null }], 'the finished job stays as history without the pointer');
  } finally { await t.cleanup(); }
});

test('DELETE /sources/:id removes a source the student has already opened, together with its append-only opening records', async () => {
  const t = await boot();
  try {
    const alice = await t.login('alice@example.com');
    const id = await t.upload(alice, buildFixturePdf(['pagina um', 'pagina dois']));
    assert.equal((await t.mutate(alice, 'POST', `/v1/sources/${id}/extract`)).statusCode, 200);
    const opened = await t.mutate(alice, 'POST', '/v1/source-openings', { sourceId: id, pageIndex: 1, context: 'STUDY', operationKey: 'opened-before-removal' });
    assert.equal(opened.statusCode, 200);
    const removed = await t.mutate(alice, 'DELETE', `/v1/sources/${id}`);
    assert.equal(removed.statusCode, 200, `removing an opened source answered ${removed.statusCode} ${removed.body}`);
    assert.equal(t.sources(id), 0);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM source_openings WHERE source_id = ?').get(id).n, 0, 'its opening records go with it');
  } finally { await t.cleanup(); }
});
