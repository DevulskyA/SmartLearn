import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Test selection, supervision, cleanup and resource control must stay deterministic: no model calls, no delegation, no network, no polling of an agent.
const FILES = ['process-supervisor.mjs', 'job-run.ps1', 'e2e-impact.mjs', 'e2e.mjs', 'e2e-global.mjs'];
const read = (f) => readFileSync(fileURLToPath(new URL(`../scripts/${f}`, import.meta.url)), 'utf8');
const code = (f) => read(f).split(/\r?\n/).filter((l) => !/^\s*(\/\/|#)/.test(l)).join('\n');

test('infra scripts import no network, AI or agent modules and make no network calls', () => {
  const forbidden = /from ['"](node:)?(https?|dgram|tls|http2)['"]|@anthropic|openai|\bfetch\(|XMLHttpRequest|Invoke-WebRequest|Invoke-RestMethod|\bcurl\b|WebClient/i;
  for (const f of FILES) assert.doesNotMatch(code(f), forbidden, f);
});

test('infra scripts only start known local tools (node, git, PowerShell, taskkill), never a model CLI or an agent', () => {
  const agentCli = /['"`](claude|codex|gemini|ollama)(\.exe|\.cmd)?['"`]|spawn\(\s*['"`](claude|codex)/i;
  for (const f of FILES) assert.doesNotMatch(code(f), agentCli, f);
  assert.doesNotMatch(code('process-supervisor.mjs'), /\/IM\b|Stop-Process\s+-Name|taskkill[^\n]*\.exe['"`]?\s*,\s*\[\s*['"`]\/IM/i, 'never end processes by image name');
});

test('the supervisor waits on process handles, not on timers that poll anything', () => {
  assert.doesNotMatch(code('process-supervisor.mjs'), /setInterval/);
  assert.match(read('job-run.ps1'), /WaitForMultipleObjects|WaitAny|WaitForSingleObject/);
});
