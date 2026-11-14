#!/usr/bin/env python3
"""Static integrity check for TLC + ECC V4 formal specifications."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from _common import EXIT_FAIL, EXIT_INTERNAL, EXIT_USAGE, ID, TLCError, is_placeholder, parse_ids, parse_table, read_text, resolve_artifact, section

REQ_HEADERS = ("ID", "Requirement", "Source", "Priority")
AC_HEADERS = ("ID", "Requirement IDs", "Given", "When", "Then", "Spec-defined outcome", "Verification")
RISK_HEADERS = ("Dimension", "Level", "Reason", "Required control")
DECISION_HEADERS = ("ID", "Question", "Status", "Resolution")


def _body(text: str, name: str, errors: list[str]) -> str:
    try:
        value = section(text, name)
    except TLCError as exc:
        errors.append(str(exc))
        return ""
    if value is None:
        errors.append(f"missing section: ## {name}")
        return ""
    if not value.strip():
        errors.append(f"empty section: ## {name}")
    return value or ""


def _table(body: str, headers: tuple[str, ...], name: str, errors: list[str]) -> list[dict[str, str]]:
    try:
        return parse_table(body, headers)
    except TLCError as exc:
        errors.append(f"{name}: {exc}")
        return []


def check(path: Path) -> dict[str, Any]:
    text = read_text(path)
    errors: list[str] = []
    warnings: list[str] = []

    objective = _body(text, "Objective", errors)
    risk_body = _body(text, "Risk", errors)
    req_body = _body(text, "Requirements", errors)
    ac_body = _body(text, "Acceptance Criteria", errors)
    baseline = _body(text, "Baseline", errors)
    edge_cases = _body(text, "Edge Cases", errors)
    non_goals = _body(text, "Non-goals", errors)
    decisions_body = _body(text, "Decisions", errors)

    if is_placeholder(objective) or len(objective.split()) < 3:
        errors.append("Objective must state a concrete observable end state")
    if is_placeholder(baseline):
        errors.append("Baseline must contain reproduction evidence or an explicit reason it is not applicable")
    if not edge_cases.strip() or is_placeholder(edge_cases):
        errors.append("Edge Cases must define behavior or explicitly state none with a reason")
    if not non_goals.strip() or is_placeholder(non_goals):
        errors.append("Non-goals must define scope boundaries or explicitly state none")

    risks = _table(risk_body, RISK_HEADERS, "Risk", errors)
    if not risks:
        errors.append("Risk table must contain at least one assessed dimension")
    for index, row in enumerate(risks, 1):
        label = f"risk row {index}"
        if is_placeholder(row["Dimension"]):
            errors.append(f"{label}: missing dimension")
        if row["Level"].casefold() not in {"low", "medium", "high", "critical"}:
            errors.append(f"{label}: Level must be low, medium, high, or critical")
        if is_placeholder(row["Reason"]):
            errors.append(f"{label}: missing reason")
        if is_placeholder(row["Required control"]):
            errors.append(f"{label}: missing required control")

    requirements = _table(req_body, REQ_HEADERS, "Requirements", errors)
    req_ids: set[str] = set()
    must_ids: set[str] = set()
    for index, row in enumerate(requirements, 1):
        rid = row["ID"].strip()
        if not re.fullmatch(r"REQ-[0-9]{3,}", rid):
            errors.append(f"requirement row {index}: invalid ID {rid!r}")
        elif rid in req_ids:
            errors.append(f"duplicate requirement ID: {rid}")
        else:
            req_ids.add(rid)
        if is_placeholder(row["Requirement"]):
            errors.append(f"{rid or f'requirement row {index}'}: requirement is empty or vague")
        if is_placeholder(row["Source"]):
            errors.append(f"{rid or f'requirement row {index}'}: source is missing")
        priority = row["Priority"].casefold()
        if priority not in {"must", "should"}:
            errors.append(f"{rid or f'requirement row {index}'}: Priority must be must or should")
        elif priority == "must" and rid:
            must_ids.add(rid)
    if not requirements:
        errors.append("Requirements table must contain at least one requirement")

    criteria = _table(ac_body, AC_HEADERS, "Acceptance Criteria", errors)
    ac_ids: set[str] = set()
    covered_requirements: set[str] = set()
    verification: dict[str, str] = {}
    for index, row in enumerate(criteria, 1):
        aid = row["ID"].strip()
        if not re.fullmatch(r"AC-[0-9]{3,}", aid):
            errors.append(f"acceptance row {index}: invalid ID {aid!r}")
        elif aid in ac_ids:
            errors.append(f"duplicate acceptance-criterion ID: {aid}")
        else:
            ac_ids.add(aid)
        try:
            linked = parse_ids(row["Requirement IDs"])
        except TLCError as exc:
            errors.append(f"{aid or f'acceptance row {index}'}: {exc}")
            linked = []
        unknown = set(linked) - req_ids
        if unknown:
            errors.append(f"{aid}: unknown requirement IDs: {', '.join(sorted(unknown))}")
        covered_requirements.update(linked)
        for field in ("Given", "When", "Then", "Spec-defined outcome"):
            if is_placeholder(row[field]):
                errors.append(f"{aid or f'acceptance row {index}'}: {field} is empty or non-discriminating")
        mode = row["Verification"].casefold()
        if mode not in {"automated", "manual", "inspection"}:
            errors.append(f"{aid or f'acceptance row {index}'}: Verification must be automated, manual, or inspection")
        elif aid:
            verification[aid] = mode
    if not criteria:
        errors.append("Acceptance Criteria table must contain at least one criterion")
    orphan_must = must_ids - covered_requirements
    if orphan_must:
        errors.append(f"must requirements without acceptance criteria: {', '.join(sorted(orphan_must))}")

    decisions = _table(decisions_body, DECISION_HEADERS, "Decisions", errors)
    decision_ids: set[str] = set()
    if not decisions:
        errors.append("Decisions table must contain a resolved row, including DEC-000 when none exist")
    for index, row in enumerate(decisions, 1):
        did = row["ID"].strip()
        if not re.fullmatch(r"DEC-[0-9]{3,}", did):
            errors.append(f"decision row {index}: invalid ID {did!r}")
        elif did in decision_ids:
            errors.append(f"duplicate decision ID: {did}")
        else:
            decision_ids.add(did)
        status = row["Status"].casefold()
        if status not in {"resolved", "blocking"}:
            errors.append(f"{did or f'decision row {index}'}: Status must be resolved or blocking")
        elif status == "blocking":
            errors.append(f"{did}: blocking product decision remains unresolved")
        if not row["Question"].strip() or not row["Resolution"].strip():
            errors.append(f"{did or f'decision row {index}'}: Question and Resolution are required")

    return {
        "errors": errors,
        "warnings": warnings,
        "requirements": sorted(req_ids),
        "must_requirements": sorted(must_ids),
        "acceptance_criteria": sorted(ac_ids),
        "verification": verification,
        "counts": {"risks": len(risks), "requirements": len(requirements), "acceptance_criteria": len(criteria), "decisions": len(decisions)},
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check TLC V4 spec structure; does not verify behavior")
    parser.add_argument("target", help="spec.md path or feature directory")
    parser.add_argument("--strict", action="store_true", help="treat warnings as failures")
    parser.add_argument("--format", choices=("human", "json"), default="human")
    args = parser.parse_args(argv)
    try:
        path = resolve_artifact(args.target, "spec.md")
        result = check(path)
    except TLCError as exc:
        print(f"SPEC_STRUCTURE_ERROR {exc}", file=sys.stderr)
        return exc.code
    except Exception as exc:  # pragma: no cover - fail closed
        print(f"SPEC_INTERNAL_ERROR {type(exc).__name__}: {exc}", file=sys.stderr)
        return EXIT_INTERNAL

    failed = bool(result["errors"]) or (args.strict and bool(result["warnings"]))
    if args.format == "json":
        print(json.dumps({"status": "FAIL" if failed else "SPEC_STRUCTURE_OK", **result}, ensure_ascii=False, sort_keys=True))
    else:
        for warning in result["warnings"]:
            print(f"WARN {warning}")
        for error in result["errors"]:
            print(f"ERROR {error}")
        counts = result["counts"]
        print(f"INSPECTED risks={counts['risks']} requirements={counts['requirements']} acceptance_criteria={counts['acceptance_criteria']} decisions={counts['decisions']}")
        print("SPEC_STRUCTURE_FAIL" if failed else "SPEC_STRUCTURE_OK")
    return EXIT_FAIL if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
