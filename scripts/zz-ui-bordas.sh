#!/usr/bin/env bash
# Edge-case inputs (empty, spaces, 300 chars, HTML, quotes, emoji, duplicates, past/future dates) run on a SEPARATE throwaway instance that is closed
# at the end. The realistic dataset used by other tests (statistics, etc.) never receives this junk.
set -u
cd "$(dirname "$0")/.."
. scripts/zz-ui-guard.sh
D="node scripts/zz-ui-driver.mjs"
L=.specs/evidence/ui-funcional-2026-11-01/lotes
$D quit >/dev/null 2>&1; sleep 4; rm -f "$TEMP/sl-ui-driver-state.json" "$TEMP/sl-ui-driver-pace.json"
$D start >/dev/null 2>&1 || { echo "driver did not start"; exit 1; }
$D batch $L/seed/SEED1-conta-disciplinas-aulas.txt >/dev/null
code=0
for f in $L/bordas/*.txt; do rm -f "$TEMP/sl-ui-driver-pace.json"; out=$($D batch "$f" "$@" 2>&1); echo "$(basename "$f"): $(echo "$out" | grep -E '^batch:' | cut -c1-60)"; echo "$out" | grep -q "failed, " && echo "$out" | grep -qE "[1-9][0-9]* failed" && code=1; done
$D quit >/dev/null 2>&1
exit $code
