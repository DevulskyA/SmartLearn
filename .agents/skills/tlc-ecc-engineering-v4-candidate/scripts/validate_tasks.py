#!/usr/bin/env python3
"""Static graph and coverage check for TLC + ECC V4 formal tasks."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from _common import EXIT_FAIL, EXIT_INTERNAL, TLCError, is_placeholder, parse_ids, parse_table, read_text, repo_root, resolve_artifact, safe_path, section, strip_fenced_code
import validate_spec

GATE_HEADERS = ("Gate ID", "Level", "Command", "Source")
FIELD = re.compile(r"^\*\*(Requirements|Acceptance|Depends on|Gate IDs|Files|Security)\*\*:\s*(.*?)\s*$", re.MULTILINE)
TASK = re.compile(r"^###\s+(T-[0-9]{3,}):\s+(.+?)\s*$", re.MULTILINE)


def _gate_ids(value: str) -> list[str]:
    parts = [part.strip() for part in value.split(",")]
    if not parts or any(not re.fullmatch(r"G-[A-Z0-9][A-Z0-9-]*", part) for part in parts):
        raise TLCError(f"invalid Gate ID list: {value!r}")
    if len(parts) != len(set(parts)):
        raise TLCError(f"duplicate Gate ID in list: {value!r}")
    return parts


def _parse_tasks(body: str, errors: list[str]) -> list[dict[str, Any]]:
    clean = strip_fenced_code(body)
    matches = list(TASK.finditer(clean))
    tasks: list[dict[str, Any]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(clean)
        block = clean[match.end():end]
        values: dict[str, str] = {}
        for field in FIELD.finditer(block):
            key = field.group(1)
            if key in values:
                errors.append(f"{match.group(1)}: duplicate field {key}")
            else:
                values[key] = field.group(2).strip()
        missing = [name for name in ("Requirements", "Acceptance", "Depends on", "Gate IDs", "Files", "Security") if name not in values]
        if missing:
            errors.append(f"{match.group(1)}: missing fields: {', '.join(missing)}")
        done = re.search(r"^\*\*Done when\*\*:\s*$([\s\S]*?)(?=^###\s+|\Z)", block, re.MULTILINE)
        checks = re.findall(r"^\s*-\s*\[[ xX]\]\s+(.+)$", done.group(1), re.MULTILINE) if done else []
        if not done or not checks:
            errors.append(f"{match.group(1)}: Done when needs at least one checklist item")
        tasks.append({"id": match.group(1), "title": match.group(2).strip(), "fields": values, "checks": checks})
    if not tasks:
        errors.append("Task Breakdown must contain at least one canonical T-NNN task")
    return tasks


def check(tasks_path: Path, spec_path: Path, repo: Path) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    spec_result = validate_spec.check(spec_path)
    if spec_result["errors"]:
        errors.append("spec structure is invalid; fix spec before validating tasks")
    text = read_text(tasks_path)
    try:
        gate_body = section(text, "Gate Registry")
        task_body = section(text, "Task Breakdown")
    except TLCError as exc:
        errors.append(str(exc))
        gate_body = task_body = None
    if gate_body is None:
        errors.append("missing section: ## Gate Registry")
        gate_body = ""
    if task_body is None:
        errors.append("missing section: ## Task Breakdown")
        task_body = ""

    try:
        gate_rows = parse_table(gate_body, GATE_HEADERS)
    except TLCError as exc:
        errors.append(f"Gate Registry: {exc}")
        gate_rows = []
    gates: dict[str, dict[str, str]] = {}
    closure = 0
    for index, row in enumerate(gate_rows, 1):
        gid = row["Gate ID"].strip()
        if not re.fullmatch(r"G-[A-Z0-9][A-Z0-9-]*", gid):
            errors.append(f"gate row {index}: invalid Gate ID {gid!r}")
            continue
        if gid in gates:
            errors.append(f"duplicate gate ID: {gid}")
            continue
        level = row["Level"].casefold()
        if level not in {"task", "closure"}:
            errors.append(f"{gid}: Level must be task or closure")
        if level == "closure":
            closure += 1
        if is_placeholder(row["Command"]):
            errors.append(f"{gid}: command is empty or placeholder")
        if is_placeholder(row["Source"]):
            errors.append(f"{gid}: source is empty or placeholder")
        gates[gid] = row
    if not gate_rows:
        errors.append("Gate Registry must contain at least one gate")
    if closure == 0:
        errors.append("Gate Registry must contain at least one closure gate")

    tasks = _parse_tasks(task_body, errors)
    task_ids = [task["id"] for task in tasks]
    if len(task_ids) != len(set(task_ids)):
        errors.append("duplicate task IDs")
    known_before: set[str] = set()
    all_req: set[str] = set()
    all_ac: set[str] = set()
    mapped_ac: set[str] = set()
    for task in tasks:
        tid = task["id"]
        values = task["fields"]
        try:
            reqs = parse_ids(values.get("Requirements", ""))
            acs = parse_ids(values.get("Acceptance", ""))
            deps = parse_ids(values.get("Depends on", ""), allow_none=True)
            gate_ids = _gate_ids(values.get("Gate IDs", ""))
        except TLCError as exc:
            errors.append(f"{tid}: {exc}")
            reqs = acs = deps = gate_ids = []
        unknown_req = set(reqs) - set(spec_result["requirements"])
        unknown_ac = set(acs) - set(spec_result["acceptance_criteria"])
        if unknown_req:
            errors.append(f"{tid}: unknown requirements: {', '.join(sorted(unknown_req))}")
        if unknown_ac:
            errors.append(f"{tid}: unknown acceptance criteria: {', '.join(sorted(unknown_ac))}")
        unknown_deps = set(deps) - known_before
        if unknown_deps:
            errors.append(f"{tid}: dependency must name an earlier task: {', '.join(sorted(unknown_deps))}")
        unknown_gates = set(gate_ids) - set(gates)
        if unknown_gates:
            errors.append(f"{tid}: unknown gate IDs: {', '.join(sorted(unknown_gates))}")
        security = values.get("Security", "").split("—", 1)[0].split(" - ", 1)[0].strip().casefold()
        if security not in {"none", "product", "harness", "both"}:
            errors.append(f"{tid}: Security must begin with none, product, harness, or both")
        files = [value.strip().strip("`") for value in values.get("Files", "").split(",") if value.strip()]
        if not files:
            errors.append(f"{tid}: Files must name at least one in-repository path")
        for value in files:
            try:
                safe_path(repo, value)
            except TLCError as exc:
                errors.append(f"{tid}: unsafe file path {value!r}: {exc}")
        if not any("receipt" in item.casefold() or "gate" in item.casefold() for item in task["checks"]):
            errors.append(f"{tid}: Done when must require current gate evidence")
        all_req.update(reqs)
        all_ac.update(acs)
        mapped_ac.update(acs)
        known_before.add(tid)

    missing_ac = set(spec_result["acceptance_criteria"]) - mapped_ac
    if missing_ac:
        errors.append(f"acceptance criteria without tasks: {', '.join(sorted(missing_ac))}")
    return {
        "errors": errors,
        "warnings": warnings,
        "tasks": task_ids,
        "gates": sorted(gates),
        "closure_gates": sorted(gid for gid, row in gates.items() if row["Level"].casefold() == "closure"),
        "counts": {"tasks": len(tasks), "gates": len(gates), "mapped_acceptance_criteria": len(mapped_ac)},
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check TLC V4 task graph; does not execute gates")
    parser.add_argument("target", help="tasks.md path or feature directory")
    parser.add_argument("--spec", help="spec.md path; defaults beside tasks.md")
    parser.add_argument("--repo", default=".", help="Git repository root or child path")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--format", choices=("human", "json"), default="human")
    args = parser.parse_args(argv)
    try:
        tasks_path = resolve_artifact(args.target, "tasks.md")
        spec_path = resolve_artifact(args.spec or tasks_path.parent, "spec.md")
        repo = repo_root(args.repo)
        result = check(tasks_path, spec_path, repo)
    except TLCError as exc:
        print(f"TASKS_STRUCTURE_ERROR {exc}", file=sys.stderr)
        return exc.code
    except Exception as exc:  # pragma: no cover
        print(f"TASKS_INTERNAL_ERROR {type(exc).__name__}: {exc}", file=sys.stderr)
        return EXIT_INTERNAL
    failed = bool(result["errors"]) or (args.strict and bool(result["warnings"]))
    if args.format == "json":
        print(json.dumps({"status": "FAIL" if failed else "TASKS_STRUCTURE_OK", **result}, ensure_ascii=False, sort_keys=True))
    else:
        for warning in result["warnings"]:
            print(f"WARN {warning}")
        for error in result["errors"]:
            print(f"ERROR {error}")
        counts = result["counts"]
        print(f"INSPECTED tasks={counts['tasks']} gates={counts['gates']} mapped_acceptance_criteria={counts['mapped_acceptance_criteria']}")
        print("TASKS_STRUCTURE_FAIL" if failed else "TASKS_STRUCTURE_OK")
    return EXIT_FAIL if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
