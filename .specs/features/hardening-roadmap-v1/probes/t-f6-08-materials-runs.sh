#!/usr/bin/env bash
# T-F6-08 driver: 5 runs of the materials suite with E2E_WORKERS=1, then 5 with E2E_WORKERS=2, strictly sequential.
# Per run: a log file, the summary line, the failing tests, and the test-results directory of that run (traces are retained on failure).
cd /c/Projetos/SmartLearn/.claude/worktrees/smartlearn-v1-complete || exit 1
OUT="${T_F6_08_OUT:-test-results/t-f6-08}"   # durable on-disk location inside the worktree (gitignored); set T_F6_08_OUT to override
mkdir -p "$OUT"
: > "$OUT/summary.txt"
for workers in 1 2; do
  for i in 1 2 3 4 5; do
    tag="w${workers}-r${i}"
    start=$(date +%s)
    # a cheap environment census before each run (other heavy processes can matter): count msedge/webview2/node/chrome
    census=$(powershell -NoProfile -Command "(Get-Process msedge,msedgewebview2,chrome,node -ErrorAction SilentlyContinue | Measure-Object).Count" 2>/dev/null | tr -d '\r')
    E2E_WORKERS=$workers npm run test:e2e:materials > "$OUT/$tag.log" 2>&1
    code=$?
    secs=$(( $(date +%s) - start ))
    run=$(grep -o "run [0-9]*-[0-9]*" "$OUT/$tag.log" | head -1)
    passed=$(grep -oE "^\s+[0-9]+ passed" "$OUT/$tag.log" | tr -d ' ' | head -1)
    failed=$(grep -oE "^\s+[0-9]+ failed" "$OUT/$tag.log" | tr -d ' ' | head -1)
    echo "$tag exit=$code secs=$secs procs_before=$census $run ${passed:-0passed} ${failed:-0failed}" | tee -a "$OUT/summary.txt"
    grep -E "^\s+[0-9]+\) " "$OUT/$tag.log" | sed 's/^/    FAIL /' | tee -a "$OUT/summary.txt"
  done
done
echo "DONE" | tee -a "$OUT/summary.txt"
