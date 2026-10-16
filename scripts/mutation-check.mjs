// T-F6-04 (AC-07.3, F-45): repeatable discrimination sensor. It applies one BEHAVIOR mutation at a time to a THROWAWAY git
// worktree (never to the real tree) and requires the relevant tests to go red. A mutation that no test kills is a hole in the
// safety net: the report says so and the exit code is non-zero.
//
//   node scripts/mutation-check.mjs                 -> every mutation, report in test-results/mutation-report.json
//   node scripts/mutation-check.mjs --only M2,M5    -> a subset
//   node scripts/mutation-check.mjs --list          -> the catalog, nothing is run
//
// Safety: the worktree is created under the OS temp dir from HEAD, carries a marker file, and every write goes through
// assertDisposableWorktree(). The real repository, its uncommitted work and the human DEV datastore are never read for writing.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '..');
export const MARKER_FILE = '.smartlearn-mutation-worktree';
const MARKER_TEXT = 'disposable worktree created by scripts/mutation-check.mjs; safe to delete\n';

/**
 * One mutation = one exact-once textual change that reintroduces a plausible bug, and the tests that must notice.
 * `tests` are paths relative to `cwd` (a directory inside the worktree). `find` must occur EXACTLY once in `file`.
 */
export const MUTATIONS = [
  {
    id: 'M1a', area: 'identidade de questão (por posição)',
    why: 'editar uma questão passaria a herdar id/status/versão da PRIMEIRA questão em vez da questão pedida por id',
    file: 'server/src/services/generated-drafts.js',
    find: 'const previous = current.questions[index];', replace: 'const previous = current.questions[0];',
    cwd: 'server', tests: ['test/lesson-granular-edit.test.js', 'test/lesson-provenance.test.js'],
  },
  {
    id: 'M1b', area: 'identidade de questão (mergeIdentity)',
    why: 'mergeIdentity descartaria o estado de revisão: uma questão REJECTED voltaria como PROPOSED ao ser editada',
    file: 'server/src/services/generated-drafts.js',
    find: "status: previous?.status ?? 'PROPOSED',", replace: "status: 'PROPOSED',",
    cwd: 'server', tests: ['test/lesson-granular-edit.test.js', 'test/ai-drafts.test.js'],
  },
  {
    id: 'M2', area: 'sessão (devPersistent)',
    why: 'a flag de sessão persistente DEV seria ignorada: a política voltaria sempre à de produção',
    file: 'server/src/auth/session-tokens.js',
    find: 'if (!devPersistent) return {', replace: 'if (true) return {',
    cwd: 'server', tests: ['test/dev-persistent-session.test.js'],
  },
  {
    id: 'M3', area: 'rejeição no aceite',
    why: 'questões REJECTED deixariam de ser filtradas e virariam exercícios no aceite',
    file: 'server/src/services/accept-draft.js',
    find: "questions: content.questions.filter((q) => q.status !== 'REJECTED') };", replace: 'questions: content.questions };',
    cwd: 'server', tests: ['test/accept-draft.test.js', 'test/accept-preview.test.js', 'test/lesson-granular-edit.test.js'],
  },
  {
    id: 'M4a', area: 'sanitizador (fora de target/)',
    why: 'o sanitizador aceitaria apagar um caminho fora de src-tauri/target (human data, código)',
    file: 'scripts/dev-sanitize.mjs',
    find: "if (!(norm(real) + sep).startsWith(norm(realTarget) + sep) || norm(real) === norm(realTarget)) throw new Error(`refusing a path outside ${targetDir}: ${path}`);",
    replace: "if (false) throw new Error(`refusing a path outside ${targetDir}: ${path}`);",
    cwd: '.', tests: ['test/dev-sanitize.test.js'],
  },
  {
    id: 'M4b', area: 'sanitizador (worktree fora do conjunto)',
    why: 'o sanitizador aplicaria um plano contendo um worktree que não está na lista permitida',
    file: 'scripts/dev-sanitize.mjs',
    find: "if (!roots.map(norm).includes(norm(item.worktree))) throw new Error(`worktree not in the allowlisted set: ${item.worktree}`);",
    replace: "if (false) throw new Error(`worktree not in the allowlisted set: ${item.worktree}`);",
    cwd: '.', tests: ['test/dev-sanitize.test.js'],
  },
  {
    id: 'M5', area: 'import de fonte (checksum)',
    why: 'o commit do import deixaria de verificar que o arquivo enviado é o mesmo da prévia (checksum)',
    file: 'server/src/services/imports.js',
    find: 'if (sourceChecksum(claimedRawSource) !== row.source_checksum) {', replace: 'if (false) {',
    cwd: 'server', tests: ['test/import-preview.test.js', 'test/import-commit.test.js'],
  },
];

const norm = (p) => resolve(p).toLowerCase();

/** Throws unless `root` is a worktree created by this script: under the OS temp dir, marked, a linked worktree, never the real repo. */
export function assertDisposableWorktree(root, { tmpRoot = tmpdir(), repoRoot = REPO_ROOT } = {}) {
  if (!root) throw new Error('mutation-check: no worktree given');
  const r = norm(realpathSync(root));
  if (r === norm(repoRoot)) throw new Error('mutation-check refuses to run on the real repository tree');
  const t = norm(realpathSync(tmpRoot));
  if (!(r + sep).startsWith(t + sep)) throw new Error(`mutation-check refuses a worktree outside the OS temp dir: ${root}`);
  if (!existsSync(join(root, MARKER_FILE)) || readFileSync(join(root, MARKER_FILE), 'utf8') !== MARKER_TEXT) throw new Error(`mutation-check refuses an unmarked directory (no ${MARKER_FILE}): ${root}`);
  const dotGit = join(root, '.git');
  if (!existsSync(dotGit) || !lstatSync(dotGit).isFile()) throw new Error(`mutation-check refuses a directory that is not a linked git worktree: ${root}`);
}

/** Replaces the single occurrence of m.find in m.file. Returns the ORIGINAL text so the caller can restore it. */
export function applyMutation(root, m, guard = {}) {
  assertDisposableWorktree(root, guard);
  const path = join(root, m.file);
  const original = readFileSync(path, 'utf8');
  const count = original.split(m.find).length - 1;
  if (count !== 1) throw new Error(`mutation ${m.id}: anchor must occur exactly once in ${m.file}, found ${count}`);
  writeFileSync(path, original.replace(m.find, () => m.replace));
  return original;
}

const stripEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(SMARTLEARN_|NODE_TEST_CONTEXT$)/i.test(k)));

/** Runs `node --test <files>` in <root>/<cwd>. Returns { exitCode, failed: [test names], output }. */
export function runTests(root, cwd, tests, { timeoutMs = 600000 } = {}) {
  const res = spawnSync(process.execPath, ['--test', ...tests], { cwd: join(root, cwd), env: { ...stripEnv(), NODE_ENV: 'test' }, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const output = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
  const failed = [...new Set([...output.matchAll(/^\s*✖ (.+?)(?: \(\d[\d.]*ms\))?$/gm)].map((x) => x[1].trim()).filter((n) => n !== 'failing tests:'))];
  return { exitCode: res.status ?? (res.error ? -1 : 1), failed, output };
}

/**
 * Baseline first (the unmutated tests must be green, otherwise a "kill" proves nothing), then the mutant.
 * KILLED  = at least one NAMED test failed on the mutant.
 * SURVIVED = the relevant tests stayed green: a hole in the safety net.
 * BROKEN_MUTANT = red without any named test failing (e.g. the file stopped loading): not a behavioral kill.
 * BASELINE_RED = the unmutated tests were already red: nothing can be concluded.
 */
export function runMutation(root, m, { run = runTests, guard = {} } = {}) {
  assertDisposableWorktree(root, guard);
  const baseline = run(root, m.cwd, m.tests);
  if (baseline.exitCode !== 0) return { id: m.id, area: m.area, status: 'BASELINE_RED', failed: baseline.failed, tests: m.tests };
  const original = applyMutation(root, m, guard);
  let result;
  try {
    result = run(root, m.cwd, m.tests);
  } finally {
    writeFileSync(join(root, m.file), original);
  }
  if (readFileSync(join(root, m.file), 'utf8') !== original) throw new Error(`mutation ${m.id}: restore failed`);
  const killers = result.failed.filter((n) => !/\.(m?js)$/.test(n));
  const status = result.exitCode === 0 ? 'SURVIVED' : killers.length > 0 ? 'KILLED' : 'BROKEN_MUTANT';
  return { id: m.id, area: m.area, why: m.why, status, killedBy: killers, tests: m.tests };
}

export function summarize(results) {
  const killed = results.filter((r) => r.status === 'KILLED').length;
  return { total: results.length, killed, notKilled: results.length - killed, ok: results.length > 0 && killed === results.length };
}

function junction(target, link) {
  if (existsSync(target) && !existsSync(link)) symlinkSync(target, link, 'junction');
}
function unlinkJunction(link) {
  try { if (lstatSync(link).isSymbolicLink()) rmdirSync(link); } catch { /* absent */ }
}

function createWorktree() {
  const base = mkdtempSync(join(tmpdir(), 'sl-mutation-'));
  const root = join(base, 'wt');
  execFileSync('git', ['worktree', 'add', '--detach', root, 'HEAD'], { cwd: REPO_ROOT, stdio: 'pipe' });
  writeFileSync(join(root, MARKER_FILE), MARKER_TEXT);
  // Dependencies are shared READ-ONLY through junctions (installing them again would take minutes); only source files are mutated.
  for (const d of ['node_modules', join('server', 'node_modules')]) junction(join(REPO_ROOT, d), join(root, d));
  return { base, root };
}

function destroyWorktree({ base, root }) {
  for (const d of ['node_modules', join('server', 'node_modules')]) unlinkJunction(join(root, d));
  try { execFileSync('git', ['worktree', 'remove', '--force', root], { cwd: REPO_ROOT, stdio: 'pipe' }); } catch { /* fall through to manual cleanup */ }
  rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  try { execFileSync('git', ['worktree', 'prune'], { cwd: REPO_ROOT, stdio: 'pipe' }); } catch { /* best effort */ }
}

function main(argv) {
  if (argv.includes('--list')) {
    for (const m of MUTATIONS) console.log(`${m.id.padEnd(4)} ${m.area}\n     ${m.why}\n     ${m.file}  ->  ${m.tests.join(', ')}`);
    return 0;
  }
  const onlyArg = argv.find((a) => a.startsWith('--only='))?.slice(7) ?? (argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null);
  const only = onlyArg ? new Set(onlyArg.split(',')) : null;
  const selected = MUTATIONS.filter((m) => !only || only.has(m.id));
  if (only && selected.length !== only.size) { console.error('unknown mutation id in --only'); return 2; }
  const wt = createWorktree();
  const results = [];
  try {
    for (const m of selected) {
      process.stdout.write(`${m.id} ${m.area} ... `);
      const r = runMutation(wt.root, m);
      results.push(r);
      console.log(r.status + (r.killedBy?.length ? `  (${r.killedBy.length} test(s), e.g. "${r.killedBy[0]}")` : ''));
    }
  } finally {
    destroyWorktree(wt);
  }
  const summary = summarize(results);
  const outDir = join(REPO_ROOT, 'test-results');
  mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, 'mutation-report.json');
  writeFileSync(reportPath, JSON.stringify({ at: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim(), summary, results }, null, 2));
  console.log(`\n${summary.killed}/${summary.total} mutations killed${summary.ok ? '' : '  <-- NOT ALL KILLED'}  report: ${reportPath}`);
  return summary.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exit(main(process.argv.slice(2)));
