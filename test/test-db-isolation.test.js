import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// HUMAN DEV DATA != TEST DATA: automated tests (unit, server, e2e) must never name the persistent human DEV datastore or the
// Desktop's app-data database. They create their own throwaway databases under the OS temp directory.

const root = fileURLToPath(new URL('..', import.meta.url));
// dev-data.test.js and desktop-entrypoint.test.js legitimately talk ABOUT those paths (they test the pinning); this file names them to forbid them.
// The others below only PROVE a refusal or exercise the lock/snapshot/restore code on throwaway directories under os.tmpdir():
// prompt-lab-runner passes the protected paths to a pure guard that must throw before opening anything; the dev-* server tests
// build a fake datastore (SMARTLEARN_DEV_DATA_DIR) inside a temp directory and never resolve the real one.
const ALLOWED = new Set([
  'test/dev-data.test.js', 'test/desktop-entrypoint.test.js', 'test/test-db-isolation.test.js',
  'test/prompt-lab-runner.test.js',
  'server/test/dev-lock.test.js', 'server/test/dev-snapshot.test.js', 'server/test/dev-restore.test.js', 'server/test/dev-datastore-startup.test.js',
]);
const FORBIDDEN = [/SmartLearn-DevData/, /com\.devulsky\.smartlearn/, /smartlearn-dev\.db/, /\bdevDbPaths\b/, /\bdevDataDir\b/];

function specFiles(dir) {
  return readdirSync(join(root, dir)).filter((f) => /\.(test|spec)\.js$/.test(f)).map((f) => `${dir}/${f}`);
}

test('no automated test touches the persistent human DEV datastore or the Desktop app-data database', () => {
  const files = [...specFiles('test'), ...specFiles('server/test'), ...specFiles('e2e')].filter((f) => !ALLOWED.has(f));
  assert.ok(files.length > 100, 'the scan must actually cover the suites');
  const offenders = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const pattern of FORBIDDEN) if (pattern.test(text)) offenders.push(`${file}: ${pattern}`);
  }
  assert.deepEqual(offenders, []);
});

test('every e2e spec that starts a real server gives it a database under the OS temp directory', () => {
  const offenders = [];
  for (const file of specFiles('e2e')) {
    const text = readFileSync(join(root, file), 'utf8');
    if (!/SMARTLEARN_DB_PATH/.test(text)) continue;
    if (!/tmpdir\(\)/.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
