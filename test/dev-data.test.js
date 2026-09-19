import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { devDataDir, devDbPaths, snapshotDevDbIfNeeded } from '../scripts/dev-data.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('the dev database lives in one stable user-level directory OUTSIDE any git worktree, overridable', () => {
  const home = 'C:/Users/someone';
  assert.equal(devDataDir({}, home), join(home, 'SmartLearn-DevData'));
  assert.equal(devDataDir({ SMARTLEARN_DEV_DATA_DIR: 'D:/x' }, home), 'D:/x');
  const real = devDbPaths({});
  const rel = relative(REPO_ROOT.toLowerCase(), resolve(real.dbPath).toLowerCase());
  assert.ok(rel.startsWith('..'), `dev DB must not be inside the repo/worktree (got ${real.dbPath})`);
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-devdata-'));
  const dbPath = join(dir, 'smartlearn-dev.db');
  const snaps = join(dir, 'snapshots');
  mkdirSync(snaps, { recursive: true });
  return { dir, dbPath, snaps, cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}

test('snapshot: nothing to copy without real data; copies db+wal once per day; never modifies the source', () => {
  const { dbPath, snaps, cleanup } = setup();
  try {
    assert.equal(snapshotDevDbIfNeeded(dbPath, snaps), null, 'missing db -> no snapshot');
    writeFileSync(dbPath, '');
    assert.equal(snapshotDevDbIfNeeded(dbPath, snaps), null, 'empty db -> no snapshot');
    writeFileSync(dbPath, 'REAL-DATA');
    writeFileSync(dbPath + '-wal', 'WAL');
    const target = snapshotDevDbIfNeeded(dbPath, snaps, { now: new Date('2026-09-19T10:00:00Z') });
    assert.ok(target.endsWith('2026-09-19'));
    assert.equal(readFileSync(join(target, 'smartlearn-dev.db'), 'utf8'), 'REAL-DATA');
    assert.equal(readFileSync(join(target, 'smartlearn-dev.db-wal'), 'utf8'), 'WAL');
    assert.equal(snapshotDevDbIfNeeded(dbPath, snaps, { now: new Date('2026-09-19T23:00:00Z') }), null, 'second run the same day is a no-op');
    assert.equal(readFileSync(dbPath, 'utf8'), 'REAL-DATA', 'the source is untouched');
  } finally { cleanup(); }
});

test('snapshot: a wiped DB never overwrites the last good snapshot, and only the newest N days are kept', () => {
  const { dbPath, snaps, cleanup } = setup();
  try {
    writeFileSync(dbPath, 'GOOD');
    for (let d = 1; d <= 9; d++) snapshotDevDbIfNeeded(dbPath, snaps, { now: new Date(`2026-09-0${d}T12:00:00Z`), keep: 7 });
    assert.deepEqual(readdirSync(snaps).sort(), ['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09']);
    writeFileSync(dbPath, '');   // the accident: DB wiped
    assert.equal(snapshotDevDbIfNeeded(dbPath, snaps, { now: new Date('2026-09-10T12:00:00Z'), keep: 7 }), null);
    assert.equal(readFileSync(join(snaps, '2026-09-09', 'smartlearn-dev.db'), 'utf8'), 'GOOD', 'the last good snapshot survives the wipe');
    assert.equal(existsSync(join(snaps, '2026-09-10')), false);
  } finally { cleanup(); }
});
