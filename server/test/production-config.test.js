import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateProductionConfig } from '../src/production-config.js';

const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MAIN_JS = join(SERVER_ROOT, 'src', 'main.js');

// A complete, explicit production environment. Paths are made absolute for the current OS.
const abs = (p) => join(tmpdir(), 'sl-prod-config-fixture', p);
const GOOD = {
  NODE_ENV: 'production',
  SMARTLEARN_DB_PATH: abs('data/smartlearn.db'),
  SMARTLEARN_SOURCES_DIR: abs('data/sources'),
  SMARTLEARN_ALLOWED_ORIGINS: 'https://app.example.test',
  SMARTLEARN_STATIC_DIR: abs('dist'),
  SMARTLEARN_TRUST_PROXY: 'true',
  HOST: '127.0.0.1',
  PORT: '3000',
};
const exists = () => true;
const codes = (env, opts) => validateProductionConfig(env, opts ?? { fileExists: exists }).map((p) => p.code);

// ---------- validator ----------

test('a complete explicit production environment has zero problems', () => {
  assert.deepEqual(codes(GOOD), []);
  assert.deepEqual(codes({ ...GOOD, SMARTLEARN_TRUST_PROXY: 'false', HOST: '0.0.0.0' }).filter((c) => c !== 'HOST_EXPOSED_WITHOUT_PROXY_TRUST'), []);
});

test('an empty (all-defaults, i.e. development) environment is rejected for every missing decision', () => {
  const got = codes({});
  for (const code of ['NODE_ENV_NOT_PRODUCTION', 'DB_PATH_MISSING', 'SOURCES_DIR_MISSING', 'ORIGINS_MISSING', 'STATIC_DIR_MISSING', 'TRUST_PROXY_UNSPECIFIED']) {
    assert.ok(got.includes(code), `${code} not reported: ${got}`);
  }
});

test('each unsafe setting is reported by its own code (table-driven, one defect at a time)', () => {
  const cases = [
    ['NODE_ENV_NOT_PRODUCTION', { NODE_ENV: 'staging' }],
    ['DB_PATH_NOT_ABSOLUTE', { SMARTLEARN_DB_PATH: './data/smartlearn.db' }],
    ['SOURCES_DIR_NOT_ABSOLUTE', { SMARTLEARN_SOURCES_DIR: 'data/sources' }],
    ['ORIGIN_NOT_HTTPS', { SMARTLEARN_ALLOWED_ORIGINS: 'http://app.example.test' }],
    ['ORIGIN_NOT_HTTPS', { SMARTLEARN_ALLOWED_ORIGINS: 'https://app.example.test,http://localhost:5173' }],
    ['ORIGIN_NOT_HTTPS', { SMARTLEARN_ALLOWED_ORIGINS: 'https://app.example.test/path' }],
    ['ORIGIN_WILDCARD', { SMARTLEARN_ALLOWED_ORIGINS: 'https://*.example.test' }],
    ['STATIC_DIR_NOT_ABSOLUTE', { SMARTLEARN_STATIC_DIR: 'dist' }],
    ['TRUST_PROXY_UNSPECIFIED', { SMARTLEARN_TRUST_PROXY: 'maybe' }],
    ['HOST_EXPOSED_WITHOUT_PROXY_TRUST', { HOST: '0.0.0.0', SMARTLEARN_TRUST_PROXY: 'false' }],
    ['PORT_INVALID', { PORT: '70000' }],
    ['PORT_INVALID', { PORT: 'abc' }],
    ['LIMIT_INVALID', { SMARTLEARN_SOURCE_MAX_BYTES: '0' }],
    ['LIMIT_INVALID', { SMARTLEARN_SOURCE_QUOTA_BYTES: 'lots' }],
    ['AI_CONFIG_INCOMPLETE', { SMARTLEARN_AI_API_KEY: 'k', SMARTLEARN_AI_BUDGET_CAP_USD: '5' }],
    ['AI_CONFIG_INCOMPLETE', { SMARTLEARN_AI_CONSENT: 'true' }],
    ['AI_BUDGET_REQUIRED', { SMARTLEARN_AI_API_KEY: 'k', SMARTLEARN_AI_MODEL: 'm', SMARTLEARN_AI_CONSENT: 'true' }],
    ['DEV_FLAG_PRESENT', { SMARTLEARN_DEV_DATA_DIR: '/tmp/x' }],
    ['DEV_FLAG_PRESENT', { SMARTLEARN_SEED: '1' }],
  ];
  for (const [code, override] of cases) {
    const got = codes({ ...GOOD, ...override });
    assert.ok(got.includes(code), `${code} expected for ${JSON.stringify(override)}, got ${got}`);
  }
  assert.ok(codes(GOOD, { fileExists: () => false }).includes('STATIC_DIR_NOT_FOUND'));
});

test('a fully configured real AI provider is accepted only with a positive budget cap; wildcard/duplicate-free origins pass', () => {
  assert.deepEqual(codes({ ...GOOD, SMARTLEARN_AI_API_KEY: 'k', SMARTLEARN_AI_MODEL: 'm', SMARTLEARN_AI_CONSENT: 'true', SMARTLEARN_AI_BUDGET_CAP_USD: '25' }), []);
  assert.deepEqual(codes({ ...GOOD, SMARTLEARN_ALLOWED_ORIGINS: 'https://a.example.test, https://b.example.test:8443' }), []);
});

// ---------- real processes: fail closed, and a staging launch with production settings ----------

const cleanEnv = () => {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('SMARTLEARN_') && k !== 'NODE_ENV') env[k] = v;
  return env;
};

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

test('NODE_ENV=production with development defaults exits 1 BEFORE touching any database, and names every problem', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'sl-prod-refuse-'));
  try {
    const r = spawnSync(process.execPath, [MAIN_JS], { cwd, env: { ...cleanEnv(), NODE_ENV: 'production' }, encoding: 'utf8', timeout: 15000 });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /refuses to start/);
    for (const code of ['DB_PATH_MISSING', 'ORIGINS_MISSING', 'STATIC_DIR_MISSING', 'TRUST_PROXY_UNSPECIFIED']) assert.match(r.stderr, new RegExp(code));
    assert.equal(existsSync(join(cwd, 'data')), false, 'no relative ./data database was created');
  } finally { rmSync(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('the check script mirrors the server: exit 1 with codes on a bad env, exit 0 on a good one', () => {
  const script = join(SERVER_ROOT, 'scripts', 'check-production-config.mjs');
  const bad = spawnSync(process.execPath, [script], { env: { ...cleanEnv(), NODE_ENV: 'production' }, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /DB_PATH_MISSING/);
  const dist = mkdtempSync(join(tmpdir(), 'sl-prod-check-'));
  try {
    const good = spawnSync(process.execPath, [script], { env: { ...cleanEnv(), ...GOOD, SMARTLEARN_STATIC_DIR: dist }, encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /^OK/);
  } finally { rmSync(dist, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('local staging launch with PRODUCTION settings: serves the SPA and API on one origin, Secure __Host- cookies, dev origin refused, no dev/debug endpoints', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sl-prod-staging-'));
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>staging-marker</title>');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const ORIGIN = 'https://staging.example.test';
  const child = spawn(process.execPath, [MAIN_JS], {
    cwd: root,
    env: {
      ...cleanEnv(),
      NODE_ENV: 'production',
      SMARTLEARN_DB_PATH: join(root, 'data', 'smartlearn.db'),
      SMARTLEARN_SOURCES_DIR: join(root, 'data', 'sources'),
      SMARTLEARN_ALLOWED_ORIGINS: ORIGIN,
      SMARTLEARN_STATIC_DIR: dist,
      SMARTLEARN_TRUST_PROXY: 'false',
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  try {
    const deadline = Date.now() + 15000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      try { ready = (await fetch(`${base}/health/ready`)).status === 200; } catch { await new Promise((r) => setTimeout(r, 150)); }
    }
    assert.ok(ready, `production staging server did not become ready: ${stderr}`);

    const spa = await fetch(`${base}/`);
    assert.equal(spa.status, 200);
    assert.match(await spa.text(), /staging-marker/, 'one origin: the SPA is served by the same process');

    const creds = { email: 'staging@example.com', password: 'a genuinely long test password 1' };
    const headers = { 'content-type': 'application/json', origin: ORIGIN };
    assert.ok([200, 201].includes((await fetch(`${base}/v1/auth/register`, { method: 'POST', headers, body: JSON.stringify(creds) })).status));
    const login = await fetch(`${base}/v1/auth/login`, { method: 'POST', headers, body: JSON.stringify(creds) });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /^__Host-/, 'production cookie carries the __Host- prefix');
    assert.match(setCookie, /;\s*Secure/i);
    assert.match(setCookie, /HttpOnly/i);
    const cookie = setCookie.split(';')[0];

    // The dev origin is not an allowed origin: no CORS grant, and a mutating call from it is refused.
    const devPreflight = await fetch(`${base}/v1/auth/login`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' } });
    assert.equal(devPreflight.headers.get('access-control-allow-origin'), null);
    const devLogin = await fetch(`${base}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' }, body: JSON.stringify(creds) });
    assert.ok(devLogin.status >= 400, `login from the dev origin must be refused, got ${devLogin.status}`);

    // Authenticated probes for anything dev/debug/seed-shaped: none exists.
    for (const path of ['/v1/dev', '/v1/dev/seed', '/v1/seed', '/v1/debug', '/v1/_debug', '/v1/admin', '/v1/test']) {
      const res = await fetch(`${base}${path}`, { headers: { cookie } });
      assert.equal(res.status, 404, `${path} must not exist in production (got ${res.status})`);
    }
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 400));
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
});

// ---------- static secret / capability review ----------

const SECRET_PATTERNS = [
  ['Anthropic-style API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['generic sk- API key', /\bsk-[A-Za-z0-9]{32,}\b/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'target', 'gen', 'test-results', 'playwright-report', 'data', '.claude', '.impeccable', 'resources', 'coverage']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.icns', '.woff', '.woff2', '.pdf', '.db', '.node', '.exe', '.zip', '.wasm', '.svg']);

function scanForSecrets(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) scanForSecrets(full, out); continue; }
    if (SKIP_EXT.has(extname(name).toLowerCase()) || st.size > 2_000_000) continue;
    const text = readFileSync(full, 'utf8');
    for (const [label, re] of SECRET_PATTERNS) if (re.test(text)) out.push(`${full}: ${label}`);
  }
  return out;
}

test('the secret scanner really detects a planted secret (it is not vacuous)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-secret-scan-'));
  try {
    writeFileSync(join(dir, 'leak.js'), `const key = "${'sk-' + 'ant-' + 'x'.repeat(30)}";\n`);
    writeFileSync(join(dir, 'pem.txt'), `${'-----BEGIN ' + 'RSA PRIVATE KEY-----'}\nabc\n`);
    assert.equal(scanForSecrets(dir).length, 2);
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('static secret review: no credential-shaped string in the repository sources, and provider credentials have no in-code default', () => {
  assert.deepEqual(scanForSecrets(REPO_ROOT), []);
  const config = readFileSync(join(SERVER_ROOT, 'src', 'config.js'), 'utf8');
  assert.match(config, /aiApiKey:\s*process\.env\.SMARTLEARN_AI_API_KEY \|\| null/, 'AI key defaults to null, never to a literal');
  assert.match(config, /aiModel:\s*process\.env\.SMARTLEARN_AI_MODEL \|\| null/, 'no hard-coded model');
  const gitignore = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
});

test('capability review: the native window gets only core:default; the CSP keeps script-src self, no framing, and its known relaxations are pinned', () => {
  const capability = JSON.parse(readFileSync(join(REPO_ROOT, 'src-tauri', 'capabilities', 'default.json'), 'utf8'));
  assert.deepEqual(capability.permissions, ['core:default'], 'no fs/shell/sql/dialog/custom-command bridge for loaded content');
  assert.deepEqual(capability.windows, ['main']);

  const csp = JSON.parse(readFileSync(join(REPO_ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8')).app.security.csp;
  const directive = (name) => csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `)) ?? '';
  assert.equal(directive('script-src'), "script-src 'self'", 'no unsafe-inline/unsafe-eval scripts');
  assert.equal(directive('frame-ancestors'), "frame-ancestors 'none'");
  assert.equal(directive('default-src'), "default-src 'self'");
  // Known, accepted relaxations (see the deployment runbook): changing them must be a conscious review, not drift.
  assert.equal(directive('style-src'), "style-src 'self' 'unsafe-inline'");
  assert.equal(directive('connect-src'), "connect-src 'self' https: http://localhost:*");
});
