#!/usr/bin/env python3
"""Transactional, review-gated lessons store for TLC + ECC V4."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import os
import socket
import stat
import sys
import time
import unicodedata
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from _common import EXIT_FAIL, EXIT_INTERNAL, TLCError, atomic_write, canonical_json, read_json, repo_root, safe_path, sha256_bytes, verify_integrity, write_json_atomic

SCHEMA = "tlc.lessons/v2"
SIGNALS = {"ac_gap", "surviving_mutant", "spec_precision_gap", "spec_deviation", "gate_fail", "correction"}
DECISIONS = {"confirm", "reject", "quarantine"}


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def clean(value: str, label: str, limit: int = 1000) -> str:
    normalized = unicodedata.normalize("NFC", value).strip()
    if not normalized or len(normalized) > limit or any(ord(char) < 32 and char not in "\t" for char in normalized):
        raise TLCError(f"invalid {label}")
    return normalized


def rule_key(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).casefold().strip()
    return sha256_bytes(normalized.encode("utf-8"))


def paths(repo: Path) -> tuple[Path, Path, Path]:
    return repo / ".specs" / "lessons.json", repo / ".specs" / "LESSONS.md", repo / ".specs" / ".lessons.lock"


def empty_store() -> dict[str, Any]:
    data = {"schema": SCHEMA, "generation": "", "eligibility_threshold": 2, "rules": [], "events": [], "reviews": []}
    return seal(data)


def seal(data: dict[str, Any]) -> dict[str, Any]:
    payload = dict(data)
    payload["generation"] = ""
    result = dict(data)
    result["generation"] = sha256_bytes(canonical_json(payload))
    return result


def validate_store(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        raise TLCError(f"lessons schema must be {SCHEMA}")
    for key in ("rules", "events", "reviews"):
        if not isinstance(data.get(key), list):
            raise TLCError(f"lessons {key} must be an array")
    if not isinstance(data.get("eligibility_threshold"), int) or data["eligibility_threshold"] < 2:
        raise TLCError("eligibility_threshold must be an integer >= 2")
    expected = seal(data)["generation"]
    if data.get("generation") != expected:
        raise TLCError("lessons generation digest is invalid")
    for key in ("rules", "events", "reviews"):
        ids = [item.get("id") for item in data[key] if isinstance(item, dict)]
        if len(ids) != len(data[key]) or any(not isinstance(value, str) or not value for value in ids) or len(ids) != len(set(ids)):
            raise TLCError(f"lessons {key} contain invalid or duplicate IDs")
    return data


def load_store(repo: Path) -> dict[str, Any]:
    store, _, _ = paths(repo)
    if not store.exists():
        return empty_store()
    return validate_store(read_json(safe_path(repo, store, must_exist=True)))


@contextmanager
def locked(repo: Path, timeout: float = 15.0) -> Iterator[None]:
    _, _, lock = paths(repo)
    safe_path(repo, lock)
    lock.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + timeout
    while True:
        try:
            lock.mkdir(mode=0o700)
            break
        except FileExistsError:
            try:
                mode = lock.lstat().st_mode
            except FileNotFoundError:
                continue
            if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                raise TLCError(f"unsafe lessons lock: {lock}")
            if time.monotonic() >= deadline:
                raise TLCError("lessons lock is held; no automatic takeover", EXIT_FAIL)
            time.sleep(0.025)
    try:
        owner = {
            "pid": os.getpid(),
            "host": socket.gethostname(),
            "created_utc": utc_now(),
            "nonce": str(uuid.uuid4()),
        }
        atomic_write(repo, lock / "owner.json", json.dumps(owner, sort_keys=True).encode("utf-8") + b"\n")
        yield
    finally:
        try:
            owner_path = lock / "owner.json"
            if owner_path.exists() and not owner_path.is_symlink():
                owner_path.unlink()
            lock.rmdir()
        except OSError:
            pass


def render_markdown(data: dict[str, Any]) -> str:
    rules = {rule["id"]: rule for rule in data["rules"]}
    lines = [
        "# Grounded Lessons",
        "",
        "> Derived from `.specs/lessons.json`; regenerate with the bundled tool.",
        f"> generation: `{data['generation']}`",
        "",
    ]
    for status in ("confirmed", "eligible", "candidate", "rejected", "quarantined"):
        lines.extend((f"## {status.title()}", ""))
        selected = sorted((rule for rule in rules.values() if rule.get("status") == status), key=lambda item: item["id"])
        if not selected:
            lines.extend(("_none_", ""))
            continue
        for rule in selected:
            text = html.escape(str(rule["text"]), quote=False).replace("|", "&#124;")
            scope = html.escape(str(rule.get("scope", "")), quote=False).replace("|", "&#124;")
            event_count = sum(1 for event in data["events"] if event.get("rule_id") == rule["id"])
            lines.extend((f"### {rule['id']}", f"- rule: {text}", f"- scope: {scope or 'unspecified'}", f"- events: {event_count}", f"- updated: {rule['updated_utc']}", ""))
    return "\n".join(lines)


def commit(repo: Path, data: dict[str, Any]) -> None:
    data = seal(data)
    validate_store(data)
    store, rendered, _ = paths(repo)
    write_json_atomic(repo, store, data)
    atomic_write(repo, rendered, render_markdown(data).encode("utf-8"))


def receipt_reference(repo: Path, source: str) -> tuple[str, str]:
    path = safe_path(repo, source, must_exist=True)
    receipt = read_json(path)
    if not isinstance(receipt, dict) or not verify_integrity(receipt):
        raise TLCError("lesson source must be an integrity-valid TLC receipt")
    if receipt.get("schema") not in {"tlc.gate-receipt/v2", "tlc.mutation-receipt/v2"}:
        raise TLCError("lesson source must be a TLC gate or mutation receipt")
    return path.relative_to(repo).as_posix(), receipt["integrity"]["digest"]


def cmd_init(args: argparse.Namespace, repo: Path) -> int:
    with locked(repo):
        data = load_store(repo)
        commit(repo, data)
    print("LESSONS_INITIALIZED")
    return 0


def cmd_status(args: argparse.Namespace, repo: Path) -> int:
    data = load_store(repo)
    counts: dict[str, int] = {}
    for rule in data["rules"]:
        counts[rule["status"]] = counts.get(rule["status"], 0) + 1
    print(json.dumps({"generation": data["generation"], "rules": counts, "events": len(data["events"]), "reviews": len(data["reviews"])}, sort_keys=True))
    return 0


def cmd_list(args: argparse.Namespace, repo: Path) -> int:
    data = load_store(repo)
    for rule in data["rules"]:
        if args.status and rule.get("status") != args.status:
            continue
        if args.scope and rule.get("scope") != args.scope:
            continue
        print(f"{rule['id']}\t{rule['status']}\t{rule['text']}")
    return 0


def cmd_add(args: argparse.Namespace, repo: Path) -> int:
    feature = clean(args.feature, "feature", 200)
    run_id = clean(args.run_id, "run-id", 200)
    signal = clean(args.signal, "signal", 80)
    if signal not in SIGNALS:
        raise TLCError(f"unsupported signal: {signal}")
    text = clean(args.text, "text")
    scope = clean(args.scope, "scope", 300) if args.scope else ""
    source, source_digest = receipt_reference(repo, args.source)
    with locked(repo):
        data = load_store(repo)
        key = rule_key(text)
        rule = next((item for item in data["rules"] if item.get("key") == key and item.get("text") == text), None)
        now = utc_now()
        if rule is None:
            rule = {"id": f"L-{uuid.uuid4().hex[:12]}", "key": key, "text": text, "scope": scope, "status": "candidate", "created_utc": now, "updated_utc": now}
            data["rules"].append(rule)
        event_identity = (rule["id"], feature, run_id, source_digest)
        if any((event.get("rule_id"), event.get("feature_id"), event.get("run_id"), event.get("source_digest")) == event_identity for event in data["events"]):
            raise TLCError("duplicate lesson event")
        event = {
            "id": f"E-{uuid.uuid4().hex[:12]}",
            "rule_id": rule["id"],
            "feature_id": feature,
            "run_id": run_id,
            "signal": signal,
            "source": source,
            "source_digest": source_digest,
            "created_utc": now,
        }
        data["events"].append(event)
        independent = {(item["feature_id"], item["run_id"], item["source_digest"]) for item in data["events"] if item.get("rule_id") == rule["id"]}
        if rule["status"] == "candidate" and len(independent) >= data["eligibility_threshold"]:
            rule["status"] = "eligible"
        rule["updated_utc"] = now
        commit(repo, data)
    print(event["id"])
    return 0


def cmd_review(args: argparse.Namespace, repo: Path) -> int:
    decision = clean(args.decision, "decision", 40)
    if decision not in DECISIONS:
        raise TLCError(f"unsupported review decision: {decision}")
    reason = clean(args.reason, "reason")
    reviewer = clean(args.reviewer, "reviewer", 200)
    with locked(repo):
        data = load_store(repo)
        rule = next((item for item in data["rules"] if item["id"] == args.id), None)
        if rule is None:
            raise TLCError(f"unknown lesson rule: {args.id}")
        if decision == "confirm" and rule["status"] != "eligible":
            raise TLCError("only an eligible rule can be confirmed")
        now = utc_now()
        data["reviews"].append({"id": f"R-{uuid.uuid4().hex[:12]}", "rule_id": rule["id"], "decision": decision, "reason": reason, "reviewer": reviewer, "created_utc": now})
        rule["status"] = {"confirm": "confirmed", "reject": "rejected", "quarantine": "quarantined"}[decision]
        rule["updated_utc"] = now
        commit(repo, data)
    print(rule["status"].upper())
    return 0


def cmd_render(args: argparse.Namespace, repo: Path) -> int:
    with locked(repo):
        data = load_store(repo)
        _, rendered, _ = paths(repo)
        atomic_write(repo, rendered, render_markdown(data).encode("utf-8"))
    print("LESSONS_RENDERED")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Manage review-gated TLC lessons")
    parser.add_argument("--root", default=".")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    sub.add_parser("status")
    listing = sub.add_parser("list")
    listing.add_argument("--status", default="confirmed")
    listing.add_argument("--scope", default="")
    add = sub.add_parser("add")
    add.add_argument("--feature", required=True)
    add.add_argument("--run-id", required=True)
    add.add_argument("--signal", required=True)
    add.add_argument("--source", required=True)
    add.add_argument("--text", required=True)
    add.add_argument("--scope", default="")
    review = sub.add_parser("review")
    review.add_argument("--id", required=True)
    review.add_argument("--decision", required=True)
    review.add_argument("--reason", required=True)
    review.add_argument("--reviewer", required=True)
    sub.add_parser("render")
    args = parser.parse_args(argv)
    try:
        repo = repo_root(args.root)
        return globals()[f"cmd_{args.command}"](args, repo)
    except TLCError as exc:
        print(f"LESSONS_ERROR {exc}", file=sys.stderr)
        return exc.code
    except Exception as exc:  # pragma: no cover
        print(f"LESSONS_INTERNAL_ERROR {type(exc).__name__}: {exc}", file=sys.stderr)
        return EXIT_INTERNAL


if __name__ == "__main__":
    raise SystemExit(main())
