// T-F8-03 helper (not a test: the runner only picks up *.test.js). Runs in a CHILD process so everything the server code writes
// to stdout/stderr is observable: the parent (ai-consent-secrets.test.js) sets a live-looking provider configuration through the
// environment, then checks that neither the credential nor the source text ever reaches the output.
// Everything here is local: the provider is a stub fetch that fails and echoes the whole request back, and a throwing provider.
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../../src/db.js';
import { runMigrations } from '../../src/migrations.js';
import { buildApp } from '../../src/app.js';
import { extractSource } from '../../src/services/source-extraction.js';
import * as proposals from '../../src/services/content-proposals.js';
import { buildFixturePdf } from '../pdf-fixtures/build-fixture-pdf.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));
const ORIGIN = 'https://smartlearn.test';
const PASSWORD = 'a genuinely long test password 1';
const MARKER = process.env.PROBE_SOURCE_MARKER;
const KEY = process.env.SMARTLEARN_AI_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = mkdtempSync(join(tmpdir(), 'sl-leak-probe-'));
const db = openDb(join(dir, 'probe.db'));
runMigrations(db, MIGRATIONS_DIR);
const sourcesDir = join(dir, 'sources');
const calls = [];
const echoingFailure = async (url, init) => {
  calls.push({ url: String(url), authorization: init.headers.authorization, bodyHasSource: String(init.body).includes(MARKER) });
  return { ok: false, status: 500, json: async () => ({ echo: init.body, authorization: init.headers.authorization }), text: async () => init.body };
};

const options = (ai) => ({ isProduction: false, allowedOrigins: [ORIGIN], sources: { sourcesDir, maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 }, ai });
const result = { calls };
let app = await buildApp(db, MIGRATIONS_DIR, options({ fetchImpl: echoingFailure }));
try {
  const email = 'probe@example.com';
  await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: ORIGIN }, payload: { email, password: PASSWORD } });
  const login = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: { email, password: PASSWORD } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } })).body).csrfToken;
  const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;

  const boundary = 'probe-boundary-1';
  const pdf = buildFixturePdf([`Conteudo sigiloso ${MARKER} primeira.`, `Conteudo sigiloso ${MARKER} segunda.`]);
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="aula.pdf"\r\nContent-Type: application/pdf\r\n\r\n`), pdf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const uploaded = await app.inject({ method: 'POST', url: '/v1/sources', headers: { origin: ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
  const sourceId = JSON.parse(uploaded.body).source.id;
  await extractSource(db, userId, sourceId, { sourcesDir });
  const [p1, p2] = proposals.chunkSource(db, userId, sourceId, { maxPagesPerChunk: 1 });
  const json = { origin: ORIGIN, cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' };

  // 1. synchronous draft route against a provider that fails and echoes the request (credential + source) back.
  const draft = await app.inject({ method: 'POST', url: `/v1/proposals/${p1.id}/drafts`, headers: json, payload: {} });
  result.draft = { status: draft.statusCode, body: draft.body };

  // 2. a background job against the same failing provider.
  const created = await app.inject({ method: 'POST', url: '/v1/generation-jobs', headers: json, payload: { proposalId: p1.id } });
  const jobId = JSON.parse(created.body).job.id;
  let job;
  for (let i = 0; i < 400; i++) {
    job = JSON.parse((await app.inject({ method: 'GET', url: `/v1/generation-jobs/${jobId}`, headers: { cookie } })).body).job;
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(job.state)) break;
    await sleep(50);
  }
  result.job = job;
  await app.close();

  // 3. a provider that crashes with an unexpected error whose message carries the credential and the source text.
  const crashing = { name: 'CRASH', live: true, generate: async () => { throw new Error(`boom ${KEY} ${MARKER}`); } };
  app = await buildApp(db, MIGRATIONS_DIR, options({ providerImpl: crashing }));
  const login2 = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: ORIGIN }, payload: { email, password: PASSWORD } });
  const cookie2 = login2.headers['set-cookie'].split(';')[0];
  const csrf2 = JSON.parse((await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie: cookie2 } })).body).csrfToken;
  const json2 = { origin: ORIGIN, cookie: cookie2, 'x-csrf-token': csrf2, 'content-type': 'application/json' };
  const created2 = await app.inject({ method: 'POST', url: '/v1/generation-jobs', headers: json2, payload: { proposalId: p2.id } });
  const jobId2 = JSON.parse(created2.body).job.id;
  let job2;
  for (let i = 0; i < 400; i++) {
    job2 = JSON.parse((await app.inject({ method: 'GET', url: `/v1/generation-jobs/${jobId2}`, headers: { cookie: cookie2 } })).body).job;
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(job2.state)) break;
    await sleep(50);
  }
  result.crashJob = job2;
  const crashDraft = await app.inject({ method: 'POST', url: `/v1/proposals/${p2.id}/drafts`, headers: json2, payload: { regenerate: true } });
  result.crashDraft = { status: crashDraft.statusCode, body: crashDraft.body };

  result.persisted = JSON.stringify({
    jobs: db.prepare('SELECT * FROM generation_jobs').all(),
    drafts: db.prepare('SELECT * FROM generated_drafts').all(),
  });
} finally {
  await app.close();
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
process.stdout.write(`\nPROBE_RESULT:${JSON.stringify(result)}\n`);
