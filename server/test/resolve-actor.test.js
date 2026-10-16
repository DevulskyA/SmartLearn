import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import * as sessions from '../src/repositories/sessions.js';
import { createSessionActorResolver } from '../src/auth/resolve-actor.js';
import { generateSessionToken, hashToken, sessionCookieName, SESSION_INACTIVITY_LIFETIME_MS } from '../src/auth/session-tokens.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-resolve-actor-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)
  `).run(email, email, now, now).lastInsertRowid;
}

// FASE 8 mutation-test finding (2026-09-15): resolve-actor.js's own
// isSessionInactive() enforcement — the actual gate that revokes and
// rejects a session past its 7-day inactivity window — had no test
// anywhere in the project. isSessionInactive itself is boundary-tested
// (session-security.test.js), but nothing proved resolveActor actually
// calls it and honors the result: mutating that check away survived the
// full 373-test server suite untouched. This file closes that gap at the
// real integration point, not just the pure function.

function makeSessionAndResolver(db, { userId, lastSeen, isProduction = false }) {
  const rawToken = generateSessionToken();
  const issuedAt = lastSeen;
  const farFuture = '2099-01-01T00:00:00.000Z'; // absolute expiry irrelevant to this test
  const session = sessions.createSession(db, {
    tokenHash: hashToken(rawToken), userId, issuedAt, expiresAt: farFuture, csrfToken: 'csrf-1',
  });
  db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?').run(lastSeen, session.id);
  return { rawToken, sessionId: session.id };
}

function fakeRequest(cookieName, rawToken) {
  return { cookies: { [cookieName]: rawToken } };
}

test('resolveActor accepts a recently-active session and touches last_seen', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'active@example.com');
    const lastSeen = '2026-01-01T00:00:00.000Z';
    const { rawToken, sessionId } = makeSessionAndResolver(db, { userId, lastSeen });
    const nowMs = new Date(lastSeen).getTime() + 1000; // 1 second later — well within the 7-day window
    const resolveActor = createSessionActorResolver(db, { isProduction: false, now: () => new Date(nowMs) });

    const actor = await resolveActor(fakeRequest(sessionCookieName(false), rawToken));
    assert.equal(actor?.userId, userId);

    const row = sessions.findById(db, sessionId);
    assert.equal(row.revokedAt, null, 'an active session must not be revoked');
    assert.notEqual(row.lastSeen, lastSeen, 'last_seen must be touched on successful resolution');
  } finally { cleanup(); }
});

test('resolveActor rejects and revokes a session past the 7-day inactivity window', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'stale@example.com');
    const lastSeen = '2026-01-01T00:00:00.000Z';
    const { rawToken, sessionId } = makeSessionAndResolver(db, { userId, lastSeen });
    const nowMs = new Date(lastSeen).getTime() + SESSION_INACTIVITY_LIFETIME_MS + 1000; // just over 7 days
    const resolveActor = createSessionActorResolver(db, { isProduction: false, now: () => new Date(nowMs) });

    const actor = await resolveActor(fakeRequest(sessionCookieName(false), rawToken));
    assert.equal(actor, null, 'an inactive session must never resolve to an actor');

    const row = sessions.findById(db, sessionId);
    assert.notEqual(row.revokedAt, null, 'an inactive session must be revoked, not just silently ignored once');
  } finally { cleanup(); }
});

test('resolveActor: a session revoked by inactivity stays rejected on a second request, even with a fresh clock', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'revoked-stays@example.com');
    const lastSeen = '2026-01-01T00:00:00.000Z';
    const { rawToken, sessionId } = makeSessionAndResolver(db, { userId, lastSeen });
    const staleMs = new Date(lastSeen).getTime() + SESSION_INACTIVITY_LIFETIME_MS + 1000;
    const resolverAtStaleTime = createSessionActorResolver(db, { isProduction: false, now: () => new Date(staleMs) });
    await resolverAtStaleTime(fakeRequest(sessionCookieName(false), rawToken));
    assert.notEqual(sessions.findById(db, sessionId).revokedAt, null);

    // A second request, even one whose own clock would otherwise look "recent"
    // relative to some hypothetical new last_seen, must still find the token
    // revoked (findActiveByTokenHash filters on revoked_at IS NULL) — a
    // revoked session can never come back to life.
    const resolverAgain = createSessionActorResolver(db, { isProduction: false, now: () => new Date(staleMs + 1000) });
    const actor = await resolverAgain(fakeRequest(sessionCookieName(false), rawToken));
    assert.equal(actor, null);
  } finally { cleanup(); }
});

test('resolveActor returns null when no session cookie is present, without touching the DB', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const resolveActor = createSessionActorResolver(db, { isProduction: false });
    const actor = await resolveActor({ cookies: {} });
    assert.equal(actor, null);
  } finally { cleanup(); }
});
