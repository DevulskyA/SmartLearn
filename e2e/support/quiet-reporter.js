// Minimal-output Playwright reporter for agent/CI use: silent while tests pass, one short line per failed or flaky test,
// then a single summary line. The default "list" reporter prints one line per test (400+ lines for the full suite).
// Use E2E_VERBOSE=1 (or pass --reporter=...) to get the full list again.
import { mkdirSync, writeFileSync } from 'node:fs';

const ANSI = /\u001b\[[0-9;]*m/g;
const MAX_CHARS = 160;
const MAX_SHOWN = 8;
const DETAIL_FILE = 'test-results/e2e-problems.txt';

const clean = (text) => String(text ?? '').replace(ANSI, '').replace(/\s+/g, ' ').trim();
const clip = (text) => (text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text);

export default class QuietReporter {
  constructor() {
    this.counts = { passed: 0, failed: 0, flaky: 0, skipped: 0, interrupted: 0 };
    this.problems = [];
  }

  printsToStdio() { return true; }

  onTestEnd(test, result) {
    const outcome = test.outcome();
    if (outcome === 'expected') this.counts.passed += 1;
    else if (outcome === 'skipped') this.counts.skipped += 1;
    else if (outcome === 'flaky') this.counts.flaky += 1;
    else if (result.status === 'interrupted') this.counts.interrupted += 1;
    else this.counts.failed += 1;
    if (outcome === 'expected' || outcome === 'skipped') return;
    // report a failure once, on its last attempt; flaky tests report the failed attempt's error
    if (outcome === 'unexpected' && result.retry < test.retries) return;
    const error = result.error ?? test.results.map((r) => r.error).find(Boolean);
    const where = test.location ? `${test.location.file.split(/[\\/]/).slice(-2).join('/')}:${test.location.line}` : '?';
    const line = `${outcome === 'flaky' ? 'FLAKY' : 'FAIL'} ${where} ${clean(test.title)} :: ${clip(clean(error?.message ?? result.status))}`;
    this.problems.push(`${line}\n${clean(error?.stack ?? '').slice(0, 1500)}`);
    // the console shows the first MAX_SHOWN problems; every one (with more detail) goes to the file
    if (this.problems.length <= MAX_SHOWN) console.log(line);
  }

  onError(error) {
    console.log(`ERROR ${clip(clean(error.message ?? error))}`);
  }

  onEnd(result) {
    const c = this.counts;
    const seconds = Math.round((result.duration ?? 0) / 1000);
    if (this.problems.length > 0) {
      try { mkdirSync('test-results', { recursive: true }); writeFileSync(DETAIL_FILE, this.problems.join('\n\n')); } catch { /* the console line is enough */ }
      if (this.problems.length > MAX_SHOWN) console.log(`… ${this.problems.length - MAX_SHOWN} more problem(s) in ${DETAIL_FILE}`);
    }
    const interrupted = c.interrupted ? `, ${c.interrupted} interrupted` : '';
    console.log(`E2E ${result.status}: ${c.passed} passed, ${c.failed} failed, ${c.flaky} flaky, ${c.skipped} skipped${interrupted} in ${seconds} s`);
  }
}
