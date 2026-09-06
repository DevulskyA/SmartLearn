# Evidence Learning Core V1 Tasks

## Test Coverage Matrix
| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain learning logic | unit | all ACs + edge branches | `src/learning-core.test.js` | `node --test src/learning-core.test.js` |
| Existing application | regression/build | unchanged in this milestone | existing app | `npm test` then `npm run build` when full repo environment is available |

## Gate Check Commands
| Gate Level | Use | Command |
| --- | --- | --- |
| Quick | domain behavior | `node --test src/learning-core.test.js` |
| Full | repository tests | `npm test` |
| Build | feature closure | `npm run build` |

## Execution Plan
Phase 1 establishes the canonical contract and pure core. Phase 2 persists events and wires them into review completion. Phase 3 exposes evidence/mastery in the UI. Only Phase 1 is in scope for this feature branch milestone.

## Task Breakdown
### T1: Implement learning evidence domain core

**What**: Add explicit event validation, assistance-aware evidence classification, error hypotheses, mastery gate and next-action recommendation.
**Where**: `src/learning-core.js`, `src/learning-core.test.js`
**Depends on**: none
**Reuses**: vanilla ES modules and Node test runner already present in package scripts
**Requirement**: ELC-001 through ELC-007 / AC-001 through AC-007

**Done when**:
- [ ] All acceptance outcomes are represented in unit tests.
- [ ] No SQL, UI, Tauri or network dependency is introduced.
- [ ] Gate passes: `node --test src/learning-core.test.js`.

**Tests**: unit
**Gate**: quick

### T2: Install canonical project contract

**What**: Add the pedagogical contract and V2 product direction without deleting legacy code.
**Where**: `docs/research/`, `PRODUCT.md`, `.specs/project/PROJECT.md`, `.specs/project/INVARIANTS.md`
**Depends on**: T1
**Reuses**: current project documentation hierarchy
**Requirement**: ELC-007 plus project governance

**Done when**:
- [ ] Future agents can identify the new product objective before modifying learning behavior.
- [ ] Legacy restrictions that explicitly ban intelligent learning mechanisms are superseded.
- [ ] Current local-first and low-friction constraints are preserved.
- [ ] Gate passes: `npm run build`.

**Tests**: none
**Gate**: build
