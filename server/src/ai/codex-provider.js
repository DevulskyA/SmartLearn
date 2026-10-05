// REALMODEL-1 via CODEX: sibling of openai-provider.js / anthropic-provider.js with the SAME adapter contract
// (generateDraft / auditDraftWithModel / repairDraftWithModel) and the same guarantees: only reachable through
// generated-drafts.js selectProvider (explicit consent), source text is sent as explicitly untrusted data, the raw
// result is validated by the exact same draft-schema.js as every other provider, and there is NO silent fallback —
// a missing or unauthenticated Codex is an explicit error, never fake/other-provider content.
//
// The difference is transport and credentials: instead of an API key, this runs the Codex CLI the operator already
// logged in with their ChatGPT account (`codex login status`). SmartLearn never reads, copies or forwards Codex's
// tokens; authentication stays the executable's own business.
//
// Codex is used here as PURE INFERENCE. The model gets an empty temporary directory as its working root, a read-only
// sandbox, no shell/apps/browser/computer/image tools, a minimal environment (no project secrets), the prompt on
// stdin (never in argv), and a JSON Schema for its final message. Nothing it says is executed beyond JSON.parse.
// `--dangerously-bypass-approvals-and-sandbox` is never used.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, extname, join } from 'node:path';
import { buildAuditPrompt, buildRepairPrompt, parseModelAudit } from './draft-audit-model.js';
import { buildDraftPrompt } from './draft-prompt.js';
import { ProviderRequestError } from './anthropic-provider.js';

export const CODEX_PROVIDER_NAME = 'CODEX';
export const CODEX_DEFAULT_COMMAND = 'codex';
export const CODEX_DEFAULT_TIMEOUT_MS = 240_000;
export const CODEX_DEFAULT_REASONING_EFFORT = 'high';
const LOGIN_CHECK_TIMEOUT_MS = 20_000;
const MAX_CAPTURED_BYTES = 64 * 1024;

// Bounded on purpose, per draft: 1 generation + 1 audit + at most 1 repair. Never an open loop.
export const CODEX_CALL_LIMITS = Object.freeze({ generate: 1, audit: 1, repair: 1 });

// Tools the model must not have: this provider is inference only.
const DISABLED_FEATURES = ['shell_tool', 'apps', 'browser_use', 'computer_use', 'image_generation'];

// Only what the Codex executable needs to start and find its own login. Project/server secrets never ride along.
const ENV_ALLOWLIST = [
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'COMSPEC', 'windir', 'OS',
  'USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'APPDATA', 'LOCALAPPDATA', 'ProgramData',
  'ProgramFiles', 'ProgramFiles(x86)', 'CODEX_HOME', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
];

function minimalEnv(source = process.env) {
  const env = {};
  for (const name of ENV_ALLOWLIST) if (source[name] !== undefined) env[name] = source[name];
  return env;
}

// ---- JSON Schemas for `--output-schema` (the exact shapes draft-schema.js / draft-audit-model.js already define) ----
const SPAN = { type: 'object', properties: { pageIndex: { type: 'integer' } }, required: ['pageIndex'], additionalProperties: false };
const nullable = (type) => ({ type: [type, 'null'] });

export const DRAFT_JSON_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    summary: { type: 'string' },
    summarySourceSpans: { type: 'array', items: SPAN },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          questionType: { type: ['string', 'null'], enum: ['RECALL', 'CONCEPT', 'MECHANISM', 'APPLICATION', 'DISCRIMINATION', 'CLINICAL_REASONING', 'TRANSFER', null] },
          answer: { type: 'string' },
          explanation: nullable('string'),
          hint: nullable('string'),
          sourceSpans: { type: 'array', items: SPAN },
        },
        required: ['question', 'questionType', 'answer', 'explanation', 'hint', 'sourceSpans'],
        additionalProperties: false,
      },
    },
    modelVersion: { type: 'string' },
    promptVersion: { type: 'string' },
    language: { type: 'string' },
  },
  required: ['summary', 'summarySourceSpans', 'questions', 'modelVersion', 'promptVersion', 'language'],
  additionalProperties: false,
});

export const AUDIT_JSON_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    result: { type: 'string', enum: ['PASS', 'REPAIR'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          issue: { type: 'string' },
          severity: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          scope: { type: 'string' },
          generatedClaim: { type: 'string' },
          sourceEvidence: { type: 'string' },
          repair: { type: 'string' },
        },
        required: ['issue', 'severity', 'scope', 'generatedClaim', 'sourceEvidence', 'repair'],
        additionalProperties: false,
      },
    },
  },
  required: ['result', 'findings'],
  additionalProperties: false,
});

const INFERENCE_ONLY_PREAMBLE = [
  'You are being used as a pure text-generation function. Do NOT run commands, read or write files, browse, or use any tool.',
  'Your final message must be exactly the single JSON object described below and nothing else.',
  '',
].join('\n');

// ---- locating the executable without a shell ----
/**
 * `shell: false` cannot run an npm `.cmd` shim on Windows, so resolve what the shim actually runs.
 * @returns {{file: string, prefix: string[]}} the executable and the arguments that must precede Codex's own.
 */
export function resolveCodexInvocation(command = CODEX_DEFAULT_COMMAND, { platform = process.platform, env = process.env, exists = existsSync } = {}) {
  const asNodeScript = (script) => ({ file: process.execPath, prefix: [script] });
  const ext = extname(command).toLowerCase();
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return asNodeScript(command);
  if (platform !== 'win32') return { file: command, prefix: [] };

  const hasDir = /[\\/]/.test(command);
  const dirs = hasDir ? [dirname(command)] : String(env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean);
  const base = hasDir ? command.replace(/^.*[\\/]/, '').replace(/\.(cmd|exe|bat|ps1)$/i, '') : command.replace(/\.(cmd|exe|bat|ps1)$/i, '');
  for (const dir of dirs) {
    const exe = join(dir, `${base}.exe`);
    if (exists(exe)) return { file: exe, prefix: [] };
    const shim = join(dir, `${base}.cmd`);
    if (exists(shim)) {
      const script = join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (exists(script)) return asNodeScript(script);
    }
  }
  return { file: command, prefix: [] }; // let spawn report ENOENT -> CODEX_NOT_FOUND
}

/**
 * Terminates a child AND everything it started. On Windows `taskkill /T /F` walks the tree (Codex's launcher starts a native
 * child, so a plain kill() would leave it running). Elsewhere the child leads its own process group (see runProcess) and the
 * whole group is killed. `spawnImpl` is injectable so a test can observe the call.
 */
export function killProcessTree(child, { platform = process.platform, spawnImpl = spawn } = {}) {
  try {
    if (platform === 'win32' && child.pid) {
      spawnImpl('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: false, windowsHide: true });
    } else if (child.pid) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    } else {
      child.kill('SIGKILL');
    }
  } catch { /* already gone */ }
}
const killTree = killProcessTree;

/**
 * Runs the executable, feeds `stdin`, returns {code, stdout, stderr}. shell=false, bounded output, real timeout.
 * Rejects with ProviderRequestError(CODEX_NOT_FOUND | TIMEOUT | CANCELLED | PROVIDER_ERROR). Never echoes the prompt.
 * `signal` (T-F3-02): aborting it kills the whole process tree and rejects CANCELLED once the process has really exited.
 * `onProcess(pid)` and `onActivity()` (T-F3-03) are signs of life for the job runner: the child's pid (so its CPU can be sampled)
 * and every chunk it writes (the `codex exec` events).
 */
function runProcess({ file, args, cwd, stdin, timeoutMs, spawnImpl = spawn, env, signal = null, onProcess = null, onActivity = null }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(file, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true, detached: process.platform !== 'win32' });
    } catch (err) {
      reject(err?.code === 'ENOENT'
        ? new ProviderRequestError('CODEX_NOT_FOUND', 'O executável do Codex não foi encontrado. Instale o Codex CLI ou ajuste SMARTLEARN_CODEX_COMMAND.')
        : new ProviderRequestError('PROVIDER_ERROR', 'Não foi possível iniciar o Codex.'));
      return;
    }

    try { if (child.pid) onProcess?.(child.pid); } catch { /* an observer never breaks the call */ }
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let hardTimer = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(hardTimer);
      signal?.removeEventListener('abort', onAbort);
      fn(value);
    };
    const timeoutError = () => new ProviderRequestError('TIMEOUT', 'Tempo limite excedido ao executar o Codex.');
    const abortError = () => new ProviderRequestError('CANCELLED', 'A geração foi interrompida; o processo do Codex foi encerrado.');
    function onAbort() {
      if (aborted || timedOut || settled) return;
      aborted = true;
      killTree(child);
      // Same rule as the timeout: report only once the process has really exited, bounded by the hard timer.
      hardTimer = setTimeout(() => finish(reject, abortError()), 5_000);
    }
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      // Report the timeout only once the process has really exited: on Windows a process that is still dying keeps its
      // working directory locked, and the caller is about to delete it. The hard timer bounds the wait.
      hardTimer = setTimeout(() => finish(reject, timeoutError()), 5_000);
    }, timeoutMs);

    const capture = (current, chunk) => (current.length >= MAX_CAPTURED_BYTES ? current : (current + chunk).slice(0, MAX_CAPTURED_BYTES));
    const alive = () => { try { onActivity?.(); } catch { /* an observer never breaks the call */ } };
    child.stdout?.on('data', (chunk) => { alive(); stdout = capture(stdout, String(chunk)); });
    child.stderr?.on('data', (chunk) => { alive(); stderr = capture(stderr, String(chunk)); });
    child.on('error', (err) => {
      finish(reject, err?.code === 'ENOENT'
        ? new ProviderRequestError('CODEX_NOT_FOUND', 'O executável do Codex não foi encontrado. Instale o Codex CLI ou ajuste SMARTLEARN_CODEX_COMMAND.')
        : new ProviderRequestError('PROVIDER_ERROR', 'Falha ao executar o Codex.'));
    });
    child.on('close', (code) => {
      if (timedOut) finish(reject, timeoutError());
      else if (aborted) finish(reject, abortError());
      else finish(resolve, { code, stdout, stderr });
    });
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    // The prompt travels on stdin, so it never appears in argv (process lists) and needs no shell quoting.
    child.stdin?.on('error', () => { /* the child exited early; its exit code tells the story */ });
    try { child.stdin?.end(stdin ?? ''); } catch { /* same */ }
  });
}

const NOT_AUTHENTICATED = new ProviderRequestError('CODEX_NOT_AUTHENTICATED', 'O Codex não está autenticado. Faça login no Codex CLI (codex login) com a conta ChatGPT e tente de novo. Nenhum conteúdo substituto foi gerado.');
// Only stderr is inspected: stdout carries the model's own text, which must never steer error classification.
const looksUnauthenticated = (stderr) => /not (logged|signed) in|log ?in required|please (log ?in|sign ?in)|unauthori[sz]ed/i.test(stderr);

/** `codex login status` — a local check, no model call. Memoized per provider instance. */
export function ensureCodexReady(options = {}, { signal = null } = {}) {
  const state = options.state ?? (options.state = {});
  if (!state.ready) {
    state.ready = (async () => {
      const { file, prefix } = resolveCodexInvocation(options.command);
      const result = await runProcess({
        file, args: [...prefix, 'login', 'status'], cwd: tmpdir(), stdin: '', timeoutMs: LOGIN_CHECK_TIMEOUT_MS,
        spawnImpl: options.spawnImpl, env: minimalEnv(options.env), signal,
      });
      if (result.code !== 0 || !/logged in/i.test(`${result.stdout}\n${result.stderr}`)) throw NOT_AUTHENTICATED;
    })();
    state.ready.catch(() => { state.ready = null; }); // a failed check is re-evaluated next time, never cached as success
  }
  return state.ready;
}

/**
 * One model call: prompt in, parsed JSON out. Shared by generation, audit and repair.
 * @param {'generate'|'audit'|'repair'} kind used only for the per-draft call limit
 */
export async function callCodex(prompt, schema, kind, options = {}, { signal = null, onProcess = null, onActivity = null } = {}) {
  const state = options.state ?? (options.state = {});
  state.calls ??= { generate: 0, audit: 0, repair: 0 };
  if (state.calls[kind] >= CODEX_CALL_LIMITS[kind]) {
    throw new ProviderRequestError('CALL_LIMIT_EXCEEDED', `Limite de chamadas ao Codex por rascunho excedido (${kind}).`);
  }
  state.calls[kind] += 1;

  await ensureCodexReady(options, { signal });
  if (signal?.aborted) throw new ProviderRequestError('CANCELLED', 'A geração foi interrompida antes da chamada ao Codex.');

  const timeoutMs = options.timeoutMs ?? CODEX_DEFAULT_TIMEOUT_MS;
  const dir = mkdtempSync(join(tmpdir(), 'sl-codex-'));
  try {
    const schemaPath = join(dir, 'schema.json');
    const outPath = join(dir, 'last-message.json');
    writeFileSync(schemaPath, JSON.stringify(schema));

    const { file, prefix } = resolveCodexInvocation(options.command);
    const args = [
      ...prefix, 'exec',
      '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
      '-s', 'read-only',
      ...DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
      '-c', `model_reasoning_effort="${options.reasoningEffort ?? CODEX_DEFAULT_REASONING_EFFORT}"`,
      ...(options.model ? ['-m', options.model] : []),
      '--output-schema', schemaPath,
      '-o', outPath,
      '-C', dir,
      '-', // prompt from stdin
    ];

    const result = await runProcess({
      file, args, cwd: dir, stdin: `${INFERENCE_ONLY_PREAMBLE}${prompt}`, timeoutMs,
      spawnImpl: options.spawnImpl, env: minimalEnv(options.env), signal, onProcess, onActivity,
    });
    if (result.code !== 0) {
      if (looksUnauthenticated(result.stderr)) throw NOT_AUTHENTICATED;
      throw new ProviderRequestError('PROVIDER_ERROR', `O Codex terminou com erro (código ${result.code}).`);
    }

    let text;
    try { text = readFileSync(outPath, 'utf8'); } catch {
      throw new ProviderRequestError('PROVIDER_ERROR', 'O Codex não devolveu a mensagem final.');
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new ProviderRequestError('PROVIDER_ERROR', 'Resposta do Codex não é um JSON válido.');
    }
  } finally {
    // Best effort: a cleanup problem must never replace the real outcome (a TIMEOUT or a provider error).
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* temp dir is outside the repo and the OS reclaims it */ }
  }
}

/** Provider-owned metadata is not the model's to write. */
const versionOf = (options) => `codex:${options.model || 'default'}`;

/** @returns {Promise<object>} the RAW parsed JSON, validated afterwards by draft-schema.js like every provider. */
export async function generateDraft({ segments, promptVersion, generationLocale, signal, onProcess, onActivity }, options = {}) {
  const raw = await callCodex(buildDraftPrompt(segments, promptVersion, { generationLocale }), DRAFT_JSON_SCHEMA, 'generate', options, { signal, onProcess, onActivity });
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw, modelVersion: versionOf(options), promptVersion } : raw;
}

export async function auditDraftWithModel({ draft, segments, signal, onProcess, onActivity }, options = {}) {
  const raw = await callCodex(buildAuditPrompt(draft, segments), AUDIT_JSON_SCHEMA, 'audit', options, { signal, onProcess, onActivity });
  return parseModelAudit(raw, { questionCount: draft.questions.length });
}

export function repairDraftWithModel({ draft, findings, segments, promptVersion, signal, onProcess, onActivity }, options = {}) {
  return callCodex(buildRepairPrompt(draft, findings, segments, promptVersion), DRAFT_JSON_SCHEMA, 'repair', options, { signal, onProcess, onActivity });
}
