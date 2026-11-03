import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { seedDev, assertLoopback, buildPlan, DEV_ACCOUNT } from '../../scripts/seed-dev.mjs';

const MAIN_JS = fileURLToPath(new URL('../src/main.js', import.meta.url));
const PORT = 13992;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'http://localhost:5173';

async function startServer(dir) {
  const child = spawn(process.execPath, [MAIN_JS], {
    env: { ...process.env, NODE_ENV: 'test', SMARTLEARN_DB_PATH: join(dir, 'seed.db'), SMARTLEARN_SOURCES_DIR: join(dir, 's'), PORT: String(PORT), HOST: '127.0.0.1', SMARTLEARN_ALLOWED_ORIGINS: ORIGIN },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${BASE}/health/ready`)).status === 200) return child; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  child.kill();
  throw new Error('server did not start');
}

async function session() {
  const cookies = new Map();
  const call = async (method, path, body) => {
    const headers = { origin: ORIGIN };
    if (body) headers['content-type'] = 'application/json';
    if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(`${BASE}/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    for (const line of res.headers.getSetCookie?.() ?? []) { const [pair] = line.split(';'); const i = pair.indexOf('='); cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
    return res.json();
  };
  await call('POST', '/auth/login', DEV_ACCOUNT);
  return call;
}

test('seed-dev refuses any non-loopback server', () => {
  assert.doesNotThrow(() => assertLoopback('http://127.0.0.1:3000'));
  assert.doesNotThrow(() => assertLoopback('http://localhost:3000'));
  assert.throws(() => assertLoopback('https://smartlearn.example.com'), /REFUSING/);
  assert.throws(() => assertLoopback('http://192.168.0.10:3000'), /REFUSING/);
});

test('the plan covers every state the product needs to be observed in, with valid numbers and no future dates', () => {
  const today = new Date(2026, 8, 19);
  const plan = buildPlan(today);
  const states = new Set(plan.units.map((u) => u.state));
  for (const s of ['improving', 'stable', 'declining', 'insufficient', 'no-evidence', 'open-review-in-progress', 'overdue-without-material', 'new-with-last-wrong', 'declining+retest']) assert.ok(states.has(s), `missing state ${s}`);
  assert.ok(plan.units.some((u) => u.sourceText) && plan.units.some((u) => !u.sourceText), 'units with and without material');
  assert.ok(plan.units.some((u) => u.exercises.length > 0) && plan.units.some((u) => u.exercises.length === 0), 'units with and without exercises');
  for (const u of plan.units) for (const [offset, q, c] of u.evidence) { assert.ok(offset <= 0 && q > 0 && c >= 0 && c <= q, `bad evidence in ${u.key}`); }
  assert.deepEqual(buildPlan(today), buildPlan(today), 'deterministic for the same day');
});

test('seed-dev builds the living dataset through the real API, is idempotent, and never touches an already-populated account', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-seed-'));
  const server = await startServer(dir);
  try {
    const today = new Date();
    const first = await seedDev({ base: BASE, origin: ORIGIN, today });
    assert.equal(first.seeded, true);

    const call = await session();
    const subjects = (await call('GET', '/subjects')).subjects;
    const units = (await call('GET', '/learning-units')).units;
    assert.equal(subjects.length, 6);
    assert.equal(units.length, 10);

    // evidence: dated history of both kinds, and REVIEW rows only through completion
    const evidence = (await call('GET', '/learning-evidence')).evidence;
    const byType = (t) => evidence.filter((e) => e.type === t).length;
    assert.ok(byType('EXTERNAL') >= 10 && byType('INITIAL_PRACTICE') === 2 && byType('REVIEW') === 12, `evidence types: ${JSON.stringify(evidence.map((e) => e.type))}`);
    const dates = new Set(evidence.map((e) => e.evidenceDate));
    assert.ok(dates.size >= 8, 'history spans several distinct dates');

    // review states: completed, overdue, and future all present
    const allReviews = [];
    for (const u of units) allReviews.push(...(await call('GET', `/review-tasks?unitId=${u.id}`)).reviewTasks);
    const todayIso = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().slice(0, 10);
    assert.ok(allReviews.some((r) => r.completedAt), 'completed reviews');
    assert.ok(allReviews.some((r) => !r.completedAt && r.dueDate < todayIso), 'overdue reviews');
    assert.ok(allReviews.some((r) => !r.completedAt && r.dueDate > todayIso), 'future reviews');

    // item-level ledger: a fully judged block with errors, a half-answered block, a redo with mixed result, a new "last wrong"
    const exercisesOf = async (title) => {
      const unit = units.find((u) => u.title.startsWith(title));
      return { unit, exercises: (await call('GET', `/learning-units/${unit.id}/exercises`)).exercises, reviews: allReviews.filter((r) => r.unitId === unit.id) };
    };
    const batch = async (ids) => (await call('GET', `/review-task-attempts?ids=${ids.join(',')}`));
    const renal = await exercisesOf('Fisiologia renal');
    const renalBatch = await batch(renal.reviews.map((r) => r.id));
    const renalJudged = Object.values(renalBatch.attemptsByReviewTask).find((list) => list.length === 4);
    assert.ok(renalJudged, 'a fully judged renal block');
    assert.equal(renalJudged.filter((a) => a.outcome === 'INCORRECT').length, 2, 'with two errors (Refazer erros available)');

    const ausculta = await exercisesOf('Ausculta cardíaca');
    const auscultaBatch = await batch(ausculta.reviews.map((r) => r.id));
    assert.ok(Object.values(auscultaBatch.attemptsByReviewTask).some((list) => list.length === 2), 'a half-answered block in progress (2 of 3)');

    const farmaco = await exercisesOf('Farmacocinética');
    const farmacoBatch = await batch(farmaco.reviews.map((r) => r.id));
    const priorWrong = new Set(Object.values(farmacoBatch.priorWrongByReviewTask).flat());
    assert.ok(priorWrong.has(farmaco.exercises[1].id), 'redo still wrong -> flagged as last-attempt wrong');
    assert.ok(!priorWrong.has(farmaco.exercises[0].id), 'redo corrected -> not flagged');

    const avc = await exercisesOf('AVC isquêmico');
    const avcBatch = await batch(avc.reviews.map((r) => r.id));
    assert.ok(Object.values(avcBatch.priorWrongByReviewTask).flat().includes(avc.exercises[2].id), 'a brand-new unit with a last-wrong item');

    // idempotent + never extends existing data
    const second = await seedDev({ base: BASE, origin: ORIGIN, today });
    assert.deepEqual(second, { seeded: false, reason: 'already-populated' });
    assert.equal((await call('GET', '/learning-units')).units.length, 10);
    assert.equal((await call('GET', '/subjects')).subjects.length, 6);
  } finally {
    server.kill();
    await new Promise((r) => setTimeout(r, 400));
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
