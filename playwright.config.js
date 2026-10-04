import { defineConfig } from '@playwright/test';
import { VITE_PORT } from './e2e/support/ports.js';
import { SUITES } from './e2e/support/suites.js';

// Ports, suite and output directory come from the run (scripts/e2e.mjs; T-F6-01/02). Plain `npx playwright test` keeps the
// historical defaults: Vite 5199, all specs, ./test-results.
const suite = process.env.E2E_SUITE;
if (suite && !SUITES[suite]) throw new Error(`unknown e2e suite "${suite}" (known: ${Object.keys(SUITES).join(', ')})`);

export default defineConfig({
  testDir: './e2e',
  testMatch: suite ? SUITES[suite].map((name) => `**/${name}.spec.js`) : undefined,
  outputDir: process.env.E2E_RUN_ID ? `./test-results/${process.env.E2E_RUN_ID}` : './test-results',
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS || 1),
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${VITE_PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --port ${VITE_PORT} --strictPort`,
    url: `http://localhost:${VITE_PORT}`,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
