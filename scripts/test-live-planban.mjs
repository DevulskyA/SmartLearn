// Publishes a test-live run to the Planban board as ONE card per suite ("[Rodando] ..." while it runs, "[Terminou] ..." when it ends),
// through the installed Planban CLI (the documented fallback in .planban/agent-context.md), with no hook and no second source of truth:
// the card is a derived view of the artifact that scripts/test-live.mjs already writes (counts, exit code, head, duration).
//
// BEST EFFORT BY DESIGN: every CLI call has a short timeout and a failure turns publishing off for the rest of the run with ONE clear
// message. The test run itself never waits on, depends on, or fails because of Planban (the only wait is a bounded flush at the very end).
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fmtDuration } from './test-live-core.mjs';

export const RUN_TAG = 'test-live-run';
/** The card of one suite is found by this tag, so every worktree reuses the same card instead of piling up new ones. */
export const suiteTag = (suite) => `${RUN_TAG}-${suite}`;

const CALL_TIMEOUT_MS = 6000; // a healthy CLI call takes ~0.8 s
const FLUSH_DEADLINE_MS = 12000; // upper bound for the wait at the end of the run
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour12: false }) : '—');
const clip = (text, n) => (String(text).length > n ? `${String(text).slice(0, n - 1)}…` : String(text));

/**
 * Where the Planban CLI lives. PLANBAN_CLI wins; otherwise the Claude marketplace checkout registered in known_marketplaces.json, then the
 * conventional locations. Returns null when none exists (publishing is then skipped with a message, never an error).
 */
export function findPlanbanCli({ env = process.env, home = homedir(), exists = existsSync, readText = (p) => readFileSync(p, 'utf8') } = {}) {
  const candidates = [];
  if (env.PLANBAN_CLI) candidates.push(env.PLANBAN_CLI);
  const claudeHome = env.CLAUDE_CONFIG_DIR || join(home, '.claude');
  try {
    const registered = JSON.parse(readText(join(claudeHome, 'plugins', 'known_marketplaces.json')))?.planban?.installLocation;
    if (registered) candidates.push(join(registered, 'bin', 'planban.mjs'));
  } catch { /* registry missing or unreadable: fall through to the conventional paths */ }
  candidates.push(join(claudeHome, 'plugins', 'marketplaces', 'planban', 'bin', 'planban.mjs'));
  candidates.push(join(env.CODEX_HOME || join(home, '.codex'), '.tmp', 'marketplaces', 'planban', 'bin', 'planban.mjs'));
  return candidates.find((p) => exists(p)) ?? null;
}

/**
 * What the card must say, derived only from the test-live artifact. Pure.
 * RUNNING -> "[Rodando]" in In Progress. Anything else -> "[Terminou]" in Pending: "Complete" belongs to the person
 * (Planban protocol), so a finished run is never auto-completed, it just leaves the In Progress column.
 */
export function formatCard(artifact, { now = Date.now(), root = null } = {}) {
  const running = artifact.state === 'RUNNING';
  const c = artifact.counts ?? {};
  const counts = `${c.done ?? 0}/${c.total ?? '?'} feitos · ${c.passed ?? 0} ok · ${c.failed ?? 0} falhas · ${c.skipped ?? 0} pulados`;
  const duration = fmtDuration(running ? now - Date.parse(artifact.startedAt) : artifact.durationMs);
  const head = String(artifact.headTested ?? '').slice(0, 7) || '?';
  const where = root ? ` Worktree: ${root}.` : '';
  if (running) {
    return {
      title: `[Rodando] test-live ${artifact.suite}`,
      status: 'in-progress',
      summary: `Suíte ${artifact.suite} em execução. ${counts} · ${duration}. HEAD ${head}.${where}${artifact.lastTest ? ` Último: ${clip(artifact.lastTest, 90)}.` : ''} Contagem das ${clock(new Date(now).toISOString())}.`,
      nextAction: 'Aguardar o término. Este cartão é atualizado sozinho pelo scripts/test-live.mjs; não editar à mão.',
    };
  }
  const exit = artifact.exitCode == null ? '' : ` (exit ${artifact.exitCode})`;
  const nextAction = {
    PASS: 'Nenhuma ação: resultado registrado. A próxima execução do test-live reaproveita este cartão.',
    FAIL: `Ver o log e corrigir as falhas antes de integrar.${artifact.log ? ` Log: ${artifact.log}` : ''}`,
  }[artifact.state] ?? 'Execução interrompida sem resultado: rodar o test-live de novo.';
  return {
    title: `[Terminou] test-live ${artifact.suite} · ${artifact.state}`,
    status: 'pending',
    summary: `Suíte ${artifact.suite} terminou: ${artifact.state}${exit}. ${counts} · ${duration}. HEAD ${head}.${where} Início ${clock(artifact.startedAt)}, fim ${clock(artifact.updatedAt)}.`,
    nextAction,
  };
}

/** Real executor: runs the Planban CLI and resolves with its stdout, or rejects (timeout included). Never throws synchronously. */
export function makeCliExec({ cli, cwd, timeoutMs = CALL_TIMEOUT_MS }) {
  return (args) => new Promise((resolve, reject) => {
    execFile(process.execPath, [cli, ...args, '--cwd', cwd, '-o', 'json'], { timeout: timeoutMs, windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        // the Planban CLI prints one plain line ("Card not found: x"); a Node crash prints a stack, so prefer the line that names the error
        const lines = String(stderr).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const named = lines.find((l) => /^\w*Error\b|not found|cannot /i.test(l)) ?? lines[0] ?? err.message;
        reject(new Error(err.killed ? `sem resposta em ${Math.round(timeoutMs / 1000)}s` : clip(named, 160)));
      } else resolve(stdout);
    });
  });
}

const cardIdOf = (json) => json?.id ?? json?.card?.id ?? json?.item?.id ?? null;

/**
 * The run's publisher. `exec(args)` -> Promise<stdout> (rejects on failure). Calls are serialized (the board takes one mutation at a time),
 * periodic updates are dropped while one is still pending, and the first failure switches publishing off for the rest of the run.
 */
export function createPlanbanPublisher({ exec, root = null, say = (m) => console.error(m), now = Date.now }) {
  let cardId = null;
  let disabled = false;
  let pending = 0; // calls queued or running
  let chain = Promise.resolve();

  const off = (why) => {
    if (disabled) return;
    disabled = true;
    say(`[test-live] Planban indisponível (${why}); o teste segue sem publicar o cartão.`);
  };
  const enqueue = (fn) => {
    pending += 1;
    chain = chain.then(() => (disabled ? undefined : fn())).catch((e) => off(e.message)).finally(() => { pending -= 1; });
    return chain;
  };
  const fields = (card) => ['--title', card.title, '--summary', card.summary, '--next-action', card.nextAction];

  return {
    get cardId() { return cardId; },
    get disabled() { return disabled; },
    /** Finds this suite's card by tag and re-opens it, or creates it. */
    start(artifact) {
      return enqueue(async () => {
        const card = formatCard(artifact, { now: now(), root });
        const tag = suiteTag(artifact.suite);
        const found = JSON.parse(await exec(['query-cards', '--tag', tag])).matches?.[0]?.item;
        if (found) {
          cardId = found.id;
          await exec(['update-card', cardId, ...fields(card)]);
          if (found.status !== card.status) await exec(['move-card', cardId, '--status', card.status, '--first']);
        } else {
          cardId = cardIdOf(JSON.parse(await exec(['create-card', card.title, '--status', card.status, '--summary', card.summary, '--next-action', card.nextAction, '--tag', RUN_TAG, '--tag', tag, '--position', 'top'])));
          if (!cardId) throw new Error('o Planban não devolveu o id do cartão criado');
        }
        say(`[test-live] Planban: cartão ${cardId} publicado como "${card.title}".`);
      });
    },
    /** Counts refresh; skipped when a previous call is still pending or the card does not exist yet. */
    update(artifact) {
      if (pending > 0 || disabled || !cardId) return chain;
      return enqueue(async () => {
        await exec(['update-card', cardId, '--summary', formatCard(artifact, { now: now(), root }).summary]);
      });
    },
    /** Final state: title, summary and next action, then out of In Progress. */
    finish(artifact) {
      return enqueue(async () => {
        if (!cardId) return;
        const card = formatCard(artifact, { now: now(), root });
        await exec(['update-card', cardId, ...fields(card)]);
        await exec(['move-card', cardId, '--status', card.status, '--first']);
        say(`[test-live] Planban: cartão ${cardId} fechado como "${card.title}" (${card.status}).`);
      });
    },
    /** Waits for pending calls, but never longer than the deadline: the end of a test run must not hang on the board. */
    flush(deadlineMs = FLUSH_DEADLINE_MS) {
      let timer;
      const give = new Promise((resolve) => { timer = setTimeout(() => { off(`sem resposta ${Math.round(deadlineMs / 1000)}s após o fim do teste`); resolve(); }, deadlineMs); });
      return Promise.race([chain, give]).finally(() => clearTimeout(timer));
    },
  };
}
