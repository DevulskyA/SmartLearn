#!/usr/bin/env bash
# Whole functional test in ONE command: fresh isolated app (opened once), seed data, every journey, one result table. No model in the loop.
set -u
cd "$(dirname "$0")/.."
D="node scripts/zz-ui-driver.mjs"
$D quit >/dev/null 2>&1; sleep 4; rm -f "$TEMP/sl-ui-driver-state.json" "$TEMP/sl-ui-driver-pace.json"
$D start >/dev/null 2>&1 || { echo "driver did not start"; exit 1; }
node scripts/zz-ui-cycle.mjs "$@"
code=$?
echo "result table: .specs/evidence/ui-funcional-2026-11-01/lotes/CICLO-RESULTADO.md"
exit $code
