// The existing core ESLint gate stays deliberately narrow. SonarJS is layered below as the
// repository-wide quality analysis requested for JavaScript and Node scripts.
import globals from 'globals';
import sonarjs from 'eslint-plugin-sonarjs';

const browserFiles = ['src/**/*.{js,mjs}'];
const nodeFiles = ['server/**/*.{js,mjs}', 'scripts/**/*.{js,mjs}', 'shared/**/*.{js,mjs}', '*.{js,mjs}'];
const testFiles = ['test/**/*.{js,mjs}', 'e2e/**/*.{js,mjs}', 'server/test/**/*.{js,mjs}'];
const javascriptFiles = [...browserFiles, ...nodeFiles, ...testFiles];
const browserExecutionFiles = [
  'scripts/desktop-nav-n7.mjs', 'scripts/desktop-smoke-import-verdict.mjs',
  'scripts/desktop-stats-capture.mjs', 'scripts/desktop-study-journey.mjs',
  'scripts/desktop-study-resume.mjs', 'scripts/homologation-proof.mjs',
  'scripts/style-diff-v72.mjs', 'scripts/zz-dump-ui.mjs', 'scripts/zz-ui-driver.mjs',
  'scripts/zz-v3-dm.mjs', 'scripts/zz-v3-plan.mjs', 'scripts/zz-v3-shots.mjs',
];
const customExpectationFiles = [
  'scripts/desktop-nav-n7.mjs', 'scripts/desktop-study-journey.mjs', 'scripts/desktop-study-resume.mjs',
];

// Keep the existing core ESLint baseline to its three structural rules; SonarJS supplies the
// separately requested broader analysis without expanding the core ESLint rule set.
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
      '.claude/worktrees/**', '.codex/worktrees/**',
      '**/*.json', 'conductor/.view/**', '.impeccable/**',
    ],
  },
  {
    files: browserFiles,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...globals.node, __APP_IDENTITY__: 'readonly' } },
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
  {
    ...sonarjs.configs.recommended,
    files: javascriptFiles,
  },
  {
    files: browserExecutionFiles,
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // These scripts define throwing expect(condition, message) helpers; SonarJS mistakes calls for incomplete test assertions.
    files: customExpectationFiles,
    rules: { 'sonarjs/no-incomplete-assertions': 'off' },
  },
];
