import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { runMigrations, canonicalChecksum } from '../src/migrations.js';
import {
  estimateCostUnits, ESTIMATION, periodKeys, reserve, settle, release, getUsage, reconcileOrphans, BudgetError,
} from '../src/services/generation-budget.js';

// T-F10-04a (R-12, INV-13): the credit ledger. Cost unit = estimated model tokens (provider-agnostic). Before a provider is
// called: estimate <= max per job AND <= remaining weekly AND <= remaining monthly, and the reservation is atomic so
// concurrent jobs can never spend the same balance. Failure before any external call debits nothing. Limit VALUES are not
// decided here (HG-11): every test passes its own numbers; a null limit means "no limit on that dimension".

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const T = (iso) => () => new Date(iso);
const WED = '2026-10-07T12:00:00.000Z'; // ISO week 2026-W41, month 2026-10

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-budget-'));
  const path = join(dir, 'test.db');
  const db = openDb(path);
  runMigrations(db, MIGRATIONS_DIR);
  return { dir, path, db, cleanup: () => { try { db.close(); } catch { /* closed */ } rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

function makeUser(db, email) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO users (email, email_display, password_hash, password_salt, password_algorithm, password_params, created_at, updated_at)
    VALUES (?, ?, 'h', 's', 'scrypt', '{}', ?, ?)`).run(email, email, now, now).lastInsertRowid;
}

const rowsOf = (db) => db.prepare('SELECT state, estimated_units AS est, consumed_units AS used FROM generation_reservations ORDER BY id').all();
const refusal = (fn) => { try { fn(); } catch (e) { return e; } return null; };

test('the estimate is conservative and monotonic: more text never costs less, every call is counted, and it never undershoots chars/4', () => {
  const small = estimateCostUnits({ payloadChars: 1_000 });
  const big = estimateCostUnits({ payloadChars: 40_000 });
  assert.ok(big > small);
  assert.ok(estimateCostUnits({ payloadChars: 0 }) > 0, 'even an empty payload pays for the answer ceiling');
  assert.ok(estimateCostUnits({ payloadChars: 10_000, calls: 3 }) > estimateCostUnits({ payloadChars: 10_000, calls: 1 }));
  assert.ok(big >= 40_000 / 4, 'never below the usual chars-per-token rate');
  assert.throws(() => estimateCostUnits({ payloadChars: -1 }), RangeError);
  assert.throws(() => estimateCostUnits({ payloadChars: Number.NaN }), RangeError);
  assert.equal(typeof ESTIMATION.charsPerUnit, 'number');
});

test('periods are UTC ISO weeks and calendar months', () => {
  assert.deepEqual(periodKeys(new Date('2026-10-07T12:00:00Z')), { weekKey: '2026-W41', monthKey: '2026-10' });
  assert.equal(periodKeys(new Date('2026-10-04T23:59:59Z')).weekKey, '2026-W40', 'Sunday still belongs to the week that started the Monday before');
  assert.equal(periodKeys(new Date('2026-10-05T00:00:00Z')).weekKey, '2026-W41');
  assert.deepEqual(periodKeys(new Date('2026-12-31T10:00:00Z')), { weekKey: '2026-W53', monthKey: '2026-12' });
  assert.equal(periodKeys(new Date('2027-01-01T10:00:00Z')).weekKey, '2026-W53', 'ISO week-year, not calendar year');
});

test('a reservation within every limit is recorded as RESERVED and counts against the balance', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b1@example.com');
    const limits = { maxPerJob: 500, weekly: 1000, monthly: 3000 };
    const r = reserve(db, userId, { proposalId: 7, estimatedUnits: 400, limits, now: T(WED) });
    assert.equal(r.state, 'RESERVED');
    assert.deepEqual(rowsOf(db), [{ state: 'RESERVED', est: 400, used: null }]);
    const u = getUsage(db, userId, { limits, now: T(WED) });
    assert.equal(u.weekly.reserved, 400);
    assert.equal(u.weekly.remaining, 600);
    assert.equal(u.monthly.remaining, 2600);
  } finally { cleanup(); }
});

test('refused BEFORE anything is reserved, naming the dimension: per job, weekly, monthly; no residual rows', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b2@example.com');
    const e1 = refusal(() => reserve(db, userId, { proposalId: 1, estimatedUnits: 600, limits: { maxPerJob: 500, weekly: 9999, monthly: 9999 }, now: T(WED) }));
    assert.ok(e1 instanceof BudgetError);
    assert.equal(e1.code, 'BUDGET_EXCEEDED');
    assert.equal(e1.limit, 'PER_JOB');
    reserve(db, userId, { proposalId: 1, estimatedUnits: 400, limits: { maxPerJob: 500, weekly: 1000, monthly: 9999 }, now: T(WED) });
    const e2 = refusal(() => reserve(db, userId, { proposalId: 2, estimatedUnits: 400, limits: { maxPerJob: 500, weekly: 700, monthly: 9999 }, now: T(WED) }));
    assert.deepEqual([e2.code, e2.limit, e2.remaining], ['BUDGET_EXCEEDED', 'WEEKLY', 300]);
    const e3 = refusal(() => reserve(db, userId, { proposalId: 3, estimatedUnits: 400, limits: { maxPerJob: 500, weekly: 9999, monthly: 700 }, now: T(WED) }));
    assert.deepEqual([e3.limit, e3.remaining], ['MONTHLY', 300]);
    assert.equal(rowsOf(db).length, 1, 'only the first, valid reservation exists');
  } finally { cleanup(); }
});

test('a null limit means "no limit on that dimension" (values are a pending human decision), but the others still bind', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b3@example.com');
    const none = { maxPerJob: null, weekly: null, monthly: null };
    for (let i = 0; i < 5; i++) reserve(db, userId, { proposalId: i, estimatedUnits: 1_000_000, limits: none, now: T(WED) });
    assert.equal(rowsOf(db).length, 5);
    const e = refusal(() => reserve(db, userId, { proposalId: 9, estimatedUnits: 10, limits: { ...none, monthly: 100 }, now: T(WED) }));
    assert.equal(e.limit, 'MONTHLY');
  } finally { cleanup(); }
});

test('CONCURRENT jobs cannot spend the same balance: 5 interleaved jobs for a balance of 2 -> exactly 2 reserve, 3 are refused, and the total never exceeds the limit', async () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b4@example.com');
    const limits = { maxPerJob: 500, weekly: 1000, monthly: 5000 };
    let peak = 0;
    const job = async (i) => {
      let r;
      try { r = reserve(db, userId, { proposalId: i, estimatedUnits: 400, limits, now: T(WED) }); } catch (e) { return e.code; }
      await new Promise((resolve) => setTimeout(resolve, 5)); // the provider call: other jobs run meanwhile
      const u = getUsage(db, userId, { limits, now: T(WED) });
      peak = Math.max(peak, u.weekly.reserved + u.weekly.consumed);
      settle(db, r.id, { consumedUnits: 380, basis: 'MEASURED' });
      return 'OK';
    };
    const results = await Promise.all([1, 2, 3, 4, 5].map(job));
    assert.equal(results.filter((x) => x === 'OK').length, 2);
    assert.equal(results.filter((x) => x === 'BUDGET_EXCEEDED').length, 3);
    assert.ok(peak <= 1000, `peak spend ${peak} stayed within the weekly limit`);
  } finally { cleanup(); }
});

test('a reservation made through ANOTHER connection to the same file is seen: the second one is refused (no per-connection cache)', () => {
  const { path, db, cleanup } = tmpDb();
  const other = openDb(path);
  try {
    const userId = makeUser(db, 'b5@example.com');
    const limits = { maxPerJob: 500, weekly: 500, monthly: 5000 };
    reserve(db, userId, { proposalId: 1, estimatedUnits: 400, limits, now: T(WED) });
    const e = refusal(() => reserve(other, userId, { proposalId: 2, estimatedUnits: 400, limits, now: T(WED) }));
    assert.equal(e?.limit, 'WEEKLY');
  } finally { other.close(); cleanup(); }
});

test('release gives the balance back with ZERO debit (failure before any external call); a released or settled reservation cannot be released/settled again', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b6@example.com');
    const limits = { maxPerJob: 500, weekly: 500, monthly: 5000 };
    const r = reserve(db, userId, { proposalId: 1, estimatedUnits: 400, limits, now: T(WED) });
    release(db, r.id);
    assert.deepEqual(rowsOf(db), [{ state: 'RELEASED', est: 400, used: 0 }]);
    assert.equal(getUsage(db, userId, { limits, now: T(WED) }).weekly.remaining, 500);
    reserve(db, userId, { proposalId: 2, estimatedUnits: 400, limits, now: T(WED) }); // the freed balance is usable
    assert.throws(() => release(db, r.id), (e) => e.code === 'INVALID_STATE');
    assert.throws(() => settle(db, r.id, { consumedUnits: 1, basis: 'MEASURED' }), (e) => e.code === 'INVALID_STATE');
  } finally { cleanup(); }
});

test('settle reconciles reserved vs consumed: spending less frees the difference; spending more is recorded even above the limit and blocks the next reservation', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b7@example.com');
    const limits = { maxPerJob: 500, weekly: 600, monthly: 5000 };
    const a = reserve(db, userId, { proposalId: 1, estimatedUnits: 400, limits, now: T(WED) });
    settle(db, a.id, { consumedUnits: 150, basis: 'MEASURED' });
    assert.equal(getUsage(db, userId, { limits, now: T(WED) }).weekly.remaining, 450);
    const b = reserve(db, userId, { proposalId: 2, estimatedUnits: 400, limits, now: T(WED) });
    settle(db, b.id, { consumedUnits: 900, basis: 'MEASURED' }); // the provider spent more than reserved: it happened, it is recorded
    const u = getUsage(db, userId, { limits, now: T(WED) });
    assert.equal(u.weekly.consumed, 1050);
    assert.equal(u.weekly.remaining, 0, 'remaining never shows a negative balance');
    assert.equal(refusal(() => reserve(db, userId, { proposalId: 3, estimatedUnits: 1, limits, now: T(WED) }))?.limit, 'WEEKLY');
    assert.throws(() => settle(db, 999999, { consumedUnits: 1, basis: 'MEASURED' }), (e) => e.code === 'NOT_FOUND');
    assert.throws(() => settle(db, a.id, { consumedUnits: -5, basis: 'MEASURED' }), RangeError);
  } finally { cleanup(); }
});

test('consumption is recorded with its basis (MEASURED by the provider, or ESTIMATED when the provider cannot measure)', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b8@example.com');
    const limits = { maxPerJob: 500, weekly: 5000, monthly: 5000 };
    const a = reserve(db, userId, { proposalId: 1, estimatedUnits: 300, limits, now: T(WED) });
    settle(db, a.id, { consumedUnits: 300, basis: 'ESTIMATED' });
    assert.equal(db.prepare('SELECT consumption_basis AS b FROM generation_reservations WHERE id = ?').get(a.id).b, 'ESTIMATED');
    const b = reserve(db, userId, { proposalId: 2, estimatedUnits: 300, limits, now: T(WED) });
    assert.throws(() => settle(db, b.id, { consumedUnits: 10, basis: 'GUESS' }), RangeError);
  } finally { cleanup(); }
});

test('periods isolate usage: last week and last month do not count; the same week does; other users never count', () => {
  const { db, cleanup } = tmpDb();
  try {
    const a = makeUser(db, 'b9a@example.com');
    const b = makeUser(db, 'b9b@example.com');
    const limits = { maxPerJob: 500, weekly: 500, monthly: 600 };
    reserve(db, a, { proposalId: 1, estimatedUnits: 400, limits, now: T('2026-09-29T10:00:00Z') }); // 2026-W40, September
    assert.equal(getUsage(db, a, { limits, now: T(WED) }).weekly.remaining, 500, 'a reservation from the previous week/month is not counted');
    reserve(db, a, { proposalId: 2, estimatedUnits: 400, limits, now: T('2026-10-05T00:00:00Z') });
    assert.equal(refusal(() => reserve(db, a, { proposalId: 3, estimatedUnits: 400, limits, now: T('2026-10-11T23:59:00Z') }))?.limit, 'WEEKLY', 'Sunday of the same ISO week still counts');
    reserve(db, a, { proposalId: 4, estimatedUnits: 200, limits: { ...limits, weekly: 900 }, now: T('2026-10-12T00:00:00Z') });
    reserve(db, b, { proposalId: 5, estimatedUnits: 500, limits, now: T(WED) });
    assert.equal(getUsage(db, b, { limits, now: T(WED) }).weekly.reserved, 500, "user B's usage is only B's");
  } finally { cleanup(); }
});

test('20 sequential single-unit requests ("generate chapters 1-20") stay bounded by the weekly limit: only as many as the balance allows are reserved', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b10@example.com');
    const limits = { maxPerJob: 400, weekly: 1000, monthly: 100000 };
    let granted = 0;
    for (let chapter = 1; chapter <= 20; chapter++) {
      try { reserve(db, userId, { proposalId: chapter, estimatedUnits: 300, limits, now: T(WED) }); granted += 1; } catch (e) { assert.equal(e.code, 'BUDGET_EXCEEDED'); }
    }
    assert.equal(granted, 3);
    assert.equal(rowsOf(db).length, 3);
  } finally { cleanup(); }
});

test('orphaned reservations (a crash after the call may have spent them) are settled at the ESTIMATE, never refunded; fresh ones are untouched', () => {
  const { db, cleanup } = tmpDb();
  try {
    const userId = makeUser(db, 'b11@example.com');
    const limits = { maxPerJob: 500, weekly: 5000, monthly: 5000 };
    reserve(db, userId, { proposalId: 1, estimatedUnits: 400, limits, now: T('2026-10-07T08:00:00Z') });
    reserve(db, userId, { proposalId: 2, estimatedUnits: 300, limits, now: T('2026-10-07T11:55:00Z') });
    const changed = reconcileOrphans(db, { maxAgeMs: 30 * 60 * 1000, now: T('2026-10-07T12:00:00Z') });
    assert.equal(changed, 1);
    assert.deepEqual(rowsOf(db), [{ state: 'SETTLED', est: 400, used: 400 }, { state: 'RESERVED', est: 300, used: null }]);
    assert.equal(db.prepare('SELECT consumption_basis AS b FROM generation_reservations WHERE id = 1').get().b, 'ESTIMATED_ORPHAN');
  } finally { cleanup(); }
});

test('migration 032 is additive and its manifest checksum matches the file', () => {
  const { db, cleanup } = tmpDb();
  try {
    const sql = readFileSync(join(MIGRATIONS_DIR, '032-generation-budget.sql'), 'utf8');
    const manifest = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'manifest.json'), 'utf8')).find((m) => m.version === 32);
    assert.equal(manifest.checksum, canonicalChecksum(sql));
    assert.equal(db.prepare('SELECT checksum FROM schema_migrations WHERE version = 32').get().checksum, manifest.checksum);
    assert.ok(!/DROP|DELETE|UPDATE\s/i.test(sql.replace(/--[^\n]*/g, '')), 'forward-only, nothing destructive');
  } finally { cleanup(); }
});
