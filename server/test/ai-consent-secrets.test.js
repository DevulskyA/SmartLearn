import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { buildApp } from '../src/app.js';
import * as sourceStorage from '../src/services/source-storage.js';
import { extractSource } from '../src/services/source-extraction.js';
import * as proposals from '../src/services/content-proposals.js';
import * as drafts from '../src/services/generated-drafts.js';
import { validateProductionConfig } from '../src/production-config.js';
import { buildFixturePdf } from './pdf-fixtures/build-fixture-pdf.js';

// T-F8-03: AI consent and the provider only arrive through explicit server configuration; logs, responses and stored errors never
// carry a credential or source text; SMARTLEARN_AI_CONSENT=true is set by the DEV launcher and by nothing that ships.
// No real model and no network: every provider here is a stub.

const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = join(SERVER_ROOT, '..');
const MIGRATIONS_DIR = join(SERVER_ROOT, 'migrations');
const TEST_ORIGIN = 'https://smartlearn.test';
const UPLOAD_DEFAULTS = { maxBytes: 25 * 1024 * 1024, quotaBytes: 200 * 1024 * 1024 };
const PASSWORD = 'a genuinely long test password 1';

const cleanEnv = (extra = {}) => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('SMARTLEARN_') || key === 'NODE_ENV') delete env[key];
  return { ...env, ...extra };
};

// --- explicit configuration only ------------------------------------------------------------------

function configFor(envExtra) {
  const code = `import { config } from ${JSON.stringify(pathToFileURL(join(SERVER_ROOT, 'src', 'config.js')).href)};
    process.stdout.write(JSON.stringify({ consent: config.aiConsentGranted, provider: config.aiProvider, key: config.aiApiKey, model: config.aiModel, budget: config.aiBudgetCapUsd, url: config.aiApiUrl }));`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: cleanEnv(envExtra), encoding: 'utf8' }));
}

test('with no SMARTLEARN_AI_* variable the server has no consent, no provider, no credential, no model and no budget', () => {
  assert.deepEqual(configFor({}), { consent: false, provider: null, key: null, model: null, budget: null, url: null });
});

test('consent is granted only by the exact value "true"; anything else (TRUE, 1, yes, padded) is not consent', () => {
  for (const value of ['TRUE', 'True', '1', 'yes', ' true', 'true ', 'on', '']) {
    assert.equal(configFor({ SMARTLEARN_AI_CONSENT: value }).consent, false, JSON.stringify(value));
  }
  assert.equal(configFor({ SMARTLEARN_AI_CONSENT: 'true' }).consent, true);
});

test('the provider is whatever the operator declared, normalised, and nothing is inferred from the other variables', () => {
  assert.equal(configFor({ SMARTLEARN_AI_PROVIDER: ' codex ' }).provider, 'CODEX');
  const onlyCredentials = configFor({ SMARTLEARN_AI_API_KEY: 'k', SMARTLEARN_AI_MODEL: 'm', SMARTLEARN_AI_CONSENT: 'true', SMARTLEARN_AI_BUDGET_CAP_USD: '5' });
  assert.equal(onlyCredentials.provider, null, 'credentials never declare a provider by themselves');
});

test('selectProvider: consent must be the boolean true; a truthy string or number is not consent for any live provider', () => {
  for (const consentGranted of ['true', 1, 'yes', {}, undefined, null, false]) {
    assert.throws(() => drafts.selectProvider({ provider: 'CODEX', consentGranted }), (e) => e.code === 'MISSING_CREDENTIALS', `CODEX ${String(consentGranted)}`);
    assert.throws(() => drafts.selectProvider({ provider: 'OPENAI', apiKey: 'k', model: 'm', budgetCapUsd: 5, consentGranted }), (e) => e.code === 'MISSING_CREDENTIALS', `OPENAI ${String(consentGranted)}`);
    assert.equal(drafts.selectProvider({ apiKey: 'k', model: 'm', budgetCapUsd: 5, consentGranted }).live, false, `undeclared ${String(consentGranted)} stays FAKE`);
  }
});

test('selectProvider: withholding any ONE of key, model, consent, budget keeps every real provider off; only the full set turns it on', () => {
  const full = { apiKey: 'k', model: 'm', consentGranted: true, budgetCapUsd: 5 };
  for (const missing of ['apiKey', 'model', 'consentGranted', 'budgetCapUsd']) {
    const partial = { ...full, [missing]: missing === 'consentGranted' ? false : undefined };
    assert.equal(drafts.selectProvider(partial).live, false, `undeclared without ${missing}`);
    for (const provider of ['OPENAI', 'ANTHROPIC']) assert.throws(() => drafts.selectProvider({ ...partial, provider }), (e) => e.code === 'MISSING_CREDENTIALS', `${provider} without ${missing}`);
  }
  assert.equal(drafts.selectProvider(full).live, true);
  assert.equal(drafts.selectProvider({ ...full, budgetCapUsd: 0 }).live, false, 'a zero budget is not a budget');
});

// --- a client cannot supply consent, provider or credentials ---------------------------------------

function tmpCtx() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-consent-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  return { dir, db, sourcesDir: join(dir, 'sources'), cleanup: () => { try { db.close(); } catch { /* closed */ } rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

async function login(app, email) {
  await app.inject({ method: 'POST', url: '/v1/auth/register', headers: { origin: TEST_ORIGIN }, payload: { email, password: PASSWORD } });
  const res = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: TEST_ORIGIN }, payload: { email, password: PASSWORD } });
  const cookie = res.headers['set-cookie'].split(';')[0];
  const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { cookie } });
  return { cookie, csrf: JSON.parse(me.body).csrfToken };
}

test('HTTP: consent, provider and credentials sent in the body, query or headers never reach the provider choice', async () => {
  const ctx = tmpCtx();
  // The server is configured for CODEX WITHOUT consent. Nothing the client sends may change that.
  const app = await buildApp(ctx.db, MIGRATIONS_DIR, {
    isProduction: false, allowedOrigins: [TEST_ORIGIN], sources: { sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS },
    ai: { provider: 'CODEX', consentGranted: false, jobRunnerOptions: { autoStart: false } },
  });
  try {
    const who = await login(app, 'consent@example.com');
    const userId = ctx.db.prepare('SELECT id FROM users WHERE email = ?').get('consent@example.com').id;
    const source = sourceStorage.acceptUpload(ctx.db, userId, { buffer: buildFixturePdf(['Texto da unidade.']), originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS });
    await extractSource(ctx.db, userId, source.id, { sourcesDir: ctx.sourcesDir });
    const [proposal] = proposals.chunkSource(ctx.db, userId, source.id, { maxPagesPerChunk: 1 });
    const headers = { origin: TEST_ORIGIN, cookie: who.cookie, 'x-csrf-token': who.csrf, 'content-type': 'application/json', 'x-smartlearn-ai-consent': 'true', 'x-smartlearn-ai-provider': 'FAKE' };
    const hostile = { consentGranted: true, consent: true, provider: 'FAKE', apiKey: 'sk-client', model: 'm', budgetCapUsd: 99 };

    const draft = await app.inject({ method: 'POST', url: `/v1/proposals/${proposal.id}/drafts?consent=true&provider=FAKE`, headers, payload: hostile });
    assert.ok([400, 409].includes(draft.statusCode), `drafts route: ${draft.statusCode} ${draft.body}`);
    if (draft.statusCode === 409) assert.equal(JSON.parse(draft.body).error.code, 'MISSING_CREDENTIALS');
    const job = await app.inject({ method: 'POST', url: '/v1/generation-jobs?consent=true', headers, payload: { proposalId: proposal.id, ...hostile } });
    assert.ok([400, 409].includes(job.statusCode), `jobs route: ${job.statusCode} ${job.body}`);
    const clean = await app.inject({ method: 'POST', url: '/v1/generation-jobs?consent=true&provider=FAKE', headers, payload: { proposalId: proposal.id } });
    assert.equal(clean.statusCode, 409, 'even a clean body with a hostile query/header is refused: the server config has no consent');
    assert.equal(JSON.parse(clean.body).error.code, 'MISSING_CREDENTIALS');
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM generated_drafts').get().n, 0);
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM generation_jobs').get().n, 0, 'no job was even recorded');

    const patched = await app.inject({ method: 'PATCH', url: '/v1/settings', headers, payload: { aiConsent: true, aiProvider: 'FAKE' } });
    assert.equal(patched.statusCode, 400, 'the settings API refuses consent/provider fields');
    const current = JSON.parse((await app.inject({ method: 'GET', url: '/v1/settings', headers: { cookie: who.cookie } })).body).settings;
    assert.deepEqual(Object.keys(current).filter((k) => /consent|provider|apikey|credential/i.test(k)), [], 'and exposes none');
  } finally { await app.close(); ctx.cleanup(); }
});

// --- logs, responses and stored errors ----------------------------------------------------------------

test('static sensor: the server writes to the console only from main.js, never prints a source/credential value, and the HTTP logger stays off', () => {
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out); else if (name.endsWith('.js')) out.push(full);
    }
    return out;
  };
  const files = walk(join(SERVER_ROOT, 'src'));
  const consoleUse = /\b(console\.(log|info|warn|error|debug|trace)|process\.(stdout|stderr)\.write)\b/;
  const offenders = files.filter((f) => consoleUse.test(readFileSync(f, 'utf8'))).map((f) => relative(SERVER_ROOT, f).split(sep).join('/'));
  assert.deepEqual(offenders, ['src/main.js']);
  assert.match(readFileSync(join(SERVER_ROOT, 'src', 'app.js'), 'utf8'), /Fastify\(\{ logger: false/);
  const mainLines = readFileSync(join(SERVER_ROOT, 'src', 'main.js'), 'utf8').split(/\r?\n/).filter((l) => consoleUse.test(l));
  for (const line of mainLines) assert.doesNotMatch(line, /apiKey|aiApiKey|API_KEY|\.text\b|\bpages?\b|summary|password|cookie|token/i, line);
});

test('end to end with a live-looking configuration: the credential and the source text never reach stdout/stderr, an HTTP response, or a stored error', { timeout: 120_000 }, () => {
  const KEY = 'sk-live-SECRET-KEY-9912';
  const MARKER = 'ZEBRA-MARKER-7731';
  const probe = join(SERVER_ROOT, 'test', 'support', 'log-leak-probe.mjs');
  const env = cleanEnv({
    SMARTLEARN_AI_PROVIDER: 'OPENAI', SMARTLEARN_AI_API_KEY: KEY, SMARTLEARN_AI_MODEL: 'test-model', SMARTLEARN_AI_CONSENT: 'true',
    SMARTLEARN_AI_BUDGET_CAP_USD: '5', PROBE_SOURCE_MARKER: MARKER,
  });
  const run = spawnSync(process.execPath, [probe], { env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr);
  const [logs, resultLine] = run.stdout.split('PROBE_RESULT:');
  assert.ok(resultLine, 'the probe finished');
  const result = JSON.parse(resultLine);

  assert.ok(result.calls.length >= 2 && result.calls.every((c) => c.authorization === `Bearer ${KEY}` && c.bodyHasSource), 'the credential and the source really did flow to the (stub) provider, so their absence below is meaningful');
  assert.equal(result.draft.status, 502);
  assert.equal(result.job.state, 'FAILED');
  assert.equal(result.crashJob.state, 'FAILED');

  for (const [name, text] of [['stdout', logs], ['stderr', run.stderr], ['draft response', result.draft.body], ['job', JSON.stringify(result.job)], ['crash job', JSON.stringify(result.crashJob)], ['crash draft response', result.crashDraft.body], ['database', result.persisted]]) {
    assert.ok(!text.includes(KEY), `${name} must not contain the credential`);
    assert.ok(!text.includes(MARKER), `${name} must not contain the source text`);
  }
});

test('an unexpected provider failure is reported and stored as a generic message, never the raw exception text', async () => {
  const ctx = tmpCtx();
  try {
    const userId = ctx.db.prepare("INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at) VALUES ('u@x.com','u@x.com','h','s','scrypt','{}','2026-01-01','2026-01-01')").run().lastInsertRowid;
    const source = sourceStorage.acceptUpload(ctx.db, userId, { buffer: buildFixturePdf(['Texto da unidade.']), originalName: 'a.pdf', contentType: 'application/pdf', sourcesDir: ctx.sourcesDir, ...UPLOAD_DEFAULTS });
    await extractSource(ctx.db, userId, source.id, { sourcesDir: ctx.sourcesDir });
    const [proposal] = proposals.chunkSource(ctx.db, userId, source.id, { maxPagesPerChunk: 1 });
    const crashing = { name: 'CRASH', live: true, generate: async () => { throw new Error('boom sk-live-SECRET Texto da unidade'); } };
    await assert.rejects(
      () => drafts.createDraft(ctx.db, userId, proposal.id, { providerImpl: crashing }),
      (err) => err.code === 'PROVIDER_ERROR' && !/sk-live|Texto da unidade|boom/.test(err.message),
    );
  } finally { ctx.cleanup(); }
});

// --- SMARTLEARN_AI_CONSENT=true belongs to the DEV launcher only -----------------------------------------

test('only scripts/launch-desktop-dev.ps1 assigns SMARTLEARN_AI_CONSENT among everything the app, the server and the packaging ship or run', () => {
  const roots = ['scripts', 'src', 'server/src', 'src-tauri/src', 'src-tauri/tauri.conf.json', 'package.json', 'server/package.json', 'vite.config.js', 'index.html'];
  const exts = new Set(['.js', '.mjs', '.cjs', '.ps1', '.bat', '.cmd', '.sh', '.json', '.rs', '.toml', '.html']);
  const files = [];
  const walk = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) { for (const n of readdirSync(p)) if (n !== 'node_modules') walk(join(p, n)); }
    else if (exts.has(p.slice(p.lastIndexOf('.')))) files.push(p);
  };
  for (const r of roots) { try { walk(join(REPO_ROOT, r)); } catch { /* optional root */ } }
  // Assignment forms only: PowerShell, process.env.X =, an env object entry, Rust Command::env, a .env/batch/shell line. Messages that merely
  // mention "SMARTLEARN_AI_CONSENT=true" to the operator are not assignments.
  const assigns = /\$env:SMARTLEARN_AI_CONSENT\s*=|process\.env\.SMARTLEARN_AI_CONSENT\s*=(?!=)|['"`]SMARTLEARN_AI_CONSENT['"`]\s*:\s*['"`]true|\.env\(\s*["']SMARTLEARN_AI_CONSENT|(^|\n)\s*(set\s+|export\s+)?SMARTLEARN_AI_CONSENT\s*=/i;
  const assigning = files.filter((f) => {
    const rel = relative(REPO_ROOT, f).split(sep).join('/');
    if (/^(test|server\/test)\//.test(rel) || rel.startsWith('scripts/prompt-lab/') && false) return false;
    return assigns.test(readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|#)/.test(l) && !/^\s*\/\*/.test(l)).join('\n'));
  }).map((f) => relative(REPO_ROOT, f).split(sep).join('/'));
  // scripts/inspect-package.mjs only LISTS the name (to look for it in the artifact); it never assigns it.
  assert.deepEqual(assigning, ['scripts/launch-desktop-dev.ps1']);
});

test('the DEV launcher is the DEV build: it stamps mode DEV, refuses to run outside the work branch and never builds a release', () => {
  const launcher = readFileSync(join(REPO_ROOT, 'scripts', 'launch-desktop-dev.ps1'), 'utf8');
  assert.match(launcher, /\$env:SMARTLEARN_AI_CONSENT\s*=\s*'true'/);
  assert.match(launcher, /SMARTLEARN_BUILD_MODE\s*=\s*'DEV'/);
  assert.match(launcher, /\$env:SMARTLEARN_DEV_PERSISTENT_SESSION\s*=\s*'true'/);
  assert.match(launcher, /claude\/smartlearn-v1-complete/);
  assert.doesNotMatch(launcher, /tauri build|target\\release/i);
  // The consent line sits with the other DEV-only settings, after the work-branch guard.
  assert.ok(launcher.indexOf('claude/smartlearn-v1-complete') < launcher.indexOf("$env:SMARTLEARN_AI_CONSENT"));
});

test('production configuration never grants consent by itself: CODEX needs an explicit SMARTLEARN_AI_CONSENT=true', () => {
  const abs = (p) => join(tmpdir(), 'sl-consent-prod-fixture', p);
  const base = {
    NODE_ENV: 'production', SMARTLEARN_DB_PATH: abs('data/app.db'), SMARTLEARN_SOURCES_DIR: abs('data/sources'), SMARTLEARN_ALLOWED_ORIGINS: 'https://app.example.test',
    SMARTLEARN_STATIC_DIR: abs('dist'), SMARTLEARN_TRUST_PROXY: 'true', HOST: '127.0.0.1', PORT: '3000', SMARTLEARN_AI_PROVIDER: 'CODEX',
  };
  const codes = (env) => validateProductionConfig(env, { fileExists: () => true }).map((p) => p.code);
  assert.ok(codes(base).includes('AI_CONSENT_REQUIRED'));
  assert.ok(!codes({ ...base, SMARTLEARN_AI_CONSENT: 'true' }).includes('AI_CONSENT_REQUIRED'));
});
