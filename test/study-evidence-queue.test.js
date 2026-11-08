import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudyEvidenceQueue } from '../src/study-evidence-queue.js';

function setup(send, { scope = 'api/alice', data = new Map(), shouldPersist, isRejected, onRejected } = {}) {
  let active = scope;
  const storage = { get length() { return data.size; }, key: (index) => [...data.keys()][index] ?? null, getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  return { queue: createStudyEvidenceQueue({ getScope: () => active, storage, send, shouldPersist, isRejected, onRejected }), switchTo: (value) => { active = value; }, data };
}

test('failed evidence survives the next block and reload with its original payload and key', async () => {
  const first = { unitId: 1, operationKey: 'first', questionsCount: 2, correctCount: 1 };
  const second = { unitId: 2, operationKey: 'second', questionsCount: 1, correctCount: 1 };
  const before = setup(async () => { throw new Error('offline'); });
  before.queue.enqueue(first);
  await assert.rejects(before.queue.flush(), /offline/);
  before.queue.enqueue(second);
  const sent = [];
  const after = setup(async (evidence) => sent.push(evidence), { data: before.data });
  assert.equal(after.queue.pendingCount(), 2);
  await after.queue.flush();
  assert.deepEqual(sent, [first, second]);
  assert.equal(after.queue.pendingCount(), 0);
  assert.equal(after.data.size, 0);
});

test('concurrent retries send once, and an old response cannot erase a newly queued block', async () => {
  let acknowledge;
  const sent = [];
  const { queue } = setup(async (item) => {
    sent.push(item.operationKey);
    if (item.operationKey === 'old') await new Promise((resolve) => { acknowledge = resolve; });
  });
  queue.enqueue({ operationKey: 'old' });
  const first = queue.flush();
  const retry = queue.flush();
  queue.enqueue({ operationKey: 'new' });
  acknowledge();
  await Promise.all([first, retry]);
  assert.deepEqual(sent, ['old', 'new']);
  assert.equal(queue.pendingCount(), 0);
});

test('a lost reply retains the same key; replay acknowledges only the already stored fact', async () => {
  const recorded = new Set();
  let lost = true;
  const { queue } = setup(async (item) => {
    recorded.add(item.operationKey);
    if (lost) { lost = false; throw new Error('reply lost'); }
  });
  queue.enqueue({ operationKey: 'same-intent' });
  await assert.rejects(queue.flush(), /reply lost/);
  assert.equal(queue.pendingCount(), 1);
  await queue.flush();
  assert.equal(recorded.size, 1);
  assert.equal(queue.pendingCount(), 0);
});

test('account/API switches never send the previous owner\'s queued evidence as the next owner', async () => {
  let acknowledge;
  const sent = [];
  const state = setup(async (item) => {
    sent.push(item.operationKey);
    if (item.operationKey === 'alice-1') await new Promise((resolve) => { acknowledge = resolve; });
  });
  state.queue.enqueue({ operationKey: 'alice-1' });
  state.queue.enqueue({ operationKey: 'alice-2' });
  const first = state.queue.flush();
  state.switchTo(null);
  assert.equal(state.queue.pendingCount(), 0);
  await state.queue.flush();
  state.switchTo('api/bob');
  state.queue.enqueue({ operationKey: 'bob-1' });
  await state.queue.flush();
  acknowledge();
  await first;
  assert.deepEqual(sent, ['alice-1', 'bob-1']);
  state.switchTo('api/alice');
  assert.equal(state.queue.pendingCount(), 1);
  await state.queue.flush();
  state.switchTo('other-api/alice');
  assert.equal(state.queue.pendingCount(), 0);
  assert.deepEqual(sent, ['alice-1', 'bob-1', 'alice-2']);
});

test('two windows retain both failed results across reload instead of overwriting a queue snapshot', async () => {
  const data = new Map();
  const offline = async () => { throw new Error('offline'); };
  const first = setup(offline, { data });
  const second = setup(offline, { data });
  assert.equal(first.queue.pendingCount(), 0);
  assert.equal(second.queue.pendingCount(), 0);
  first.queue.enqueue({ operationKey: 'window-a', unitId: 1 });
  await assert.rejects(first.queue.flush(), /offline/);
  second.queue.enqueue({ operationKey: 'window-b', unitId: 2 });
  await assert.rejects(second.queue.flush(), /offline/);
  const sent = [];
  const reloaded = setup(async (item) => sent.push(item), { data });
  await reloaded.queue.flush();
  assert.deepEqual(sent.map((item) => item.operationKey).sort(), ['window-a', 'window-b']);
  assert.equal(reloaded.queue.pendingCount(), 0);
  assert.equal(data.size, 0);
});

test('a delayed acknowledgement removes only its intent and preserves another window\'s pending result', async () => {
  const data = new Map();
  let acknowledge;
  const first = setup(async () => new Promise((resolve) => { acknowledge = resolve; }), { data });
  const second = setup(async () => { throw new Error('offline'); }, { data });
  first.queue.enqueue({ operationKey: 'acknowledged', unitId: 1 });
  const sending = first.queue.flush();
  second.queue.enqueue({ operationKey: 'still-pending', unitId: 2 });
  acknowledge();
  // This sender must stop after its acknowledgement rather than hanging on the second window's item.
  first.switchTo(null);
  await sending;
  const sent = [];
  const reloaded = setup(async (item) => sent.push(item.operationKey), { data });
  await reloaded.queue.flush();
  assert.deepEqual(sent, ['still-pending']);
});

test('review intents can remain in memory without gaining a durable replay lifecycle', async () => {
  const state = setup(async () => {}, { shouldPersist: (item) => item.context === 'INITIAL_PRACTICE' });
  state.queue.enqueue({ operationKey: 'practice', context: 'INITIAL_PRACTICE' });
  state.queue.enqueue({ reviewTaskId: 2 });
  assert.equal(state.queue.pendingCount(), 2);
  assert.equal(state.data.size, 1);
  const sent = [];
  await setup(async (item) => sent.push(item), { data: state.data }).queue.flush();
  assert.deepEqual(sent, [{ operationKey: 'practice', context: 'INITIAL_PRACTICE' }]);
});

test('a slow send of an old block does not make the flush of a newer block wait for it', async () => {
  let release;
  const sent = [];
  const { queue } = setup(async (item) => {
    sent.push(item.operationKey);
    if (item.operationKey === 'slow') await new Promise((resolve) => { release = resolve; });
  });
  queue.enqueue({ operationKey: 'slow' });
  const slow = queue.flush();
  queue.enqueue({ operationKey: 'fast' });
  await queue.flush(); // resolves while 'slow' is still unanswered
  assert.deepEqual(sent, ['slow', 'fast']);
  assert.equal(queue.pendingCount(), 1);
  release();
  await slow;
  assert.equal(queue.pendingCount(), 0);
});

test('an item that keeps failing does not hide the ones behind it, and the failure is still reported', async () => {
  const sent = [];
  const { queue } = setup(async (item) => {
    if (item.operationKey === 'bad') throw new Error('rejected');
    sent.push(item.operationKey);
  });
  queue.enqueue({ operationKey: 'bad' });
  queue.enqueue({ operationKey: 'good' });
  await assert.rejects(queue.flush(), /rejected/);
  assert.deepEqual(sent, ['good']);
  assert.equal(queue.pendingCount(), 1);
});

test('an item the server says can never be applied leaves the queue (and storage) once, is reported, and does not hide the ones behind it', async () => {
  const sent = [];
  const rejected = [];
  const { queue, data } = setup(async (item) => {
    if (item.operationKey === 'stale') { const error = new Error('conflict'); error.rejected = true; throw error; }
    sent.push(item.operationKey);
  }, { isRejected: (error) => error.rejected === true, onRejected: (item) => rejected.push(item.operationKey) });
  queue.enqueue({ operationKey: 'stale', context: 'INITIAL_PRACTICE' });
  queue.enqueue({ operationKey: 'fine', context: 'INITIAL_PRACTICE' });
  await queue.flush(); // does not throw: nothing here is worth another try
  assert.deepEqual(rejected, ['stale']);
  assert.deepEqual(sent, ['fine']);
  assert.equal(queue.pendingCount(), 0);
  assert.equal(data.size, 0, 'nothing is left in storage to be sent again after a reload');
});

test('an error that is not a rejection (network, server error) keeps the item queued', async () => {
  const { queue } = setup(async () => { throw new Error('offline'); }, { isRejected: () => false });
  queue.enqueue({ operationKey: 'keep' });
  await assert.rejects(queue.flush(), /offline/);
  assert.equal(queue.pendingCount(), 1);
});
