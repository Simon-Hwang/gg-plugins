from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    import yaml
except ImportError:  # pragma: no cover - reported by load_yaml
    yaml = None


ACTIVE_FINDING_STATES = {
    "open",
    "acknowledged",
    "fixing",
    "pending-validation",
    "pending-review",
    "disputed",
    "reopened",
}
CLAIM_STATUSES = {"active", "superseded", "deprecated"}
VERDICTS = {
    "static-supported",
    "static-contradicted",
    "runtime-supported",
    "runtime-contradicted",
    "partial",
    "unknown",
    "requires-runtime-evidence",
    "disputed",
}


class ValidationFailure(ValueError):
    pass


def _split_flow(value: str) -> list[str]:
    parts: list[str] = []
    start = 0
    depth = 0
    quote: str | None = None
    for index, char in enumerate(value):
        if quote:
            if char == quote and (index == 0 or value[index - 1] != "\\"):
                quote = None
        elif char in {"'", '"'}:
            quote = char
        elif char in "[{":
            depth += 1
        elif char in "]}":
            depth -= 1
        elif char == "," and depth == 0:
            parts.append(value[start:index].strip())
            start = index + 1
    parts.append(value[start:].strip())
    return [part for part in parts if part]


def _yaml_scalar(value: str) -> Any:
    value = value.strip()
    if not value:
        return None
    if value.startswith("[") and value.endswith("]"):
        return [_yaml_scalar(part) for part in _split_flow(value[1:-1])]
    if value.startswith("{") and value.endswith("}"):
        result: dict[str, Any] = {}
        for part in _split_flow(value[1:-1]):
            key, separator, item = part.partition(":")
            if not separator:
                raise ValidationFailure(f"invalid flow mapping item {part!r}")
            result[key.strip().strip("'\"")] = _yaml_scalar(item)
        return result
    if value[0:1] in {"'", '"'} and value[-1:] == value[0]:
        return value[1:-1]
    lowered = value.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    if lowered in {"null", "~"}:
        return None
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(r"-?\d+\.\d+", value):
        return float(value)
    return value


def _minimal_yaml_load(text: str) -> dict[str, Any]:
    lines: list[tuple[int, str]] = []
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        if indent % 2:
            raise ValidationFailure("YAML indentation must use multiples of two spaces")
        lines.append((indent, raw.strip()))

    def parse_block(index: int, indent: int) -> tuple[Any, int]:
        if index >= len(lines) or lines[index][0] < indent:
            return {}, index
        is_list = lines[index][1].startswith("- ")
        container: Any = [] if is_list else {}
        while index < len(lines):
            current_indent, content = lines[index]
            if current_indent < indent:
                break
            if current_indent > indent:
                raise ValidationFailure(f"unexpected indentation near {content!r}")
            if is_list:
                if not content.startswith("- "):
                    break
                item = content[2:].strip()
                index += 1
                if not item:
                    value, index = parse_block(index, indent + 2)
                    container.append(value)
                elif ":" in item:
                    key, value_text = item.split(":", 1)
                    mapping = {key.strip(): _yaml_scalar(value_text)}
                    if index < len(lines) and lines[index][0] > indent:
                        tail, index = parse_block(index, indent + 2)
                        if not isinstance(tail, dict):
                            raise ValidationFailure("list mapping continuation must be an object")
                        mapping.update(tail)
                    container.append(mapping)
                else:
                    container.append(_yaml_scalar(item))
            else:
                if content.startswith("- ") or ":" not in content:
                    break
                key, value_text = content.split(":", 1)
                index += 1
                if value_text.strip():
                    container[key.strip()] = _yaml_scalar(value_text)
                elif index < len(lines) and lines[index][0] > indent:
                    value, index = parse_block(index, indent + 2)
                    container[key.strip()] = value
                else:
                    container[key.strip()] = {}
        return container, index

    result, consumed = parse_block(0, lines[0][0] if lines else 0)
    if consumed != len(lines) or not isinstance(result, dict):
        raise ValidationFailure("expected a top-level YAML object")
    return result


def load_yaml(path: Path) -> dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8")
        value = yaml.safe_load(text) if yaml is not None else _minimal_yaml_load(text)
    except Exception as exc:
        raise ValidationFailure(f"{path}: invalid YAML: {exc}") from exc
    if not isinstance(value, dict):
        raise ValidationFailure(f"{path}: expected a YAML object")
    return value


def canonical_fingerprint(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def validate_profile(profile: dict[str, Any], path: Path | None = None) -> list[str]:
    prefix = f"{path}: " if path else ""
    errors: list[str] = []
    for field in ("profile_version", "profile_id", "document_roots", "repository_roots", "finding_sink"):
        if field not in profile:
            errors.append(f"{prefix}missing required field {field}")
    for field in ("document_roots", "source_roots", "repository_roots", "repository_resolvers"):
        if field in profile and not isinstance(profile[field], list):
            errors.append(f"{prefix}{field} must be a list")
    if profile.get("profile_version") != "1":
        errors.append(f"{prefix}profile_version must be \"1\"")
    profile_id = profile.get("profile_id")
    if profile_id and not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,62}", str(profile_id)):
        errors.append(f"{prefix}profile_id must be lower-case hyphen-case")
    return errors


def validate_claim(claim: dict[str, Any], path: Path | None = None) -> list[str]:
    prefix = f"{path}: " if path else ""
    errors: list[str] = []
    required = ("schema_version", "id", "revision", "statement", "fact_type", "risk", "scope", "source")
    for field in required:
        if field not in claim:
            errors.append(f"{prefix}missing required field {field}")
    if not isinstance(claim.get("revision"), int) or claim.get("revision", 0) < 1:
        errors.append(f"{prefix}revision must be a positive integer")
    status = claim.get("status", "active")
    if status not in CLAIM_STATUSES:
        errors.append(f"{prefix}invalid status {status!r}")
    if status == "superseded" and not claim.get("superseded_by"):
        errors.append(f"{prefix}superseded claim requires superseded_by")
    if status == "deprecated" and not claim.get("deprecation_reason"):
        errors.append(f"{prefix}deprecated claim requires deprecation_reason")
    source = claim.get("source")
    if isinstance(source, dict):
        for field in ("document", "section"):
            if not source.get(field):
                errors.append(f"{prefix}source.{field} is required")
    elif "source" in claim:
        errors.append(f"{prefix}source must be an object")
    return errors


def iter_jsonl(path: Path) -> Iterable[tuple[int, dict[str, Any]]]:
    with path.open(encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValidationFailure(f"{path}:{line_no}: invalid JSON: {exc.msg}") from exc
            if not isinstance(value, dict):
                raise ValidationFailure(f"{path}:{line_no}: expected JSON object")
            yield line_no, value


def git_commit(repo: Path) -> str | None:
    result = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else None


@dataclass
class EvidenceLayout:
    root: Path

    @property
    def evidence(self) -> Path:
        return self.root / "evidence"

    @property
    def db(self) -> Path:
        return self.evidence / "index" / "evidence.db"

    @property
    def schema(self) -> Path:
        return Path(__file__).with_name("schema.sql")


def _insert_jsonl(conn: sqlite3.Connection, path: Path, table: str, columns: tuple[str, ...]) -> int:
    if not path.exists():
        return 0
    count = 0
    for _, record in iter_jsonl(path):
        row = [record.get(column) for column in columns]
        row.append(json.dumps(record, ensure_ascii=False, sort_keys=True))
        conn.execute(
            f"INSERT OR REPLACE INTO {table} ({','.join(columns)}, raw_json) "
            f"VALUES ({','.join('?' for _ in range(len(columns) + 1))})",
            row,
        )
        count += 1
    return count


def rebuild_index(layout: EvidenceLayout) -> dict[str, int]:
    layout.db.parent.mkdir(parents=True, exist_ok=True)
    if layout.db.exists():
        layout.db.unlink()
    conn = sqlite3.connect(layout.db)
    conn.executescript(layout.schema.read_text(encoding="utf-8"))
    counts = {"claims": 0, "evidence": 0, "verdicts": 0, "findings": 0}
    claims_dir = layout.evidence / "claims"
    for path in sorted(claims_dir.glob("*.y*ml")) if claims_dir.exists() else []:
        claim = load_yaml(path)
        errors = validate_claim(claim, path)
        if errors:
            raise ValidationFailure("\n".join(errors))
        conn.execute(
            "INSERT INTO claims(id, revision, statement, fact_type, risk, status, raw_json) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                claim["id"],
                claim["revision"],
                claim["statement"],
                claim["fact_type"],
                claim["risk"],
                claim.get("status", "active"),
                json.dumps(claim, ensure_ascii=False, sort_keys=True),
            ),
        )
        counts["claims"] += 1
    counts["evidence"] = _insert_jsonl(
        conn, layout.evidence / "records" / "evidence.jsonl", "evidence_records",
        ("id", "type", "subject", "content_hash", "confidence"),
    )
    counts["verdicts"] = _insert_jsonl(
        conn, layout.evidence / "verdicts" / "verdicts.jsonl", "verdicts",
        ("id", "claim_id", "claim_revision", "verdict", "confidence"),
    )
    counts["findings"] = _insert_jsonl(
        conn, layout.evidence / "findings" / "findings.jsonl", "findings",
        ("id", "fingerprint", "type", "severity", "status"),
    )
    conn.execute("INSERT INTO metadata(key, value) VALUES ('rebuilt_at', ?)", (now_iso(),))
    conn.commit()
    conn.close()
    return counts


def validate_index(layout: EvidenceLayout) -> list[str]:
    if not layout.db.exists():
        return [f"{layout.db}: index does not exist"]
    conn = sqlite3.connect(layout.db)
    errors = [row[0] for row in conn.execute("PRAGMA foreign_key_check")]
    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        errors.append(integrity)
    conn.close()
    return errors


def query_index(layout: EvidenceLayout, text: str) -> list[dict[str, Any]]:
    conn = sqlite3.connect(layout.db)
    conn.row_factory = sqlite3.Row
    like = f"%{text}%"
    rows = conn.execute(
        "SELECT id, revision, statement, fact_type, risk, status FROM claims "
        "WHERE statement LIKE ? OR id LIKE ? ORDER BY risk, id LIMIT 100",
        (like, like),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
