#!/usr/bin/env node
// Self-test of e2e/support/wait-for-server.js (the one wait every E2E spec runs before using its real server). Proves the helper
// neither hides a real failure nor fails a slow start:
//   late server        -> resolves once /health/ready answers 200
//   503 forever        -> rejects; message has URL, limit, elapsed, attempts and the last HTTP status + body
//   nothing listening  -> rejects; message carries the connection error code
//   hung connection    -> rejects at the deadline (a half-open socket cannot eat the budget); message says no answer
//   --full             -> the DEFAULT budget really is ~30 s against a port that never opens (takes 30 s)
// Usage: node scripts/e2e-wait-for-server-selftest.mjs [--full]. Exit 0 only if every check holds.
import http from 'node:http';
import net from 'node:net';
import { waitForServerReady, SERVER_READY_TIMEOUT_MS, SERVER_READY_POLL_MS } from '../e2e/support/wait-for-server.js';

const failures = [];
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures.push(what); };

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
async function closedPort() {
  const probe = net.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
async function outcome(promise) {
  const startedAt = Date.now();
  try { await promise; return { ok: true, ms: Date.now() - startedAt }; } catch (err) { return { ok: false, ms: Date.now() - startedAt, message: err.message }; }
}

check(SERVER_READY_TIMEOUT_MS === 30_000 && SERVER_READY_POLL_MS === 250, 'defaults are 30 s budget, 250 ms polling');

// 1. late server
{
  const bootAt = Date.now() + 1200;
  const server = http.createServer((req, res) => { if (Date.now() < bootAt) { res.statusCode = 503; res.end('starting'); } else { res.statusCode = 200; res.end('ok'); } });
  const port = await listen(server);
  const r = await outcome(waitForServerReady(`http://127.0.0.1:${port}`, { label: 'selftest-late', timeoutMs: 5000 }));
  check(r.ok && r.ms >= 1000 && r.ms < 3000, `late server: resolved after ${r.ms} ms (expected 1.2 s boot)`);
  server.close();
}

// 2. 503 forever
{
  const server = http.createServer((req, res) => { res.statusCode = 503; res.end('{"status":"migrating"}'); });
  const port = await listen(server);
  const url = `http://127.0.0.1:${port}/health/ready`;
  const r = await outcome(waitForServerReady(`http://127.0.0.1:${port}`, { label: 'selftest-503', timeoutMs: 1500 }));
  check(!r.ok && r.ms >= 1450 && r.ms < 2500, `503 forever: rejected after ${r.ms} ms`);
  const waitedMs = r.message?.split('waited ')[1]?.split(' ms')[0] ?? '';
  const attempts = r.message?.split(' attempts')[0].split(' ').at(-1) ?? '';
  const isIntegerText = (value) => value.length > 0 && [...value].every((char) => char >= '0' && char <= '9');
  check(r.message?.includes(url) && r.message.includes('1500 ms') && isIntegerText(waitedMs) && isIntegerText(attempts), '503 forever: message has URL, limit, time waited and attempts');
  check(r.message?.includes('HTTP 503') && r.message.includes('migrating') && r.message.startsWith('selftest-503: real server did not become ready in time'), '503 forever: message has label and last HTTP status + body');
  console.log(`      ${r.message}`);
  server.close();
}

// 3. nothing listening
{
  const port = await closedPort();
  const r = await outcome(waitForServerReady(`http://127.0.0.1:${port}`, { label: 'selftest-refused', timeoutMs: 1000 }));
  check(!r.ok && r.ms >= 950 && r.ms < 2500, `nothing listening: rejected after ${r.ms} ms`);
  check(r.message?.includes('ECONNREFUSED') && r.message.includes(`http://127.0.0.1:${port}/health/ready`), 'nothing listening: message has the connection error code and URL');
  console.log(`      ${r.message}`);
}

// 4. hung connection (accepts, never answers)
{
  const server = http.createServer(() => { /* never respond */ });
  const port = await listen(server);
  const r = await outcome(waitForServerReady(`http://127.0.0.1:${port}`, { label: 'selftest-hung', timeoutMs: 1500 }));
  check(!r.ok && r.ms >= 1450 && r.ms < 3000, `hung connection: rejected after ${r.ms} ms (deadline holds)`);
  check(r.message?.includes('no answer within'), 'hung connection: message says the server gave no answer');
  console.log(`      ${r.message}`);
  server.closeAllConnections?.();
  server.close();
}

// 5. default budget, real wait
if (process.argv.includes('--full')) {
  const port = await closedPort();
  console.log('      waiting for the default 30 s budget on a port that never opens...');
  const r = await outcome(waitForServerReady(`http://127.0.0.1:${port}`, { label: 'selftest-default' }));
  check(!r.ok && r.ms >= 29_900 && r.ms < 32_000, `default budget: rejected after ${r.ms} ms (~30 s)`);
  check(r.message?.includes('30000 ms') && r.message.includes('ECONNREFUSED'), 'default budget: message names the 30000 ms limit and the last error');
  console.log(`      ${r.message}`);
}

if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nall wait-for-server checks passed');
