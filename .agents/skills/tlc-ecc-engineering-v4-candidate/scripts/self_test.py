#!/usr/bin/env python3
"""Adversarial release tests for TLC + ECC V4 deterministic controls."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent


class Counters:
    positive = 0
    negative = 0


def run(script: str, args: list[str], expected: int, counters: Counters, *, positive: bool) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run([sys.executable, str(HERE / script), *args], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != expected:
        print(proc.stdout)
        print(proc.stderr, file=sys.stderr)
        raise AssertionError(f"{script} returned {proc.returncode}; expected {expected}; args={args!r}")
    if positive:
        counters.positive += 1
    else:
        counters.negative += 1
    return proc


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def git(repo: Path, *args: str) -> None:
    proc = subprocess.run(["git", "-C", str(repo), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode:
        raise AssertionError(proc.stderr.decode("utf-8", errors="replace"))


def digest(path: Path) -> tuple[str, int]:
    return hashlib.sha256(path.read_bytes()).hexdigest(), path.stat().st_mtime_ns


def main() -> int:
    counters = Counters()
    with tempfile.TemporaryDirectory(prefix="tlc-v4-selftest-") as raw:
        repo = Path(raw) / "repo"
        repo.mkdir()
        git(repo, "init", "-q")
        git(repo, "config", "user.email", "self-test@example.invalid")
        git(repo, "config", "user.name", "TLC Self Test")
        feature = repo / ".specs" / "features" / "demo"
        python = sys.executable

        spec = """# Demo Spec

## Objective
Return the stored integer exactly to local callers.

## Risk
| Dimension | Level | Reason | Required control |
| --- | --- | --- | --- |
| reversibility | low | local pure function | focused executable test |

## Requirements
| ID | Requirement | Source | Priority |
| --- | --- | --- | --- |
| REQ-001 | Return the stored integer unchanged | user contract | must |

## Acceptance Criteria
| ID | Requirement IDs | Given | When | Then | Spec-defined outcome | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| AC-001 | REQ-001 | stored integer seven | value is requested | return the stored integer | integer value 7 | automated |

## Baseline
The local test returns successfully before any mutation.

## Edge Cases
- A changed stored integer must change the returned value.

## Non-goals
- No persistence or network behavior.

## Decisions
| ID | Question | Status | Resolution |
| --- | --- | --- | --- |
| DEC-000 | Are product decisions unresolved? | resolved | No unresolved product decisions. |
"""
        tasks = f"""# Demo Tasks

## Gate Registry
| Gate ID | Level | Command | Source |
| --- | --- | --- | --- |
| G-CLOSE | closure | {python} test_value.py | test_value.py:1 |

## Task Breakdown
### T-001: preserve the exact stored value
**Requirements**: REQ-001
**Acceptance**: AC-001
**Depends on**: none
**Gate IDs**: G-CLOSE
**Files**: app.py, test_value.py
**Security**: none — local pure function

**Done when**:
- [ ] The exact value is asserted.
- [ ] The closure gate has a current receipt.
"""
        trace = {
            "schema": "tlc.traceability/v2",
            "feature": "demo",
            "spec": "spec.md",
            "tasks": "tasks.md",
            "gates": {"G-CLOSE": {"level": "closure", "argv": [python, "test_value.py"], "cwd": ".", "source": "test_value.py:1"}},
            "mutations": {
                "M-001": {
                    "ac_ids": ["AC-001"],
                    "patch": ".specs/features/demo/mutations/M-001.patch",
                    "baseline_argv": [python, "test_value.py"],
                    "viability_argv": [python, "-m", "py_compile", "app.py"],
                    "detector_argv": [python, "test_value.py"],
                    "expected_detector_exit_codes": [1],
                    "cwd": ".",
                }
            },
            "criteria": [{"id": "AC-001", "tasks": ["T-001"], "tests": [{"path": "test_value.py", "line": 4, "symbol": "test_exact_outcome"}], "gates": ["G-CLOSE"], "mutations": ["M-001"]}],
            "closure_gates": ["G-CLOSE"],
            "discrimination": {"required": True},
        }
        write(feature / "spec.md", spec)
        write(feature / "tasks.md", tasks)
        write(feature / "traceability.json", json.dumps(trace, indent=2) + "\n")
        write(repo / ".gitignore", "__pycache__/\n*.pyc\n")
        write(repo / "app.py", "def value():\n    return 7\n")
        write(repo / "test_value.py", "from app import value\n\ndef test_exact_outcome():\n    assert value() == 7\n\ntest_exact_outcome()\n")
        write(feature / "mutations" / "M-001.patch", """diff --git a/app.py b/app.py
--- a/app.py
+++ b/app.py
@@ -1,2 +1,2 @@
 def value():
-    return 7
+    return 8
""")
        git(repo, "add", ".")
        git(repo, "commit", "-qm", "test: create fixture")

        run("validate_spec.py", [str(feature)], 0, counters, positive=True)
        run("validate_tasks.py", [str(feature), "--spec", str(feature / "spec.md"), "--repo", str(repo)], 0, counters, positive=True)

        write(feature / "validation.md", "**Result**: PASS\nTests passed; mutation killed.\n")
        run("validate_completion.py", [str(feature), "--repo", str(repo)], 1, counters, positive=False)

        run("run_gate.py", ["--repo", str(repo), "--feature", str(feature), "--id", "G-CLOSE", "--", python, "test_value.py"], 0, counters, positive=True)
        run("run_mutation.py", ["--repo", str(repo), "--feature", str(feature), "--id", "M-001", "--acknowledge-reviewed-manifest"], 0, counters, positive=True)
        run("validate_completion.py", [str(feature), "--repo", str(repo)], 0, counters, positive=True)

        bad_empty = repo / "bad-empty.md"
        write(bad_empty, spec.replace("Return the stored integer exactly to local callers.", ""))
        run("validate_spec.py", [str(bad_empty)], 1, counters, positive=False)
        bad_orphan = repo / "bad-orphan.md"
        write(bad_orphan, spec.replace("| AC-001 | REQ-001 |", "| AC-001 | REQ-999 |"))
        run("validate_spec.py", [str(bad_orphan)], 1, counters, positive=False)
        fenced = repo / "bad-fenced.md"
        write(fenced, "# Fake\n\n```markdown\n" + spec + "\n```\n")
        run("validate_spec.py", [str(fenced)], 1, counters, positive=False)
        bad_tasks = repo / "bad-tasks.md"
        write(bad_tasks, tasks.replace("**Depends on**: none", "**Depends on**: T-999"))
        run("validate_tasks.py", [str(bad_tasks), "--spec", str(feature / "spec.md"), "--repo", str(repo)], 1, counters, positive=False)

        original_app = (repo / "app.py").read_bytes()
        (repo / "app.py").write_text("def value():\n    return 9\n", encoding="utf-8")
        run("validate_completion.py", [str(feature), "--repo", str(repo)], 4, counters, positive=False)
        (repo / "app.py").write_bytes(original_app)

        gate_receipt = next((feature / "evidence").glob("gate-*.json"))
        original_receipt = gate_receipt.read_bytes()
        tampered = json.loads(original_receipt)
        tampered["outcome"] = "GATE_FAILED"
        gate_receipt.write_text(json.dumps(tampered), encoding="utf-8")
        run("validate_completion.py", [str(feature), "--repo", str(repo)], 4, counters, positive=False)
        gate_receipt.write_bytes(original_receipt)

        run("lessons.py", ["--root", str(repo), "init"], 0, counters, positive=True)
        source = gate_receipt.relative_to(repo).as_posix()
        processes = []
        for index in range(50):
            processes.append(
                subprocess.Popen(
                    [sys.executable, str(HERE / "lessons.py"), "--root", str(repo), "add", "--feature", f"F-{index:03d}", "--run-id", f"RUN-{index:03d}", "--signal", "correction", "--source", source, "--text", "Preserve observed contract evidence"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
            )
        failed = []
        for process in processes:
            out, err = process.communicate(timeout=30)
            if process.returncode != 0:
                failed.append((process.returncode, out, err))
        if failed:
            raise AssertionError(f"concurrent lessons writes failed: {failed[:2]!r}")
        counters.positive += 1
        status = run("lessons.py", ["--root", str(repo), "status"], 0, counters, positive=True)
        if json.loads(status.stdout)["events"] != 50:
            raise AssertionError("concurrent lesson events were lost")
        lesson_store = repo / ".specs" / "lessons.json"
        before_list = digest(lesson_store)
        run("lessons.py", ["--root", str(repo), "list", "--status", "eligible"], 0, counters, positive=True)
        if digest(lesson_store) != before_list:
            raise AssertionError("lessons list mutated canonical state")
        for index, text in enumerate(("ação", "aço"), 50):
            run("lessons.py", ["--root", str(repo), "add", "--feature", f"F-{index:03d}", "--run-id", f"RUN-{index:03d}", "--signal", "correction", "--source", source, "--text", text], 0, counters, positive=True)
        data = json.loads(lesson_store.read_text(encoding="utf-8"))
        if len(data["rules"]) != 3 or any(rule["status"] == "confirmed" for rule in data["rules"]):
            raise AssertionError("Unicode rules collided or a rule auto-confirmed")
        eligible = next(rule for rule in data["rules"] if rule["text"] == "Preserve observed contract evidence")
        run("lessons.py", ["--root", str(repo), "review", "--id", eligible["id"], "--decision", "confirm", "--reason", "Independent recurring corrections reviewed", "--reviewer", "self-test"], 0, counters, positive=True)

        with tempfile.TemporaryDirectory(prefix="tlc-symlink-") as link_raw:
            link_repo = Path(link_raw) / "repo"
            link_repo.mkdir()
            git(link_repo, "init", "-q")
            (link_repo / ".specs").mkdir()
            victim = Path(link_raw) / "victim.txt"
            victim.write_text("protected", encoding="utf-8")
            os.symlink(victim, link_repo / ".specs" / "lessons.json")
            run("lessons.py", ["--root", str(link_repo), "status"], 2, counters, positive=False)
            if victim.read_text(encoding="utf-8") != "protected":
                raise AssertionError("symlink victim was modified")

    print(f"SELF_TEST VERIFIED positive_controls={counters.positive} negative_controls={counters.negative} concurrency_writes=50")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
