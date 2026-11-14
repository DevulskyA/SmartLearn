#!/usr/bin/env python3
"""Portable launcher for TLC + ECC Engineering V4 deterministic helpers."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

COMMANDS = {
    "lint-spec": "validate_spec.py",
    "lint-tasks": "validate_tasks.py",
    "run-gate": "run_gate.py",
    "run-mutation": "run_mutation.py",
    "verify-evidence": "validate_completion.py",
    "validate-completion": "validate_completion.py",
    "lessons": "lessons.py",
    "self-test": "self_test.py",
}


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] in {"-h", "--help"}:
        print("usage: tlc.py <" + "|".join(COMMANDS) + "> [arguments]")
        return 0
    command = args.pop(0)
    script = COMMANDS.get(command)
    if script is None:
        print(f"unknown command: {command}", file=sys.stderr)
        return 2
    return subprocess.run([sys.executable, str(Path(__file__).resolve().parent / script), *args], check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
