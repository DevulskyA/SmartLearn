import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import { VITE_PORT } from './e2e/support/ports.js';
import { SUITES } from './e2e/support/suites.js';

// Ports, suite and output directory come from the run (scripts/e2e.mjs; T-F6-01/02). Plain `npx playwright test` keeps the
// historical defaults: Vite 5199, all specs, ./test-results.
const suite = process.env.E2E_SUITE;
if (suite && !SUITES[suite]) throw new Error(`unknown e2e suite "${suite}" (known: ${Object.keys(SUITES).join(', ')})`);

const outputDir = process.env.E2E_RUN_ID ? `./test-results/${process.env.E2E_RUN_ID}` : './test-results';
// Playwright empties its output directory at the start of a run, so the Vite log lives beside it, not inside it.
const viteLog = resolve('test-logs', process.env.E2E_RUN_ID || 'default', 'vite.log');

export default defineConfig({
  testDir: './e2e',
  testMatch: suite ? SUITES[suite].map((name) => `**/${name}.spec.js`) : undefined,
  outputDir,
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS || 1),
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${VITE_PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    // Vite's own messages (restarts, dependency re-optimization, proxy errors) used to be piped into the console, where every
    // /health/build poll that no backend answered printed a stack trace (~220 per run, all read by whoever reads the run). They go to
    // vite.log in the run's output directory instead: it is the place to look when the server itself is the suspect.
    command: `node scripts/e2e-vite.mjs ${VITE_PORT} "${viteLog}"`,
    url: `http://localhost:${VITE_PORT}`,
    reuseExistingServer: false,
    timeout: 30000,
    stdout: 'ignore',
  },
});
