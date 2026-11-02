import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatCard, findPlanbanCli, createPlanbanPublisher, makeCliExec, suiteTag, RUN_TAG } from '../scripts/test-live-planban.mjs';

// None of these tests touches the real Planban board: the executor is a fake, or a throwaway script in a temp dir.

const running = { suite: 'unit', state: 'RUNNING', headTested: 'abcdef1234567890', startedAt: '2026-11-02T10:00:00.000Z', counts: { total: 862, done: 120, passed: 118, failed: 1, skipped: 1 }, lastTest: 'some test' };
const passed = { ...running, state: 'PASS', exitCode: 0, durationMs: 65000, updatedAt: '2026-11-02T10:01:05.000Z', counts: { total: 862, done: 862, passed: 862, failed: 0, skipped: 0 }, log: 'C:/x/unit.log' };

test('formatCard: a running suite is "[Rodando]" in In Progress with live counts and duration', () => {
  const c = formatCard(running, { now: Date.parse('2026-11-02T10:01:05.000Z'), root: 'C:/wt' });
  assert.equal(c.title, '[Rodando] test-live unit');
  assert.equal(c.status, 'in-progress');
  assert.match(c.summary, /120\/862 feitos · 118 ok · 1 falhas · 1 pulados · 1m05s/);
  assert.match(c.summary, /HEAD abcdef1\./);
  assert.match(c.summary, /Worktree: C:\/wt/);
  assert.match(c.summary, /Último: some test/);
});

test('formatCard: a finished suite is "[Terminou]" with the result, counts and duration, and is NOT completed (pending)', () => {
  const c = formatCard(passed);
  assert.equal(c.title, '[Terminou] test-live unit · PASS');
  assert.equal(c.status, 'pending'); // Complete is person-controlled in Planban
  assert.match(c.summary, /terminou: PASS \(exit 0\)\. 862\/862 feitos · 862 ok · 0 falhas · 0 pulados · 1m05s/);
  const fail = formatCard({ ...passed, state: 'FAIL', exitCode: 1 });
  assert.equal(fail.title, '[Terminou] test-live unit · FAIL');
  assert.match(fail.nextAction, /C:\/x\/unit\.log/);
  const aborted = formatCard({ ...passed, state: 'ABORTED', exitCode: 130 });
  assert.equal(aborted.title, '[Terminou] test-live unit · ABORTED');
  assert.match(aborted.nextAction, /interrompida/);
});

test('findPlanbanCli: PLANBAN_CLI wins, then the registered marketplace, else null (never throws)', () => {
  const have = new Set(['/env/planban.mjs', '/mk/bin/planban.mjs']);
  const exists = (p) => have.has(p.replace(/\\/g, '/'));
  assert.equal(findPlanbanCli({ env: { PLANBAN_CLI: '/env/planban.mjs' }, home: '/h', exists }), '/env/planban.mjs');
  const registry = JSON.stringify({ planban: { installLocation: '/mk' } });
  assert.equal(findPlanbanCli({ env: {}, home: '/h', exists, readText: () => registry }).replace(/\\/g, '/'), '/mk/bin/planban.mjs');
  assert.equal(findPlanbanCli({ env: {}, home: '/h', exists: () => false, readText: () => { throw new Error('no file'); } }), null);
});

// create-card answers like the real CLI (verified against the installed Planban: { ...state, createdCard })
function fakeBoard({ existing = null, failOn = null, createAnswer = { revision: 9, createdCard: { id: 'rodando-test-live-unit' } } } = {}) {
  const calls = [];
  const messages = [];
  let created = null;
  const exec = async (args) => {
    calls.push(args);
    if (failOn && args[0] === failOn) throw new Error('boom');
    if (args[0] === 'query-cards') return JSON.stringify({ matches: existing || created ? [{ item: existing ?? created }] : [] });
    if (args[0] === 'create-card') { created = { id: 'rodando-test-live-unit', status: 'in-progress' }; return JSON.stringify(createAnswer); }
    return '{}';
  };
  return { calls, messages, exec, say: (m) => messages.push(m) };
}

test('publisher: first run creates the tagged card in In Progress; updates and the final close reuse it and leave In Progress', async () => {
  const b = fakeBoard();
  const p = createPlanbanPublisher({ exec: b.exec, say: b.say });
  await p.start(running);
  assert.equal(p.cardId, 'rodando-test-live-unit');
  const create = b.calls.find((a) => a[0] === 'create-card');
  assert.equal(create[1], '[Rodando] test-live unit');
  assert.deepEqual(create.filter((x, i) => create[i - 1] === '--tag'), [RUN_TAG, suiteTag('unit')]);
  assert.equal(create[create.indexOf('--status') + 1], 'in-progress');

  await p.update({ ...running, counts: { ...running.counts, done: 300 } });
  const upd = b.calls.at(-1);
  assert.deepEqual(upd.slice(0, 3), ['update-card', 'rodando-test-live-unit', '--summary']);
  assert.match(upd[3], /300\/862/);

  await p.finish(passed);
  const [fin, move] = b.calls.slice(-2);
  assert.equal(fin[0], 'update-card');
  assert.equal(fin[fin.indexOf('--title') + 1], '[Terminou] test-live unit · PASS');
  assert.deepEqual(move, ['move-card', 'rodando-test-live-unit', '--status', 'pending', '--first']);
  assert.equal(p.disabled, false);
});

test('publisher: if create-card answers in an unexpected shape, the new card is still found by its tag (no orphan, no failure)', async () => {
  const b = fakeBoard({ createAnswer: { revision: 9 } });
  const p = createPlanbanPublisher({ exec: b.exec, say: b.say });
  await p.start(running);
  assert.equal(p.cardId, 'rodando-test-live-unit');
  assert.equal(p.disabled, false);
  assert.deepEqual(b.calls.map((a) => a[0]), ['query-cards', 'create-card', 'query-cards']);
});

test('publisher: a later run finds the suite card by tag and reopens it instead of creating another', async () => {
  const b = fakeBoard({ existing: { id: 'old-card', status: 'pending' } });
  const p = createPlanbanPublisher({ exec: b.exec, say: b.say });
  await p.start(running);
  assert.equal(p.cardId, 'old-card');
  assert.equal(b.calls.some((a) => a[0] === 'create-card'), false);
  assert.deepEqual(b.calls[0], ['query-cards', '--tag', 'test-live-run-unit']);
  assert.deepEqual(b.calls.at(-1), ['move-card', 'old-card', '--status', 'in-progress', '--first']);
});

test('publisher: periodic updates are dropped while a call is pending (no pile-up on a slow board)', async () => {
  const b = fakeBoard();
  const p = createPlanbanPublisher({ exec: b.exec, say: b.say });
  await p.start(running);
  const before = b.calls.length;
  p.update(running); p.update(running); p.update(running); // synchronous burst
  await p.flush();
  assert.equal(b.calls.length - before, 1);
});

test('publisher: the first failure switches publishing off ONCE with a clear message; nothing else is attempted and nothing throws', async () => {
  const b = fakeBoard({ failOn: 'query-cards' });
  const p = createPlanbanPublisher({ exec: b.exec, say: b.say });
  await p.start(running);
  assert.equal(p.disabled, true);
  await p.update(running);
  await p.finish(passed);
  await p.flush();
  assert.deepEqual(b.calls.map((a) => a[0]), ['query-cards']);
  assert.equal(b.messages.length, 1);
  assert.match(b.messages[0], /Planban indisponível \(boom\); o teste segue sem publicar o cartão/);
});

test('publisher: a failed count refresh does not cost the card its final close; three in a row switch publishing off', async () => {
  const b = fakeBoard();
  let failRefresh = true;
  const exec = (args) => (failRefresh && args[0] === 'update-card' && args[2] === '--summary' ? Promise.reject(new Error('slow')) : b.exec(args));
  const p = createPlanbanPublisher({ exec, say: b.say });
  await p.start(running);
  await p.update(running);
  await p.update(running);
  assert.equal(p.disabled, false);
  failRefresh = false;
  await p.finish(passed);
  assert.deepEqual(b.calls.at(-1), ['move-card', 'rodando-test-live-unit', '--status', 'pending', '--first']);
  assert.equal(b.messages.filter((m) => /indisponível/.test(m)).length, 0);

  const c = fakeBoard();
  const q = createPlanbanPublisher({ exec: (args) => (args[2] === '--summary' ? Promise.reject(new Error('slow')) : c.exec(args)), say: c.say });
  await q.start(running);
  await q.update(running); await q.update(running); await q.update(running);
  assert.equal(q.disabled, true);
  assert.equal(c.messages.filter((m) => /indisponível/.test(m)).length, 1);
});

test('publisher: a Planban that never answers cannot hold the end of the run past the flush deadline', async () => {
  const b = fakeBoard();
  const p = createPlanbanPublisher({ exec: () => new Promise(() => {}), say: b.say });
  p.start(running);
  const t0 = Date.now();
  await p.flush(150);
  assert.ok(Date.now() - t0 < 1500, 'flush returned at its deadline');
  assert.equal(p.disabled, true);
  assert.match(b.messages[0], /sem resposta/);
});

test('makeCliExec: runs the CLI with --cwd and -o json; a failing or hanging CLI rejects fast with a readable reason', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tlp-'));
  try {
    const cli = join(dir, 'fake-cli.mjs');
    writeFileSync(cli, `const a = process.argv.slice(2);
if (a[0] === 'hang') setTimeout(() => {}, 20000);
else if (a[0] === 'fail') { console.error('Card not found: x'); process.exit(1); }
else console.log(JSON.stringify(a));`);
    const exec = makeCliExec({ cli, cwd: 'C:/repo', timeoutMs: 10000 }); // generous: a loaded machine must not turn a healthy call into a timeout
    assert.deepEqual(JSON.parse(await exec(['get-card', 'x'])), ['get-card', 'x', '--cwd', 'C:/repo', '-o', 'json']);
    await assert.rejects(exec(['fail']), /Card not found: x/);
    const t0 = Date.now();
    await assert.rejects(makeCliExec({ cli, cwd: 'C:/repo', timeoutMs: 700 })(['hang']), /sem resposta/);
    assert.ok(Date.now() - t0 < 5000);
    await assert.rejects(makeCliExec({ cli: join(dir, 'missing.mjs'), cwd: 'C:/repo' })(['x']), /Cannot find module|missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
