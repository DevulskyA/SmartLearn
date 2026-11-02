#!/usr/bin/env bash
# Sourced by zz-ui-full.sh and zz-ui-bordas.sh: ONE native-test run at a time (they share one driver and one state file, so two runs would quit
# each other's app or send edge-case junk into the realistic dataset). Interrupted or crashed runs are cleaned up by the trap; a lock whose owner
# is dead is taken over. Also sweeps throwaway instance folders older than a day (our own prefix only).
LOCK="$TEMP/sl-ui-run.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  owner=$(cat "$LOCK/pid" 2>/dev/null)
  if [ -n "$owner" ] && kill -0 "$owner" 2>/dev/null; then
    echo "another native test run is active (pid $owner, $(cat "$LOCK/what" 2>/dev/null)); refusing to start a second one so the two do not touch each other's data"
    exit 3
  fi
  rm -rf "$LOCK"; mkdir "$LOCK" || { echo "cannot take the run lock"; exit 3; }
fi
echo $$ > "$LOCK/pid"; echo "$(basename "$0")" > "$LOCK/what"
cleanup() { node scripts/zz-ui-driver.mjs quit >/dev/null 2>&1; rm -rf "$LOCK"; }
trap cleanup EXIT
trap 'exit 130' INT TERM
find "$TEMP" -maxdepth 1 -type d -name 'sl-ui-driver-*' -mtime +1 -exec rm -rf {} + 2>/dev/null
