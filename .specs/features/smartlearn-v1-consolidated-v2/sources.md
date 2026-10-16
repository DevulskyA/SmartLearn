# Source ledger and evidence boundaries

Snapshot read date: 2026-09-06. Repository observations were obtained through the connected GitHub tools. Source URLs are pinned where content stability matters. Historical branch documents describe intent or prototypes; they do not prove current product behavior or empirical educational benefit.

## Repository snapshots

- Branch inventory: https://api.github.com/repos/DevulskyA/SmartLearn/branches?per_page=100
- Current integrated base: https://github.com/DevulskyA/SmartLearn/tree/f645a0730f6e37560de813b1610f359a57419f27
- Continuation: https://github.com/DevulskyA/SmartLearn/tree/18e903b2f297a251764b8e37a567a0fef1634664
- Baseline PR #3: https://github.com/DevulskyA/SmartLearn/pull/3
- Foundation PR #5: https://github.com/DevulskyA/SmartLearn/pull/5

## Second branch - primary extraction

- Core: https://github.com/DevulskyA/SmartLearn/blob/fbfb7208169da1f66bf80ca38eaee881fbd5833e/src/learning-core.js
- Original tests: https://github.com/DevulskyA/SmartLearn/blob/fbfb7208169da1f66bf80ca38eaee881fbd5833e/src/learning-core.test.js
- Specification: https://github.com/DevulskyA/SmartLearn/blob/fbfb7208169da1f66bf80ca38eaee881fbd5833e/.specs/features/evidence-learning-core-v1/spec.md
- Design: https://github.com/DevulskyA/SmartLearn/blob/fbfb7208169da1f66bf80ca38eaee881fbd5833e/.specs/features/evidence-learning-core-v1/design.md
- Partial validation: https://github.com/DevulskyA/SmartLearn/blob/fbfb7208169da1f66bf80ca38eaee881fbd5833e/.specs/features/evidence-learning-core-v1/validation.md
- Pedagogical contract: https://github.com/DevulskyA/SmartLearn/blob/fbfb7208169da1f66bf80ca38eaee881fbd5833e/docs/research/SMARTLEARN_PEDAGOGICAL_CONTRACT_V1.md
- Old product: https://github.com/DevulskyA/SmartLearn/blob/fbfb7208169da1f66bf80ca38eaee881fbd5833e/PRODUCT.md
- Old invariant replacement: https://github.com/DevulskyA/SmartLearn/blob/fbfb7208169da1f66bf80ca38eaee881fbd5833e/.specs/project/INVARIANTS.md

## First branch - recovered principles

- Kernel: https://github.com/DevulskyA/SmartLearn/blob/5ac623f52a76f3259699a0085d3e9e4abd694a64/.specs/governance/04_PEDAGOGICAL_KERNEL.md
- ADR: https://github.com/DevulskyA/SmartLearn/blob/5ac623f52a76f3259699a0085d3e9e4abd694a64/.specs/adr/ADR-0001-pedagogical-kernel.md
- Governance and agent prompt at the same commit: .specs/governance/00_PROJECT_GOVERNANCE_STANDARD.md and 03_AGENT_ADOPTION_PROMPT.md.

## Current behavior and harness

- Single-save handler: https://github.com/DevulskyA/SmartLearn/blob/f645a0730f6e37560de813b1610f359a57419f27/src/app.js#L3336
- Domain/persistence: https://github.com/DevulskyA/SmartLearn/blob/f645a0730f6e37560de813b1610f359a57419f27/src/db.js
- Tracking predicates: https://github.com/DevulskyA/SmartLearn/blob/f645a0730f6e37560de813b1610f359a57419f27/src/tracking-state.js
- Canonical scheduler: src/scheduler.js and src/review-schedule.js at the same main commit.
- Current E2E: https://github.com/DevulskyA/SmartLearn/blob/18e903b2f297a251764b8e37a567a0fef1634664/e2e/smartlearn-plan-flow.spec.js
- Server manifest: https://github.com/DevulskyA/SmartLearn/blob/f645a0730f6e37560de813b1610f359a57419f27/server/package.json
- Root test discovery: https://github.com/DevulskyA/SmartLearn/blob/18e903b2f297a251764b8e37a567a0fef1634664/package.json
- Current PRODUCT.md, README.md, .specs/project/PROJECT.md, INVARIANTS.md and .specs/STATE.md were inspected in the preceding extraction and retain conflicting historical text; T02 reconciles it with the later explicit user decisions.

## Experimental branch - transport caution

- https://github.com/DevulskyA/SmartLearn/blob/fcd599eb14fc6bf1ba49c6cf7cb20928fa3d7d09/src/broker-transport.js
- Only timeout/retry/idempotency problem intent and backup/safety-copy ideas are recovered. The file contains generic SQL transport and offline write replay, which conflict with the current contract.

## Official technical sources consulted for new implementation decisions

- Claude scheduled tasks: https://code.claude.com/docs/en/scheduled-tasks
- OWASP password storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP CSRF: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- Node 24 cryptography: https://nodejs.org/docs/latest-v24.x/api/crypto.html
- SQLite synchronous and PRAGMAs: https://www.sqlite.org/pragma.html#pragma_synchronous
- Tauri security capabilities: https://v2.tauri.app/security/capabilities/
- Playwright assertions: https://playwright.dev/docs/test-assertions
- MDN service workers: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API

These technical references support mechanism choices, not claims that the current SmartLearn implementation already satisfies them. Operational limits and rollout choices in design.md are explicit new planning decisions, not recovered empirical constants. All claims about learning superiority remain pending appropriate evaluation.
