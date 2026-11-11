// GET /sources reports draftCount: how many summaries were already prepared from each document (open and accepted drafts only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';
const PASSWORD = 'a genuinely long test password 1';

test('draftCount counts DRAFT and ACCEPTED drafts per document, never other statuses or other documents', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-draft-count-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  const app = await buildApp(db, MIGRATIONS_DIR, { isProduction: false, allowedOrigins: [ORIGIN], sources: { sourcesDir: join(dir, 'sources'), maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 } });
  try {
    await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: ORIGIN }, payload: { email: 'count@example.com', password: PASSWORD } });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: { email: 'count@example.com', password: PASSWORD } });
    const cookie = login.headers['set-cookie'].split(';')[0];
    const me = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body);
    const upload = async (marker) => {
      const boundary = '----slboundary';
      const pdf = buildFixturePdf([`pagina ${marker}`]);
      const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${marker}.pdf"\r\nContent-Type: application/pdf\r\n\r\n`), pdf, Buffer.from(`\n%${marker}\n\r\n--${boundary}--\r\n`)]);
      const res = await app.inject({ method: 'POST', url: '/v1/sources', headers: { origin: ORIGIN, cookie, 'x-csrf-token': me.csrfToken, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
      return JSON.parse(res.body).source.id;
    };
    const withDrafts = await upload('a');
    const untouched = await upload('b');
    const userId = db.prepare('SELECT id FROM users').get().id;
    const now = new Date().toISOString();
    const proposal = (sourceId, chunk) => Number(db.prepare('INSERT INTO content_proposals (user_id, source_id, chunk_index, page_start, page_end, title, created_at, updated_at) VALUES (?, ?, ?, 1, 2, ?, ?, ?)').run(userId, sourceId, chunk, 'Trecho', now, now).lastInsertRowid);
    const draft = (proposalId, status) => db.prepare("INSERT INTO generated_drafts (user_id, proposal_id, provider, model_version, prompt_version, status, draft_json, created_at) VALUES (?, ?, 'test', 'm', 'p', ?, '{}', ?)").run(userId, proposalId, status, now);
    const p1 = proposal(withDrafts, 0);
    const p2 = proposal(withDrafts, 1);
    draft(p1, 'DRAFT');
    draft(p2, 'ACCEPTED');
    draft(p2, 'DISCARDED');

    const res = await app.inject({ method: 'GET', url: '/v1/sources', headers: { cookie } });
    const bySource = Object.fromEntries(JSON.parse(res.body).sources.map((s) => [s.id, s.draftCount]));
    assert.equal(bySource[withDrafts], 2);
    assert.equal(bySource[untouched], 0);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
