#!/usr/bin/env python3
"""Execute one reviewed gate without a shell and record snapshot-bound evidence."""

from __future__ import annotations

import argparse
import datetime as dt
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from _common import EXIT_FAIL, EXIT_INFRA, EXIT_INTERNAL, EXIT_STALE, TLCError, add_integrity, artifact_hashes, canonical_json, project_snapshot, read_json, repo_root, safe_path, sha256_bytes, write_json_atomic


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _observed(data: bytes | None) -> dict[str, Any]:
    payload = data or b""
    return {"bytes": len(payload), "sha256": sha256_bytes(payload)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run one explicit TLC gate and write a receipt")
    parser.add_argument("--repo", required=True)
    parser.add_argument("--feature", required=True, help="feature directory containing traceability.json")
    parser.add_argument("--id", required=True, help="declared Gate ID")
    parser.add_argument("--cwd", default=None, help="override declared repo-relative cwd only when identical after normalization")
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--show-output", action="store_true")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="explicit argv after --")
    args = parser.parse_args(argv)

    try:
        repo = repo_root(args.repo)
        feature = safe_path(repo, args.feature, must_exist=True)
        if not feature.is_dir():
            raise TLCError("--feature must be a directory")
        trace_path = safe_path(repo, feature / "traceability.json", must_exist=True)
        trace = read_json(trace_path)
        gates = trace.get("gates") if isinstance(trace, dict) else None
        config = gates.get(args.id) if isinstance(gates, dict) else None
        if not isinstance(config, dict):
            raise TLCError(f"gate {args.id!r} is not declared in traceability.json")
        declared_argv = config.get("argv")
        if not isinstance(declared_argv, list) or not declared_argv or any(not isinstance(item, str) or not item for item in declared_argv):
            raise TLCError(f"gate {args.id}: argv must be a non-empty string array")
        command = list(args.command)
        if command and command[0] == "--":
            command = command[1:]
        if command != declared_argv:
            raise TLCError("explicit argv does not exactly match the reviewed traceability gate")
        declared_cwd = config.get("cwd", ".")
        if not isinstance(declared_cwd, str):
            raise TLCError(f"gate {args.id}: cwd must be a string")
        cwd_value = args.cwd if args.cwd is not None else declared_cwd
        cwd = safe_path(repo, cwd_value, must_exist=True)
        declared_cwd_path = safe_path(repo, declared_cwd, must_exist=True)
        if cwd != declared_cwd_path or not cwd.is_dir():
            raise TLCError("execution cwd must equal the reviewed gate cwd and be a directory")
        if args.timeout < 1 or args.timeout > 86_400:
            raise TLCError("--timeout must be between 1 and 86400 seconds")

        inputs = artifact_hashes(feature)
        before = project_snapshot(repo)
        started = utc_now()
        started_clock = time.monotonic()
        infrastructure: str | None = None
        timed_out = False
        try:
            proc = subprocess.run(
                command,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=args.timeout,
                check=False,
                shell=False,
            )
            exit_code: int | None = proc.returncode
            stdout = proc.stdout
            stderr = proc.stderr
        except subprocess.TimeoutExpired as exc:
            exit_code = None
            stdout = exc.stdout or b""
            stderr = exc.stderr or b""
            timed_out = True
            infrastructure = "timeout"
        except OSError as exc:
            exit_code = None
            stdout = b""
            stderr = str(exc).encode("utf-8", errors="replace")
            infrastructure = type(exc).__name__
        finished = utc_now()
        duration_ms = round((time.monotonic() - started_clock) * 1000)
        after = project_snapshot(repo)

        if infrastructure:
            outcome = "INFRASTRUCTURE_ERROR"
            result_code = EXIT_INFRA
        elif before != after:
            outcome = "SNAPSHOT_CHANGED"
            result_code = EXIT_STALE
        elif exit_code != 0:
            outcome = "GATE_FAILED"
            result_code = EXIT_FAIL
        else:
            outcome = "GATE_OBSERVED"
            result_code = 0

        receipt_id = str(uuid.uuid4())
        receipt = add_integrity(
            {
                "schema": "tlc.gate-receipt/v2",
                "receipt_id": receipt_id,
                "kind": "gate",
                "gate_id": args.id,
                "repo": {"root_realpath": str(repo), "before": before, "after": after},
                "inputs": inputs,
                "command": {
                    "argv": command,
                    "cwd": cwd.relative_to(repo).as_posix() or ".",
                    "timeout_seconds": args.timeout,
                },
                "observed": {
                    "started_utc": started,
                    "finished_utc": finished,
                    "duration_ms": duration_ms,
                    "exit_code": exit_code,
                    "timed_out": timed_out,
                    "infrastructure_error": infrastructure,
                    "stdout": _observed(stdout),
                    "stderr": _observed(stderr),
                },
                "outcome": outcome,
                "assurance": "local-process",
            }
        )
        evidence = safe_path(repo, feature / "evidence")
        filename = f"gate-{args.id.casefold()}-{receipt_id}.json"
        receipt_path = safe_path(repo, evidence / filename)
        write_json_atomic(repo, receipt_path, receipt)
        if args.show_output:
            if stdout:
                sys.stdout.buffer.write(stdout)
            if stderr:
                sys.stderr.buffer.write(stderr)
        print(f"{outcome} gate={args.id} receipt={receipt_path.relative_to(repo)} exit={exit_code}")
        return result_code
    except TLCError as exc:
        print(f"GATE_ERROR {exc}", file=sys.stderr)
        return exc.code
    except Exception as exc:  # pragma: no cover
        print(f"GATE_INTERNAL_ERROR {type(exc).__name__}: {exc}", file=sys.stderr)
        return EXIT_INTERNAL


if __name__ == "__main__":
    raise SystemExit(main())
