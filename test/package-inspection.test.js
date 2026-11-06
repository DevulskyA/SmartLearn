import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inspectPackage, defaultInspection, backendEnvKeys, FIXTURE_PASSWORD, DEV_DATA_DIRNAME, ALLOWED_BACKEND_ENV_KEYS,
} from '../scripts/inspect-package.mjs';

// T-F8-01 / R-09 (AC-09.1, AC-09.2): the staged standalone artifact and the Tauri shell never define a DEV variable, never ship the
// fixture password, and never name the DEV datastore outside its reviewed module. Existing decision recorded, not changed: the shell
// does NOT set NODE_ENV=production (loopback HTTP cannot carry a Secure cookie).

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LIB_RS = join(ROOT, 'src-tauri', 'src', 'lib.rs');
const TAURI_CONF = join(ROOT, 'src-tauri', 'tauri.conf.json');
const kinds = (findings) => findings.map((f) => f.kind).sort();

function fixtureTree() {
  const dir = mkdtempSync(join(tmpdir(), 'smartlearn-inspect-'));
  const put = (rel, text) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };
  put('server-runtime/src/main.js', "const devPersistentSession = process.env.SMARTLEARN_DEV_PERSISTENT_SESSION === 'true';\n");
  put('server-runtime/src/config.js', "export const aiConsentGranted = process.env.SMARTLEARN_AI_CONSENT === 'true';\n");
  put('server-runtime/src/other.js', 'export const x = 1;\n');
  put('server-runtime/node_modules/pkg/index.js', 'module.exports = 1;\n');
  put('shared/review-schedule.js', 'export const y = 2;\n');
  put('dist-runtime/assets/app.js', 'console.log("app");\n');
  return dir;
}

test('a clean staged tree, the real Tauri config and the real native shell produce no findings', () => {
  const dir = fixtureTree();
  try {
    assert.deepEqual(inspectPackage({ resourcesDir: dir, tauriConfPath: TAURI_CONF, libRsPath: LIB_RS }), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const INJECTIONS = [
  ['a DEV variable assigned in shipped server code', 'server-runtime/src/other.js', "\nprocess.env.SMARTLEARN_DEV_PERSISTENT_SESSION = 'true';\n", ['DEV_VAR_DEFINED', 'DEV_VAR_NAMED']],
  ['AI consent put in an env object', 'server-runtime/src/other.js', "\nconst env = { 'SMARTLEARN_AI_CONSENT': 'true' };\n", ['DEV_VAR_DEFINED', 'DEV_VAR_NAMED']],
  ['a DEV variable defined in the frontend bundle', 'dist-runtime/assets/app.js', "\nwindow.x = 'SMARTLEARN_AI_PROVIDER';\n", ['DEV_VAR_NAMED']],
  ['a DEV variable defined by a shipped .ps1 line', 'server-runtime/src/launch.ps1', '$env:SMARTLEARN_AI_PROVIDER = "CODEX"\n', ['DEV_VAR_DEFINED', 'DEV_VAR_NAMED']],
  ['a DEV variable only NAMED by non-reviewed first-party code', 'shared/review-schedule.js', "\n// SMARTLEARN_AI_API_KEY\n", ['DEV_VAR_NAMED']],
  ['a .env file', 'server-runtime/.env', 'X=1\n', ['DOTENV_FILE']],
  ['the fixture password in the frontend', 'dist-runtime/assets/app.js', `\nconst p = '${FIXTURE_PASSWORD}';\n`, ['FIXTURE_PASSWORD']],
  ['the fixture password in a dependency', 'server-runtime/node_modules/pkg/index.js', `\n// ${FIXTURE_PASSWORD}\n`, ['FIXTURE_PASSWORD']],
  ['the fixture password in a binary-ish file', 'server-runtime/node_modules/pkg/blob.node', FIXTURE_PASSWORD, ['FIXTURE_PASSWORD']],
  ['the DEV datastore directory named outside its module', 'server-runtime/src/other.js', `\nconst d = '${DEV_DATA_DIRNAME}';\n`, ['DEV_DATA_PATH']],
];
for (const [label, rel, text, expected] of INJECTIONS) {
  test(`RED: ${label} is caught`, () => {
    const dir = fixtureTree();
    try {
      const p = join(dir, rel);
      mkdirSync(dirname(p), { recursive: true });
      if (existsSync(p)) appendFileSync(p, text); else writeFileSync(p, text);
      const found = kinds(inspectPackage({ resourcesDir: dir }));
      assert.deepEqual(found, expected.slice().sort());
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('reading a DEV variable in a reviewed module is allowed; the reviewed DEV-datastore module may name its directory', () => {
  const dir = fixtureTree();
  try {
    writeFileSync(join(dir, 'server-runtime/src/dev-datastore.js'), `export const d = (home) => join(home, '${DEV_DATA_DIRNAME}');\n`);
    assert.deepEqual(inspectPackage({ resourcesDir: dir }), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an empty staging directory is reported, not treated as clean', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smartlearn-inspect-empty-'));
  try { assert.deepEqual(kinds(inspectPackage({ resourcesDir: dir })), ['NOT_STAGED']); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the native shell sets exactly the reviewed backend environment and never NODE_ENV (existing decision: no Secure cookie on loopback)', () => {
  const keys = backendEnvKeys(readFileSync(LIB_RS, 'utf8'));
  assert.deepEqual([...keys].sort(), [...ALLOWED_BACKEND_ENV_KEYS].sort());
  assert.ok(!keys.includes('NODE_ENV'));
});

test('RED: a shell that sets NODE_ENV, a DEV variable or an unreviewed key is caught', () => {
  const dir = fixtureTree();
  const libDir = mkdtempSync(join(tmpdir(), 'smartlearn-lib-'));
  try {
    const original = readFileSync(LIB_RS, 'utf8');
    const mutated = original.replace('vec![', 'vec![\n        ("NODE_ENV".to_string(), "production".to_string()),\n        ("SMARTLEARN_AI_CONSENT".to_string(), "true".to_string()),\n        ("EXTRA_KEY".to_string(), "x".to_string()),');
    assert.notEqual(mutated, original);
    const libRs = join(libDir, 'lib.rs');
    writeFileSync(libRs, mutated);
    const found = inspectPackage({ resourcesDir: dir, libRsPath: libRs });
    assert.ok(found.some((f) => f.kind === 'BACKEND_ENV_KEY' && /existing decision/.test(f.detail)));
    assert.ok(found.some((f) => f.kind === 'BACKEND_ENV_KEY' && /EXTRA_KEY/.test(f.detail)));
    assert.ok(found.some((f) => f.kind === 'DEV_VAR_DEFINED' && /SMARTLEARN_AI_CONSENT/.test(f.detail)));
    writeFileSync(libRs, 'fn unrelated() {}\n');
    assert.ok(inspectPackage({ resourcesDir: dir, libRsPath: libRs }).some((f) => f.kind === 'BACKEND_ENV_UNPARSEABLE'));
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(libDir, { recursive: true, force: true }); }
});

test('RED: a Tauri config that carries a DEV variable or the fixture password is caught', () => {
  const dir = fixtureTree();
  const confDir = mkdtempSync(join(tmpdir(), 'smartlearn-conf-'));
  try {
    const conf = join(confDir, 'tauri.conf.json');
    writeFileSync(conf, JSON.stringify({ bundle: { env: { SMARTLEARN_DEV_PERSISTENT_SESSION: 'true', pw: FIXTURE_PASSWORD } } }));
    const found = kinds(inspectPackage({ resourcesDir: dir, tauriConfPath: conf }));
    assert.deepEqual(found, ['DEV_VAR_DEFINED', 'FIXTURE_PASSWORD']);
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(confDir, { recursive: true, force: true }); }
});

const CAN_PACKAGE = existsSync(join(ROOT, 'dist')) && existsSync(join(ROOT, 'server', 'node_modules'));
test('the REAL `package:standalone` output (staged in a temp dir) is clean, and an injected DEV variable in it is caught', { skip: CAN_PACKAGE ? false : 'needs `npm run build` and server/node_modules (the same prerequisites as package:standalone)', timeout: 180000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'smartlearn-package-'));
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'package-standalone.mjs')], {
      cwd: ROOT, stdio: 'pipe',
      env: { ...process.env, SMARTLEARN_PACKAGE_RESOURCES_DIR: out, SMARTLEARN_PACKAGE_SKIP_NODE: '1' },
    });
    assert.ok(existsSync(join(out, 'server-runtime', 'src', 'main.js')), 'the server was really staged in the temp dir');
    assert.deepEqual(defaultInspection(out), [], 'the real staged artifact has no DEV leak');

    const injected = join(out, 'server-runtime', 'src', 'app.js');
    const before = readFileSync(injected, 'utf8');
    appendFileSync(injected, "\nprocess.env.SMARTLEARN_DEV_PERSISTENT_SESSION = 'true';\n");
    assert.ok(defaultInspection(out).some((f) => f.kind === 'DEV_VAR_DEFINED' && f.file === 'server-runtime/src/app.js'), 'RED: the injected variable is caught');
    writeFileSync(injected, before);
    assert.deepEqual(defaultInspection(out), []);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
