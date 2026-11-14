#!/usr/bin/env python3
"""Run one reviewed behavior mutation in an isolated temporary Git worktree."""

from __future__ import annotations

import argparse
import datetime as dt
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

from _common import EXIT_FAIL, EXIT_INFRA, EXIT_INTERNAL, EXIT_STALE, TLCError, add_integrity, artifact_hashes, canonical_json, file_hash, project_snapshot, read_json, repo_root, run_git, safe_path, sha256_bytes, write_json_atomic


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def run_step(argv: list[str], cwd: Path, timeout: int) -> dict[str, Any]:
    started = utc_now()
    clock = time.monotonic()
    try:
        proc = subprocess.run(argv, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False, shell=False)
        return {
            "argv": argv,
            "started_utc": started,
            "finished_utc": utc_now(),
            "duration_ms": round((time.monotonic() - clock) * 1000),
            "exit_code": proc.returncode,
            "timed_out": False,
            "infrastructure_error": None,
            "stdout": {"bytes": len(proc.stdout), "sha256": sha256_bytes(proc.stdout)},
            "stderr": {"bytes": len(proc.stderr), "sha256": sha256_bytes(proc.stderr)},
        }
    except subprocess.TimeoutExpired as exc:
        out, err = exc.stdout or b"", exc.stderr or b""
        return {
            "argv": argv,
            "started_utc": started,
            "finished_utc": utc_now(),
            "duration_ms": round((time.monotonic() - clock) * 1000),
            "exit_code": None,
            "timed_out": True,
            "infrastructure_error": "timeout",
            "stdout": {"bytes": len(out), "sha256": sha256_bytes(out)},
            "stderr": {"bytes": len(err), "sha256": sha256_bytes(err)},
        }
    except OSError as exc:
        raw = str(exc).encode("utf-8", errors="replace")
        return {
            "argv": argv,
            "started_utc": started,
            "finished_utc": utc_now(),
            "duration_ms": round((time.monotonic() - clock) * 1000),
            "exit_code": None,
            "timed_out": False,
            "infrastructure_error": type(exc).__name__,
            "stdout": {"bytes": 0, "sha256": sha256_bytes(b"")},
            "stderr": {"bytes": len(raw), "sha256": sha256_bytes(raw)},
        }


def _argv(config: dict[str, Any], key: str, *, optional: bool = False) -> list[str]:
    value = config.get(key)
    if optional and value in (None, []):
        return []
    if not isinstance(value, list) or not value or any(not isinstance(item, str) or not item for item in value):
        raise TLCError(f"mutation {key} must be a non-empty string array")
    return list(value)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run a reviewed mutation manifest entry in a temporary worktree")
    parser.add_argument("--repo", required=True)
    parser.add_argument("--feature", required=True)
    parser.add_argument("--id", required=True)
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--acknowledge-reviewed-manifest", action="store_true", required=True)
    args = parser.parse_args(argv)

    worktree: Path | None = None
    repo: Path | None = None
    try:
        if args.timeout < 1 or args.timeout > 86_400:
            raise TLCError("--timeout must be between 1 and 86400 seconds")
        repo = repo_root(args.repo)
        feature = safe_path(repo, args.feature, must_exist=True)
        trace = read_json(safe_path(repo, feature / "traceability.json", must_exist=True))
        mutations = trace.get("mutations") if isinstance(trace, dict) else None
        config = mutations.get(args.id) if isinstance(mutations, dict) else None
        if not isinstance(config, dict):
            raise TLCError(f"mutation {args.id!r} is not declared in traceability.json")
        ac_ids = config.get("ac_ids")
        if not isinstance(ac_ids, list) or not ac_ids or any(not isinstance(item, str) for item in ac_ids):
            raise TLCError("mutation ac_ids must be a non-empty string array")
        patch = safe_path(repo, config.get("patch", ""), must_exist=True)
        if not patch.is_file():
            raise TLCError("mutation patch must be a regular in-repository file")
        baseline_argv = _argv(config, "baseline_argv")
        viability_argv = _argv(config, "viability_argv", optional=True)
        detector_argv = _argv(config, "detector_argv")
        expected = config.get("expected_detector_exit_codes", [1])
        if not isinstance(expected, list) or not expected or any(not isinstance(code, int) or code == 0 for code in expected):
            raise TLCError("expected_detector_exit_codes must be a non-empty array of non-zero integers")
        cwd_rel = config.get("cwd", ".")
        if not isinstance(cwd_rel, str):
            raise TLCError("mutation cwd must be a string")

        inputs = artifact_hashes(feature)
        original_before = project_snapshot(repo)
        worktree = Path(tempfile.mkdtemp(prefix="tlc-mutation-"))
        worktree.rmdir()
        run_git(repo, "worktree", "add", "--detach", str(worktree), original_before["head"])
        work_cwd = safe_path(worktree.resolve(strict=True), cwd_rel, must_exist=True)

        baseline = run_step(baseline_argv, work_cwd, args.timeout)
        if baseline["infrastructure_error"]:
            outcome, result_code = "MUTATION_INFRASTRUCTURE_ERROR", EXIT_INFRA
            viability: dict[str, Any] | None = None
            detector: dict[str, Any] | None = None
            diff_hash: str | None = None
        elif baseline["exit_code"] != 0:
            outcome, result_code = "MUTATION_BASELINE_FAILED", EXIT_FAIL
            viability = detector = None
            diff_hash = None
        else:
            check = subprocess.run(["git", "apply", "--check", str(patch)], cwd=worktree, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
            apply = subprocess.run(["git", "apply", str(patch)], cwd=worktree, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False) if check.returncode == 0 else None
            diff = run_git(worktree, "diff", "--binary", check=False)
            diff_hash = sha256_bytes(diff) if diff else None
            if check.returncode != 0 or apply is None or apply.returncode != 0 or not diff:
                outcome, result_code = "MUTATION_PATCH_INVALID", EXIT_FAIL
                viability = detector = None
            else:
                viability = run_step(viability_argv, work_cwd, args.timeout) if viability_argv else None
                if viability and viability["infrastructure_error"]:
                    outcome, result_code = "MUTATION_INFRASTRUCTURE_ERROR", EXIT_INFRA
                    detector = None
                elif viability and viability["exit_code"] != 0:
                    outcome, result_code = "MUTATION_NOT_VIABLE", EXIT_FAIL
                    detector = None
                else:
                    detector = run_step(detector_argv, work_cwd, args.timeout)
                    if detector["infrastructure_error"]:
                        outcome, result_code = "MUTATION_INFRASTRUCTURE_ERROR", EXIT_INFRA
                    elif detector["exit_code"] in expected:
                        outcome, result_code = "MUTATION_KILLED", 0
                    elif detector["exit_code"] == 0:
                        outcome, result_code = "MUTATION_SURVIVED", EXIT_FAIL
                    else:
                        outcome, result_code = "MUTATION_UNEXPECTED_FAILURE", EXIT_FAIL

        remove = subprocess.run(["git", "-C", str(repo), "worktree", "remove", "--force", str(worktree)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if remove.returncode == 0:
            worktree = None
        original_after = project_snapshot(repo)
        if original_before != original_after:
            outcome, result_code = "ORIGINAL_SNAPSHOT_CHANGED", EXIT_STALE

        receipt_id = str(uuid.uuid4())
        receipt = add_integrity(
            {
                "schema": "tlc.mutation-receipt/v2",
                "receipt_id": receipt_id,
                "kind": "mutation",
                "mutation_id": args.id,
                "ac_ids": ac_ids,
                "repo": {"root_realpath": str(repo), "before": original_before, "after": original_after},
                "inputs": inputs,
                "mutation_config_sha256": sha256_bytes(canonical_json(config)),
                "patch": {"path": patch.relative_to(repo).as_posix(), "sha256": file_hash(patch), "applied_diff_sha256": diff_hash},
                "steps": {"baseline": baseline, "viability": viability, "detector": detector},
                "outcome": outcome,
                "assurance": "isolated-git-worktree",
            }
        )
        receipt_path = safe_path(repo, feature / "evidence" / f"mutation-{args.id.casefold()}-{receipt_id}.json")
        write_json_atomic(repo, receipt_path, receipt)
        print(f"{outcome} mutation={args.id} receipt={receipt_path.relative_to(repo)}")
        return result_code
    except TLCError as exc:
        print(f"MUTATION_ERROR {exc}", file=sys.stderr)
        return exc.code
    except Exception as exc:  # pragma: no cover
        print(f"MUTATION_INTERNAL_ERROR {type(exc).__name__}: {exc}", file=sys.stderr)
        return EXIT_INTERNAL
    finally:
        if repo is not None and worktree is not None and worktree.exists():
            subprocess.run(["git", "-C", str(repo), "worktree", "remove", "--force", str(worktree)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


if __name__ == "__main__":
    raise SystemExit(main())
