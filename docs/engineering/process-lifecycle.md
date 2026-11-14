# Process lifecycle of heavy test runs

Single source: `scripts/process-supervisor.mjs` + `scripts/job-run.ps1` (Windows Job Object, KILL_ON_JOB_CLOSE). Deterministic, no AI.

1. Every heavy run (`scripts/e2e.mjs`, `scripts/e2e-global.mjs`) is started by `spawnSupervised`: the command is created suspended, put in a job, then resumed. If the job cannot be set up the run does not start (exit 97/98).
2. The job ends all descendants when the run ends, is cancelled, times out (124) or its supervisor dies (99), even by a forced kill. Nothing to clean up by hand.
3. Before starting, `admitNow` reads free memory, CPU and active runs (registry `%TEMP%/sl-runs`, shared by all worktrees): fewer workers, or refusal (exit 4, "retry later"). Never retry in a loop; wait for the active run or free memory.
4. Residue is not expected. If a run looks stuck: `node scripts/process-supervisor.mjs list`, then `stop <runId>`; `gc` removes dead records and reports any recorded child that is still alive.
5. A process may be ended only if its run id, PID and creation time match the registry. Never by image name (`taskkill /IM`, `Stop-Process -Name node`); unknown identity = leave it alone.
6. Haiku (`test-runner`, low effort) only runs `list`/`gc`/`stop <runId>` and reports; it does not clean what the job already cleaned, and does not diagnose.
7. Limits (`LIMITS` in the supervisor) come from measured peaks (`peakJobMemMB` in `<runId>.result.json`); re-measure before changing them.
