#!/usr/bin/env python3
"""Verify current, intact TLC V4 evidence without claiming semantic correctness."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from _common import EXIT_FAIL, EXIT_INTERNAL, EXIT_STALE, TLCError, artifact_hashes, canonical_json, project_snapshot, read_json, read_text, repo_root, safe_path, sha256_bytes, verify_integrity
import validate_spec
import validate_tasks


def _string_array(value: Any, label: str, errors: list[str], *, nonempty: bool = True) -> list[str]:
    if not isinstance(value, list) or (nonempty and not value) or any(not isinstance(item, str) or not item for item in value):
        errors.append(f"{label} must be {'a non-empty' if nonempty else 'an'} string array")
        return []
    if len(value) != len(set(value)):
        errors.append(f"{label} contains duplicates")
    return list(value)


def _receipt_matches(
    receipt: dict[str, Any],
    *,
    snapshot: dict[str, Any],
    inputs: dict[str, str],
    config: dict[str, Any] | None = None,
) -> bool:
    repo_data = receipt.get("repo")
    if not isinstance(repo_data, dict) or repo_data.get("before") != snapshot or repo_data.get("after") != snapshot:
        return False
    if receipt.get("inputs") != inputs:
        return False
    if config is not None:
        command = receipt.get("command")
        if not isinstance(command, dict):
            return False
        if command.get("argv") != config.get("argv") or command.get("cwd") != config.get("cwd", "."):
            return False
    return True


def check(feature: Path, repo: Path) -> dict[str, Any]:
    errors: list[str] = []
    stale: list[str] = []
    spec_path = safe_path(repo, feature / "spec.md", must_exist=True)
    tasks_path = safe_path(repo, feature / "tasks.md", must_exist=True)
    trace_path = safe_path(repo, feature / "traceability.json", must_exist=True)
    spec_result = validate_spec.check(spec_path)
    task_result = validate_tasks.check(tasks_path, spec_path, repo)
    errors.extend(f"spec: {message}" for message in spec_result["errors"])
    errors.extend(f"tasks: {message}" for message in task_result["errors"])
    trace = read_json(trace_path)
    if not isinstance(trace, dict) or trace.get("schema") != "tlc.traceability/v2":
        errors.append("traceability.json schema must be tlc.traceability/v2")
        trace = {}
    if trace.get("spec") != "spec.md" or trace.get("tasks") != "tasks.md":
        errors.append("traceability spec/tasks must be the feature-local spec.md and tasks.md")

    gates = trace.get("gates")
    if not isinstance(gates, dict) or not gates:
        errors.append("traceability gates must be a non-empty object")
        gates = {}
    for gid, config in gates.items():
        if gid not in task_result["gates"]:
            errors.append(f"traceability declares unknown task gate: {gid}")
        if not isinstance(config, dict):
            errors.append(f"gate {gid}: configuration must be an object")
            continue
        _string_array(config.get("argv"), f"gate {gid} argv", errors)
        if not isinstance(config.get("cwd", "."), str):
            errors.append(f"gate {gid}: cwd must be a string")
        if config.get("level") not in {"task", "closure"}:
            errors.append(f"gate {gid}: level must be task or closure")
        if not isinstance(config.get("source"), str) or not config.get("source", "").strip():
            errors.append(f"gate {gid}: source is required")
    if set(gates) != set(task_result["gates"]):
        errors.append("traceability gate IDs must exactly match the tasks Gate Registry")

    closure = _string_array(trace.get("closure_gates"), "closure_gates", errors)
    if set(closure) != set(task_result["closure_gates"]):
        errors.append("closure_gates must exactly match closure-level gates in tasks.md")

    criteria = trace.get("criteria")
    if not isinstance(criteria, list) or not criteria:
        errors.append("traceability criteria must be a non-empty array")
        criteria = []
    seen_ac: set[str] = set()
    required_gate_ids: set[str] = set(closure)
    required_mutations: set[str] = set()
    for index, item in enumerate(criteria, 1):
        if not isinstance(item, dict):
            errors.append(f"criterion entry {index} must be an object")
            continue
        aid = item.get("id")
        if not isinstance(aid, str) or aid not in spec_result["acceptance_criteria"]:
            errors.append(f"criterion entry {index}: unknown acceptance criterion {aid!r}")
            continue
        if aid in seen_ac:
            errors.append(f"duplicate traceability criterion: {aid}")
        seen_ac.add(aid)
        task_ids = _string_array(item.get("tasks"), f"{aid} tasks", errors)
        unknown_tasks = set(task_ids) - set(task_result["tasks"])
        if unknown_tasks:
            errors.append(f"{aid}: unknown tasks: {', '.join(sorted(unknown_tasks))}")
        gate_ids = _string_array(item.get("gates"), f"{aid} gates", errors)
        unknown_gates = set(gate_ids) - set(gates)
        if unknown_gates:
            errors.append(f"{aid}: unknown gates: {', '.join(sorted(unknown_gates))}")
        required_gate_ids.update(gate_ids)
        tests = item.get("tests", [])
        if not isinstance(tests, list):
            errors.append(f"{aid}: tests must be an array")
            tests = []
        if spec_result["verification"].get(aid) == "automated" and not tests:
            errors.append(f"{aid}: automated criterion needs at least one test location")
        for test in tests:
            if not isinstance(test, dict):
                errors.append(f"{aid}: each test location must be an object")
                continue
            path_value, line, symbol = test.get("path"), test.get("line"), test.get("symbol")
            if not isinstance(path_value, str) or not isinstance(line, int) or line < 1 or not isinstance(symbol, str) or not symbol:
                errors.append(f"{aid}: test needs path, positive line, and symbol")
                continue
            try:
                test_path = safe_path(repo, path_value, must_exist=True)
                source = read_text(test_path)
                lines = source.splitlines()
                if line > len(lines):
                    errors.append(f"{aid}: test line exceeds file length: {path_value}:{line}")
                if symbol not in source:
                    errors.append(f"{aid}: test symbol not found in {path_value}: {symbol}")
            except TLCError as exc:
                errors.append(f"{aid}: invalid test evidence: {exc}")
        mutation_ids = _string_array(item.get("mutations", []), f"{aid} mutations", errors, nonempty=False)
        required_mutations.update(mutation_ids)

    expected_ac = set(spec_result["acceptance_criteria"])
    if seen_ac != expected_ac:
        errors.append(f"traceability criteria must exactly match spec; missing={sorted(expected_ac - seen_ac)} extra={sorted(seen_ac - expected_ac)}")

    discrimination = trace.get("discrimination")
    if not isinstance(discrimination, dict) or not isinstance(discrimination.get("required"), bool):
        errors.append("discrimination must declare boolean required")
        discrimination = {"required": False}
    automated = {aid for aid, mode in spec_result["verification"].items() if mode == "automated"}
    if automated and not discrimination.get("required"):
        errors.append("formal executable criteria require discrimination.required=true")
    if not discrimination.get("required") and not isinstance(discrimination.get("reason"), str):
        errors.append("non-required discrimination needs a reason")
    if discrimination.get("required"):
        without_mutation = automated - {item.get("id") for item in criteria if isinstance(item, dict) and item.get("mutations")}
        if without_mutation:
            errors.append(f"automated criteria without mutation evidence: {', '.join(sorted(without_mutation))}")

    mutations = trace.get("mutations", {})
    if not isinstance(mutations, dict):
        errors.append("mutations must be an object")
        mutations = {}
    unknown_mutations = required_mutations - set(mutations)
    if unknown_mutations:
        errors.append(f"criteria reference unknown mutations: {', '.join(sorted(unknown_mutations))}")

    current_inputs = artifact_hashes(feature)
    current_snapshot = project_snapshot(repo)
    receipts: list[dict[str, Any]] = []
    evidence_dir = safe_path(repo, feature / "evidence")
    if evidence_dir.exists():
        for path in sorted(evidence_dir.glob("*.json")):
            try:
                receipt = read_json(path)
            except TLCError as exc:
                stale.append(f"unreadable receipt {path.name}: {exc}")
                continue
            if not isinstance(receipt, dict) or not verify_integrity(receipt):
                stale.append(f"integrity-invalid receipt: {path.name}")
                continue
            receipts.append(receipt)

    for gid in sorted(required_gate_ids):
        config = gates.get(gid)
        candidates = [receipt for receipt in receipts if receipt.get("schema") == "tlc.gate-receipt/v2" and receipt.get("gate_id") == gid]
        current = [receipt for receipt in candidates if receipt.get("outcome") == "GATE_OBSERVED" and isinstance(config, dict) and _receipt_matches(receipt, snapshot=current_snapshot, inputs=current_inputs, config=config)]
        if not current:
            if candidates:
                stale.append(f"gate {gid} has no current successful receipt")
            else:
                errors.append(f"gate {gid} has no receipt")

    for mid in sorted(required_mutations):
        config = mutations.get(mid)
        candidates = [receipt for receipt in receipts if receipt.get("schema") == "tlc.mutation-receipt/v2" and receipt.get("mutation_id") == mid]
        current = [
            receipt
            for receipt in candidates
            if receipt.get("outcome") == "MUTATION_KILLED"
            and _receipt_matches(receipt, snapshot=current_snapshot, inputs=current_inputs)
            and isinstance(config, dict)
            and receipt.get("mutation_config_sha256") == sha256_bytes(canonical_json(config))
        ]
        if not current:
            if candidates:
                stale.append(f"mutation {mid} has no current valid killed receipt")
            else:
                errors.append(f"mutation {mid} has no receipt")

    return {
        "errors": errors,
        "stale": stale,
        "counts": {"criteria": len(criteria), "required_gates": len(required_gate_ids), "required_mutations": len(required_mutations), "receipts": len(receipts)},
        "snapshot": current_snapshot,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify TLC V4 traceability and receipt freshness")
    parser.add_argument("target", help="feature directory")
    parser.add_argument("--repo", required=True)
    parser.add_argument("--format", choices=("human", "json"), default="human")
    args = parser.parse_args(argv)
    try:
        repo = repo_root(args.repo)
        feature = safe_path(repo, args.target, must_exist=True)
        if not feature.is_dir():
            raise TLCError("target must be a feature directory")
        result = check(feature, repo)
    except TLCError as exc:
        print(f"EVIDENCE_ERROR {exc}", file=sys.stderr)
        return exc.code
    except Exception as exc:  # pragma: no cover
        print(f"EVIDENCE_INTERNAL_ERROR {type(exc).__name__}: {exc}", file=sys.stderr)
        return EXIT_INTERNAL
    failed = bool(result["errors"] or result["stale"])
    status = "STALE" if result["stale"] else ("FAIL" if result["errors"] else "EVIDENCE_VERIFIED")
    if args.format == "json":
        print(json.dumps({"status": status, **result}, ensure_ascii=False, sort_keys=True))
    else:
        for message in result["errors"]:
            print(f"ERROR {message}")
        for message in result["stale"]:
            print(f"STALE {message}")
        counts = result["counts"]
        print(f"INSPECTED criteria={counts['criteria']} gates={counts['required_gates']} mutations={counts['required_mutations']} receipts={counts['receipts']}")
        print(status)
    if result["stale"]:
        return EXIT_STALE
    return EXIT_FAIL if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
