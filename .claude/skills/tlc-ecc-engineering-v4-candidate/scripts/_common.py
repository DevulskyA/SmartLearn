#!/usr/bin/env python3
"""Shared fail-closed primitives for TLC + ECC V4 tooling."""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Iterable

EXIT_FAIL = 1
EXIT_USAGE = 2
EXIT_INFRA = 3
EXIT_STALE = 4
EXIT_INTERNAL = 70

ID = re.compile(r"^[A-Z][A-Z0-9]*-[0-9]{3,}$")
PLACEHOLDER = re.compile(
    r"(?:\[[^]]+\]|\b(?:todo|tbd|fixme|placeholder|works?|correct|as expected|some|something|n/?a)\b)",
    re.IGNORECASE,
)
GENERATED_PATTERNS = (
    re.compile(r"^\.specs/features/[^/]+/evidence(?:/|$)"),
    re.compile(r"^\.specs/features/[^/]+/validation\.(?:md|json)$"),
    re.compile(r"^\.specs/runs(?:/|$)"),
    re.compile(r"^\.specs/locks(?:/|$)"),
    re.compile(r"^\.specs/(?:lessons\.json|LESSONS\.md|\.lessons\.lock)(?:/|$)"),
)


class TLCError(Exception):
    def __init__(self, message: str, code: int = EXIT_USAGE):
        super().__init__(message)
        self.code = code


def canonical_json(data: Any) -> bytes:
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_bytes(path: Path, limit: int | None = None) -> bytes:
    try:
        if path.is_symlink():
            raise TLCError(f"refusing symlink: {path}")
        data = path.read_bytes()
    except TLCError:
        raise
    except OSError as exc:
        raise TLCError(f"cannot read {path}: {exc}") from exc
    if limit is not None and len(data) > limit:
        raise TLCError(f"file exceeds {limit} bytes: {path}")
    return data


def read_text(path: Path, limit: int = 2_000_000) -> str:
    data = read_bytes(path, limit)
    try:
        return data.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise TLCError(f"invalid UTF-8 in {path}: {exc}") from exc


def read_json(path: Path, limit: int = 2_000_000) -> Any:
    try:
        return json.loads(read_text(path, limit))
    except TLCError:
        raise
    except json.JSONDecodeError as exc:
        raise TLCError(f"invalid JSON in {path}: {exc}") from exc


def run_git(repo: Path, *args: str, check: bool = True) -> bytes:
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo), *args],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except OSError as exc:
        raise TLCError(f"cannot execute git: {exc}", EXIT_INFRA) from exc
    if check and proc.returncode != 0:
        message = proc.stderr.decode("utf-8", errors="replace").strip()
        raise TLCError(f"git {' '.join(args)} failed: {message}", EXIT_INFRA)
    return proc.stdout


def repo_root(path: str | Path) -> Path:
    candidate = Path(path).expanduser().absolute()
    if not candidate.exists():
        raise TLCError(f"repository path does not exist: {candidate}")
    raw = run_git(candidate, "rev-parse", "--show-toplevel").decode("utf-8", errors="strict").strip()
    root = Path(raw).resolve(strict=True)
    if not root.is_dir():
        raise TLCError(f"not a repository directory: {root}")
    return root


def _commonpath(root: Path, target: Path) -> bool:
    try:
        return os.path.commonpath((str(root), str(target))) == str(root)
    except ValueError:
        return False


def safe_path(root: Path, target: str | Path, *, must_exist: bool = False, reject_symlinks: bool = True) -> Path:
    root = root.resolve(strict=True)
    raw = Path(target).expanduser()
    candidate = raw if raw.is_absolute() else root / raw
    candidate = Path(os.path.abspath(candidate))
    if not _commonpath(root, candidate):
        raise TLCError(f"path escapes repository: {target}")
    current = root
    for part in candidate.relative_to(root).parts:
        current = current / part
        if current.exists() or current.is_symlink():
            try:
                mode = current.lstat().st_mode
            except OSError as exc:
                raise TLCError(f"cannot inspect path {current}: {exc}") from exc
            if reject_symlinks and stat.S_ISLNK(mode):
                raise TLCError(f"refusing symlink component: {current}")
    if must_exist and not candidate.exists():
        raise TLCError(f"path does not exist: {candidate}")
    return candidate


def ensure_directory(root: Path, target: Path) -> None:
    root = root.resolve(strict=True)
    target = safe_path(root, target)
    current = root
    for part in target.relative_to(root).parts:
        current = current / part
        if current.exists() or current.is_symlink():
            mode = current.lstat().st_mode
            if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                raise TLCError(f"unsafe directory component: {current}")
        else:
            current.mkdir(mode=0o700)


def atomic_write(root: Path, target: Path, data: bytes, mode: int = 0o600) -> None:
    root = root.resolve(strict=True)
    target = safe_path(root, target)
    ensure_directory(root, target.parent)
    if target.exists() or target.is_symlink():
        existing = target.lstat().st_mode
        if stat.S_ISLNK(existing) or not stat.S_ISREG(existing):
            raise TLCError(f"refusing non-regular target: {target}")
    fd, tmp_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=str(target.parent))
    tmp = Path(tmp_name)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb", closefd=True) as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        if target.parent.is_symlink():
            raise TLCError(f"target parent became a symlink: {target.parent}")
        os.replace(tmp, target)
        try:
            dir_fd = os.open(target.parent, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except OSError:
            pass
    finally:
        if tmp.exists():
            tmp.unlink()


def resolve_artifact(target: str | Path, filename: str) -> Path:
    path = Path(target).expanduser().absolute()
    if path.is_file():
        return path
    candidate = path / filename
    if path.is_dir() and candidate.is_file():
        return candidate
    raise TLCError(f"cannot locate {filename} from {target!r}")


def strip_fenced_code(text: str) -> str:
    lines: list[str] = []
    fence: str | None = None
    for line in text.splitlines():
        match = re.match(r"^\s*(`{3,}|~{3,})", line)
        if match:
            marker = match.group(1)[0]
            if fence is None:
                fence = marker
            elif fence == marker:
                fence = None
            lines.append("")
        elif fence is None:
            lines.append(line)
        else:
            lines.append("")
    return "\n".join(lines)


def section(text: str, heading: str, level: int = 2) -> str | None:
    clean = strip_fenced_code(text)
    lines = clean.splitlines()
    pattern = re.compile(rf"^{'#' * level}\s+{re.escape(heading)}\s*$", re.IGNORECASE)
    start: int | None = None
    for index, line in enumerate(lines):
        if pattern.match(line):
            if start is not None:
                raise TLCError(f"duplicate section: {heading}")
            start = index + 1
    if start is None:
        return None
    end = len(lines)
    stop = re.compile(rf"^#{{1,{level}}}\s+")
    for index in range(start, len(lines)):
        if stop.match(lines[index]):
            end = index
            break
    return "\n".join(lines[start:end]).strip()


def _split_table_row(line: str) -> list[str]:
    line = line.strip()
    if not line.startswith("|") or not line.endswith("|"):
        raise TLCError(f"malformed Markdown table row: {line[:120]}")
    cells: list[str] = []
    buf: list[str] = []
    escaped = False
    in_code = False
    for char in line[1:-1]:
        if escaped:
            buf.append(char)
            escaped = False
        elif char == "\\":
            escaped = True
            buf.append(char)
        elif char == "`":
            in_code = not in_code
            buf.append(char)
        elif char == "|" and not in_code:
            cells.append("".join(buf).strip())
            buf = []
        else:
            buf.append(char)
    if escaped:
        buf.append("\\")
    cells.append("".join(buf).strip())
    return cells


def parse_table(body: str, expected_headers: Iterable[str]) -> list[dict[str, str]]:
    lines = [line for line in body.splitlines() if line.strip()]
    start = next((i for i, line in enumerate(lines) if line.lstrip().startswith("|")), None)
    if start is None or start + 1 >= len(lines):
        raise TLCError("missing Markdown table")
    table_lines: list[str] = []
    for line in lines[start:]:
        if not line.lstrip().startswith("|"):
            break
        table_lines.append(line)
    if len(table_lines) < 2:
        raise TLCError("table needs a header and separator")
    headers = _split_table_row(table_lines[0])
    expected = list(expected_headers)
    if [h.casefold() for h in headers] != [h.casefold() for h in expected]:
        raise TLCError(f"unexpected table headers: {headers!r}; expected {expected!r}")
    separator = _split_table_row(table_lines[1])
    if len(separator) != len(headers) or any(not re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in separator):
        raise TLCError("invalid Markdown table separator")
    rows: list[dict[str, str]] = []
    for line in table_lines[2:]:
        cells = _split_table_row(line)
        if len(cells) != len(headers):
            raise TLCError(f"table row has {len(cells)} cells; expected {len(headers)}")
        rows.append(dict(zip(headers, cells)))
    return rows


def parse_ids(value: str, *, allow_none: bool = False) -> list[str]:
    normalized = value.strip()
    if allow_none and normalized.casefold() == "none":
        return []
    parts = [part.strip() for part in normalized.split(",")]
    if not parts or any(not part or not ID.fullmatch(part) for part in parts):
        raise TLCError(f"invalid ID list: {value!r}")
    if len(parts) != len(set(parts)):
        raise TLCError(f"duplicate ID in list: {value!r}")
    return parts


def is_placeholder(value: str) -> bool:
    stripped = value.strip()
    return not stripped or bool(PLACEHOLDER.search(stripped))


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_hashes(feature: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for name in ("spec.md", "tasks.md", "traceability.json"):
        path = feature / name
        if not path.is_file() or path.is_symlink():
            raise TLCError(f"missing or unsafe governed artifact: {path}")
        result[name] = file_hash(path)
    return result


def _generated(rel: str) -> bool:
    return any(pattern.search(rel) for pattern in GENERATED_PATTERNS)


def project_snapshot(repo: Path) -> dict[str, Any]:
    repo = repo_root(repo)
    head = run_git(repo, "rev-parse", "HEAD").decode("ascii", errors="strict").strip()
    branch = run_git(repo, "symbolic-ref", "--quiet", "--short", "HEAD", check=False).decode(
        "utf-8", errors="replace"
    ).strip() or "DETACHED"
    raw = run_git(repo, "ls-files", "-co", "--exclude-standard", "-z")
    names = sorted({name for name in raw.decode("utf-8", errors="surrogateescape").split("\0") if name})
    digest = hashlib.sha256()
    count = 0
    for rel in names:
        rel_posix = Path(rel).as_posix()
        if _generated(rel_posix):
            continue
        path = repo / rel
        try:
            info = path.lstat()
        except FileNotFoundError:
            continue
        digest.update(rel_posix.encode("utf-8", errors="surrogateescape") + b"\0")
        digest.update(oct(stat.S_IMODE(info.st_mode)).encode("ascii") + b"\0")
        if stat.S_ISLNK(info.st_mode):
            digest.update(b"L\0" + os.readlink(path).encode("utf-8", errors="surrogateescape"))
        elif stat.S_ISREG(info.st_mode):
            digest.update(b"F\0")
            with path.open("rb") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(chunk)
        elif stat.S_ISDIR(info.st_mode):
            gitlink = run_git(repo, "ls-files", "-s", "--", rel, check=False)
            digest.update(b"D\0" + gitlink)
        else:
            raise TLCError(f"unsupported governed file type: {path}")
        digest.update(b"\0")
        count += 1
    return {"head": head, "branch": branch, "fingerprint_sha256": digest.hexdigest(), "files": count}


def add_integrity(data: dict[str, Any]) -> dict[str, Any]:
    payload = dict(data)
    payload.pop("integrity", None)
    payload["integrity"] = {"algorithm": "sha256", "digest": sha256_bytes(canonical_json(payload))}
    return payload


def verify_integrity(data: dict[str, Any]) -> bool:
    integrity = data.get("integrity")
    if not isinstance(integrity, dict) or integrity.get("algorithm") != "sha256":
        return False
    payload = dict(data)
    payload.pop("integrity", None)
    return integrity.get("digest") == sha256_bytes(canonical_json(payload))


def write_json_atomic(repo: Path, target: Path, data: dict[str, Any]) -> None:
    encoded = json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2).encode("utf-8") + b"\n"
    atomic_write(repo, target, encoded)
