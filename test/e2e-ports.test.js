import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickRunPorts, isFree, claimBlock, SPEC_PORT_MIN, SPEC_PORT_MAX } from '../scripts/e2e.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('a run uses offset 0 when the historical block is free, and a different free block when a leftover holds one of its ports', async () => {
  const free = await pickRunPorts({ free: async () => true, claim: () => () => {} });
  assert.equal(free.offset, 0);
  const busy = new Set([SPEC_PORT_MIN + 3]); // an orphan from an earlier run holds one port
  const moved = await pickRunPorts({ free: async (p) => !busy.has(p), random: () => 0.5, claim: () => () => {} });
  assert.ok(moved.offset > 0);
  for (let p = SPEC_PORT_MIN; p <= SPEC_PORT_MAX; p += 1) assert.ok(!busy.has(p + moved.offset));
  assert.ok(moved.vitePort > 0);
});

test('two runs started at the same instant do not receive the same block: the reservation is atomic and a dead holder is taken over', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-claim-'));
  try {
    const as = (pid) => (offset) => claimBlock(offset, { dir, pid, alive: () => true });
    const first = await pickRunPorts({ claim: as(101), free: async () => true, random: () => 0.3 });
    const second = await pickRunPorts({ claim: as(202), free: async () => true, random: () => 0.3 });
    assert.equal(first.offset, 0);
    assert.notEqual(second.offset, first.offset, 'the second run sees offset 0 reserved and moves on');
    first.release();
    assert.ok(claimBlock(0, { dir, pid: 77, alive: () => false }), 'released block is claimable again');
    const stale = claimBlock(5000, { dir, pid: 77, alive: () => true });
    assert.equal(claimBlock(5000, { dir, pid: 88, alive: () => true }), null, 'a live holder keeps it');
    assert.ok(claimBlock(5000, { dir, pid: 88, alive: () => false }), 'a dead holder is taken over');
    assert.equal(typeof stale, 'function');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('isFree tells a held port from a free one', async () => {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  assert.equal(await isFree(s.address().port), false);
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  assert.equal(await isFree(port), true);
});

test('no e2e spec hard-codes a server port or the Vite origin any more: they all derive from the run', () => {
  const offenders = [];
  for (const f of readdirSync(join(root, 'e2e')).filter((n) => n.endsWith('.spec.js'))) {
    const code = readFileSync(join(root, 'e2e', f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    if (/(?:SERVER_PORT|STUB_PORT|const port)\s*=\s*139\d\d/.test(code)) offenders.push(`${f}: literal port`);
    if (/['"`]http:\/\/localhost:5199/.test(code)) offenders.push(`${f}: literal Vite origin`);
  }
  assert.deepEqual(offenders, []);
});

test('with several workers the block covers every worker lane, and the lanes never overlap', async () => {
  const seen = [];
  const run = await pickRunPorts({ workers: 2, free: async (p) => { seen.push(p); return true; }, claim: () => () => {} });
  assert.equal(run.offset, 0);
  assert.ok(seen.includes(SPEC_PORT_MIN + 1000) && seen.includes(SPEC_PORT_MAX + 1000), 'worker 1 lane was checked');
  const busyLane1 = await pickRunPorts({ workers: 2, free: async (p) => p !== SPEC_PORT_MIN + 1005, random: () => 0.5, claim: () => () => {} });
  assert.ok(busyLane1.offset >= 2000 && busyLane1.offset % 2000 === 0, 'slot size is workers x 1000');
});
