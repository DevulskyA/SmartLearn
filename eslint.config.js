// FIX_PLAN P2-3 (final engineering audit, .specs/quick/final-engineering-audit-v1): the one
// automated static-analysis gate this repo had none of. Deliberately minimal — structural errors
// only (unused variable, reference to an undeclared name, loose equality), not style. Calibrated
// against the real codebase, not the other way around: no product code was changed to satisfy
// this config (Safe Evolution §4.29 — the config proves itself against the healthy code, the
// healthy code is not bent to please an arbitrary rule).
import globals from 'globals';

const browserFiles = ['src/**/*.js'];
const nodeFiles = ['server/**/*.js', 'scripts/**/*.js', 'shared/**/*.js', '*.js'];
const testFiles = ['test/**/*.js', 'e2e/**/*.js', 'server/test/**/*.js'];

// Deliberately NOT eslint:recommended — that pulls in ~20 stylistic rules (no-useless-escape,
// no-control-regex, no-useless-assignment, ...) never promised by FIX_PLAN P2-3. Exactly the 3
// structural rules the plan named, no more.
const baseRules = {
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-undef': 'error',
  // 'warn', not 'error': a real, valuable list of dead code was found calibrating this (see
  // .specs/quick/final-engineering-audit-v1/AUDIT.md F-06) but fixing it means editing app.js and
  // several other files structurally, out of scope for this gate's own introduction — tracked as
  // its own follow-up, not silently fixed here or silently hidden by turning the rule off.
  'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
};

export default [
  {
    ignores: [
      'node_modules/**', '**/node_modules/**', 'dist/**', 'src-tauri/target/**',
      'src-tauri/resources/**', 'test-results/**', 'playwright-report/**',
      '**/*.json', 'conductor/.view/**', '.impeccable/**',
    ],
  },
  {
    files: browserFiles,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: baseRules,
  },
  {
    files: nodeFiles,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: baseRules,
  },
  {
    files: testFiles,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: baseRules,
  },
];
