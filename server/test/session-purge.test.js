import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { purgeStaleSessions } from '../src/repositories/sessions.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const NOW = '2026-10-04T12:00:00.000Z';
const daysAgo = (n) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();
const daysAhead = (n) => new Date(Date.parse(NOW) + n * 86_400_000).toISOString();

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-purge-'));
  const db = openDb(join(dir, 'test.db'));
  runMigrations(db, MIGRATIONS_DIR);
  db.prepare("INSERT INTO users (email, email_display, password_hash, password_salt, password_params, created_at, updated_at) VALUES ('a@x.com','a@x.com','h','s','p',?,?)").run(NOW, NOW);
  let n = 0;
  const add = ({ issued, expires, revoked = null }) => db.prepare('INSERT INTO sessions (token_hash, user_id, issued_at, expires_at, last_seen, revoked_at, csrf_token) VALUES (?,?,?,?,?,?,?)')
    .run(`hash-${(n += 1)}`, 1, issued, expires, issued, revoked, 'c');
  return { db, add, ids: () => db.prepare('SELECT token_hash FROM sessions ORDER BY id').all().map((r) => r.token_hash), cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

test('purge removes sessions revoked or expired more than 30 days ago and never touches an active one (DEV sessions of ~10 years included)', () => {
  const s = setup();
  try {
    s.add({ issued: daysAgo(100), expires: daysAgo(70) });                                   // 1 expired 70 days ago -> removed
    s.add({ issued: daysAgo(100), expires: daysAhead(5), revoked: daysAgo(40) });            // 2 revoked 40 days ago -> removed
    s.add({ issued: daysAgo(100), expires: daysAgo(31) });                                   // 3 expired 31 days ago -> removed
    s.add({ issued: daysAgo(100), expires: daysAgo(10) });                                   // 4 expired 10 days ago -> kept
    s.add({ issued: daysAgo(100), expires: daysAhead(20), revoked: daysAgo(5) });            // 5 revoked 5 days ago -> kept
    s.add({ issued: daysAgo(2), expires: daysAhead(28) });                                   // 6 active -> kept
    s.add({ issued: daysAgo(2), expires: daysAhead(3650) });                                 // 7 active DEV session (10 years) -> kept
    const removed = purgeStaleSessions(s.db, NOW);
    assert.equal(removed, 3);
    assert.deepEqual(s.ids(), ['hash-4', 'hash-5', 'hash-6', 'hash-7']);
  } finally { s.cleanup(); }
});

test('purge is idempotent, honours a custom window, and an empty table is fine', () => {
  const s = setup();
  try {
    assert.equal(purgeStaleSessions(s.db, NOW), 0);
    s.add({ issued: daysAgo(30), expires: daysAgo(8) });
    assert.equal(purgeStaleSessions(s.db, NOW), 0, 'within the default 30-day window');
    assert.equal(purgeStaleSessions(s.db, NOW, { olderThanDays: 7 }), 1);
    assert.equal(purgeStaleSessions(s.db, NOW, { olderThanDays: 7 }), 0);
  } finally { s.cleanup(); }
});
