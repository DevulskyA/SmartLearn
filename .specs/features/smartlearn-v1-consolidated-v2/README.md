# SmartLearn V1 - consolidated execution pack V2

Prepared by ChatGPT on 2026-09-06. Repository: DevulskyA/SmartLearn.

## Purpose and authority

This is the requested reconstruction of the useful intent of historical branches and a concrete implementation plan from the current baseline to SmartLearn V1. The user activates this plan by sending the accompanying adoption instruction and goal. Historical documents are evidence of past intent, not automatic authority. This pack distinguishes repository observations, reproduced behavior, new design decisions and future validation.

There is no repository mutation in this delivery. No push, merge, production migration, credential change or deployment was performed. These files are a handoff, not an assertion that V1 has been implemented. No independent subagent review was available in the authoring environment; the execution plan requires genuinely independent verification where the Claude environment supports it.

## Installation in the executor's repository

Copy this directory's contents without semantic rewriting to:
`.specs/features/smartlearn-v1-consolidated-v2/`.
If that path already exists, compare first; preserve both versions if materially different. Never overwrite an active plan silently.

Read in this order:
1. `spec.md`: fixed product contract and release acceptance.
2. `design.md`: decisions the executor must implement, including detailed data/API contracts.
3. `tasks.md`: ordered tasks T01-T54; load only the active phase after the first overview.
4. `validation.md`: fill with actual evidence as work proceeds.
5. `context.md` and `sources.md`: consult only to resolve provenance or a specific doubt.

`evidence/` contains the historical pure module and probes used by ChatGPT, not production code to copy. These files must remain outside application test discovery and builds.

## Current starting point

- Remote main: `f645a0730f6e37560de813b1610f359a57419f27`.
- PR #3 baseline and PR #5 server foundation were merged previously.
- Foundation source: `215c89d991043ba44ef35e7a580980f16aebf1ce`.
- Continuation: `claude/smartlearn-v1-complete` at `18e903b2f297a251764b8e37a567a0fef1634664` in the inspected remote snapshot.
- Historical baseline results reported by the executor: client 223, server 17, Rust 13 passing; production web build passing. These are starting evidence, not automatic proof of later changes.
- First executable work: T01. Do not restart PR-0 or rebuild PR-1 from scratch.

The continuation contains the source foundation plus the E2E harness. Check exact local ancestry before updating it. A newer descendant is not a reason to reset or discard work.

## Continuity and stopping

One controller owns the continuation worktree. Other sessions/branches are read-only unless specifically assigned. An independent verifier reviews a frozen commit and does not edit it. Do not run two overlapping writers.

Execute T01-T54 in dependency order. A phase boundary is a checkpoint, not a request for permission to start the next already-specified phase. Read current task IDs from STATE and this pack after compaction. Do not reload all project history.

A blocked task blocks only its dependents. Continue safe independent work. After three failed correction cycles on the same cause, record the reproducer and remaining blocker instead of repeating an unbounded loop.

The master loop is a session wakeup mechanism; it is not proof of progress and is not a crash-recovery guarantee. Keep one matching job, record its ID, and cancel it at terminal completion. Preserve the user-requested terminal hibernation only after saving the report and stopping this mission's jobs/processes. Do not install hooks or watchers.

## Delivery boundary

`IMPLEMENTATION_COMPLETE`, `V1_VALIDATED` and `PRODUCTION_RELEASED` are separate.
- Implementation complete: all planned code/document work is implemented; this alone says nothing about unexecuted runtime gates.
- V1 validated: all mandatory acceptance gates, including real configured integrations and supported native targets, pass.
- Production released: separately authorized deployment and real-data cutover have occurred.

Missing provider access, missing platform runtime, missing permission or a failed required check remains visible. Never label it PASS because a mock works. A terminal `BLOCKED_EXTERNAL` checkpoint is honest partial completion, not V1 complete.

## Attachments and commands

`ADOPTION.txt` is a normal message to the executor. Then send `GOAL.txt`, then `LOOP.txt` only if there is no identical active loop. Keep the detailed requirements in these files rather than putting the whole project inside the 4,000-character goal field.

## Phase overview

| Phase | Tasks | Delivery |
| --- | --- | --- |
| 00 | T01-T06 | Current authority, correct E2E target, Unicode and test integrity |
| 01 | T07-T12 | Identity, session, CSRF and security |
| 02 | T13-T19 | Owned domain API and transactional learning loop |
| 03 | T20-T24 | Web consumes the actual central authority |
| 04 | T25-T28 | Lossless migration and rehearsal |
| 05 | T29-T33 | Reconstructed factual evidence; challenger stays disabled |
| 06 | T34-T38 | PDF provenance and controlled AI draft/acceptance |
| 07 | T39-T44 | Read-only offline, one UI on Windows/Android, reminders |
| 08 | T45-T49 | Priorities, full pt-BR, self-explanation and accessibility |
| 09 | T50-T54 | Restore, operations, integrated proof and terminal checkpoint |

`task-index.json` is a mechanically derived convenience index; `tasks.md` is the human-readable execution authority. The single Markdown edition omits this duplicate index and the raw historical source files to keep context smaller. The ZIP is the complete executable handoff.
