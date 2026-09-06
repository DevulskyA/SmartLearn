import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/db.js';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-test-'));
  return { dir, path: join(dir, 'test.db'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('WAL mode active after open', () => {
  const { path, cleanup } = tmpDb();
  try {
    const db = openDb(path);
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
    db.close();
  } finally {
    cleanup();
  }
});

test('foreign_keys enabled after open', () => {
  const { path, cleanup } = tmpDb();
  try {
    const db = openDb(path);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    db.close();
  } finally {
    cleanup();
  }
});

test('synchronous = NORMAL after open', () => {
  const { path, cleanup } = tmpDb();
  try {
    const db = openDb(path);
    assert.equal(db.pragma('synchronous', { simple: true }), 1); // 1 = NORMAL
    db.close();
  } finally {
    cleanup();
  }
});

test('creates nested directory when missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-test-'));
  const path = join(dir, 'nested', 'deep', 'test.db');
  try {
    const db = openDb(path);
    assert.ok(db.prepare('SELECT 1').get());
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
