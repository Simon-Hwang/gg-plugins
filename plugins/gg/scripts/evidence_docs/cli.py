#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from evidence_docs.core import (  # type: ignore
        EvidenceLayout,
        ValidationFailure,
        canonical_fingerprint,
        git_commit,
        iter_jsonl,
        load_yaml,
        now_iso,
        query_index,
        rebuild_index,
        validate_claim,
        validate_index,
        validate_observation_request,
        validate_profile,
    )
    from evidence_docs.knowledge import (  # type: ignore
        apply_publication,
        audit_lifecycle_state,
        calculate_blueprint_coverage,
        inspect_knowledge_domain,
        locate_knowledge,
        load_structured,
        plan_publication,
        publication_status,
        record_semantic_review,
        rollback_publication,
        resolve_coordinate,
        stage_publication,
        tree_fingerprint,
        validate_approval,
        validate_observe_approval_bundle,
        validate_blueprint,
        validate_publication_policy,
        validate_publication,
        validate_synthesis_bundle,
        validate_knowledge_domain,
        validate_knowledge_registry,
    )
else:
    from .core import (
        EvidenceLayout,
        ValidationFailure,
        canonical_fingerprint,
        git_commit,
        iter_jsonl,
        load_yaml,
        now_iso,
        query_index,
        rebuild_index,
        validate_claim,
        validate_index,
        validate_observation_request,
        validate_profile,
    )
    from .knowledge import (
        apply_publication,
        audit_lifecycle_state,
        calculate_blueprint_coverage,
        inspect_knowledge_domain,
        locate_knowledge,
        load_structured,
        plan_publication,
        publication_status,
        record_semantic_review,
        rollback_publication,
        resolve_coordinate,
        stage_publication,
        tree_fingerprint,
        validate_approval,
        validate_observe_approval_bundle,
        validate_blueprint,
        validate_publication_policy,
        validate_publication,
        validate_synthesis_bundle,
        validate_knowledge_domain,
        validate_knowledge_registry,
    )


_VALIDATION_ARGV: list[str] = []
_VALIDATION_INPUTS: list[dict[str, str]] = []


def _sha256_path(path: Path) -> str:
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


def _validator_implementation_hash() -> str:
    digest = hashlib.sha256()
    folder = Path(__file__).resolve().parent
    for path in sorted(folder.glob("*.py")):
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    digest.update((folder / "schema.sql").read_bytes())
    return f"sha256:{digest.hexdigest()}"


def _explicit_input_records(args: argparse.Namespace) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    for role in (
        "profile", "blueprint", "policy", "approval", "bundle",
        "observe_approval_bundle",
    ):
        raw = getattr(args, role, None)
        if not isinstance(raw, Path):
            continue
        path = raw.resolve()
        record = {"role": role, "path": str(path)}
        if path.is_file():
            record["sha256"] = _sha256_path(path)
        elif path.is_dir():
            record["sha256"] = tree_fingerprint(path)
        else:
            record["sha256"] = "unavailable"
        records.append(record)
    return records


def emit(ok: bool, command: str, data=None, errors=None) -> int:
    result = {
        "ok": ok,
        "command": command,
        "data": data or {},
        "errors": errors or [],
    }
    repo_root = Path(__file__).resolve().parents[4]
    result_hash = f"sha256:{canonical_fingerprint(result)}"
    result["validation_report"] = {
        "schema_version": "1",
        "validator": {
            "name": "gg-evidence",
            "report_contract_version": "1",
            "implementation_hash": _validator_implementation_hash(),
            "source_commit": git_commit(repo_root),
        },
        "invocation": {
            "command": command,
            "argv": _VALIDATION_ARGV,
        },
        "inputs": _VALIDATION_INPUTS,
        "executed_at": now_iso(),
        "result": {
            "ok": ok,
            "error_count": len(errors or []),
        },
        "result_hash": result_hash,
    }
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0 if ok else 2


def claim_files(root: Path) -> list[Path]:
    folder = root / "evidence" / "claims"
    return sorted([*folder.glob("*.yaml"), *folder.glob("*.yml")]) if folder.exists() else []


def observation_request_file(root: Path) -> Path:
    return root / "evidence" / "observation-requests" / "requests.jsonl"


def evidence_files(root: Path, name: str) -> list[Path]:
    evidence_root = root / "evidence"
    if not evidence_root.exists():
        return []
    return sorted(evidence_root.rglob(name))


TIME_PATH_PATTERN = re.compile(
    r"(^|[-_])("
    r"\d{8}T\d{6}(Z|[+-]\d{4})?"
    r"|\d{8}[-_]\d{6}"
    r"|\d{4}-\d{2}-\d{2}T\d{2}[-:]\d{2}[-:]\d{2}"
    r")($|[-_])"
)


def validate_storage_paths(root: Path) -> list[str]:
    evidence_root = root / "evidence"
    if not evidence_root.exists():
        return [f"{evidence_root}: missing evidence root"]
    errors: list[str] = []
    checked_roots = [
        evidence_root / "audit",
        evidence_root / "stages",
        evidence_root / "observe-runs",
        evidence_root / "maintain-runs",
        evidence_root / "publications",
        root / "knowledge" / "domains",
    ]
    for folder in checked_roots:
        if not folder.exists():
            continue
        for path in folder.rglob("*"):
            if path.is_dir() and TIME_PATH_PATTERN.search(path.name):
                errors.append(
                    f"{path}: timestamp belongs in manifest metadata, not directory name"
                )
    return errors


def _string_list(value) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else []


def _append_reason(reasons: list[str], reason: str) -> None:
    if reason not in reasons:
        reasons.append(reason)


def _resolve_command(command: str, root: Path, profile_path: Path) -> Path:
    expanded = Path(os.path.expandvars(command)).expanduser()
    if expanded.is_absolute():
        return expanded
    profile_relative = (profile_path.parent / expanded).resolve()
    if profile_relative.exists():
        return profile_relative
    root_relative = (root / expanded).resolve()
    if root_relative.exists():
        return root_relative
    return profile_relative


def _preflight_command(provider: dict) -> tuple[str | None, list[str], int]:
    preflight = provider.get("preflight")
    if isinstance(preflight, str):
        return preflight, [], 10
    if isinstance(preflight, dict):
        raw_args = preflight.get("args", [])
        args = [str(item) for item in raw_args] if isinstance(raw_args, list) else []
        timeout = preflight.get("timeout_seconds", preflight.get("timeout", 10))
        try:
            timeout_seconds = int(timeout)
        except (TypeError, ValueError):
            timeout_seconds = 10
        timeout_seconds = max(1, min(timeout_seconds, 60))
        command = preflight.get("command") or provider.get("command")
        return str(command) if command else None, args, timeout_seconds
    return None, [], 10


def _run_provider_preflight(
    provider: dict,
    root: Path,
    profile_path: Path,
) -> tuple[dict | None, list[str]]:
    command, args, timeout_seconds = _preflight_command(provider)
    if not command:
        return None, []
    command_path = _resolve_command(command, root, profile_path)
    if not command_path.exists():
        return None, ["preflight-command-not-found"]
    if not os.access(command_path, os.X_OK):
        return None, ["preflight-command-not-executable"]
    try:
        completed = subprocess.run(
            [str(command_path), *args],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return None, ["preflight-timeout"]
    except OSError:
        return None, ["preflight-exec-error"]
    if completed.returncode != 0:
        return {
            "exit_code": completed.returncode,
            "stderr": completed.stderr.strip()[:500],
        }, ["preflight-failed"]
    try:
        value = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {"stdout": completed.stdout.strip()[:500]}, ["preflight-invalid-json"]
    if not isinstance(value, dict):
        return None, ["preflight-output-not-object"]
    reasons: list[str] = []
    if value.get("ok") is not True:
        reasons.append("preflight-not-ok")
    provider_id = value.get("provider_id")
    if provider_id is not None and provider_id != provider.get("id"):
        reasons.append("preflight-provider-id-mismatch")
    capabilities = value.get("capabilities")
    if capabilities is not None:
        if not isinstance(capabilities, list) or any(
            not isinstance(item, str) for item in capabilities
        ):
            reasons.append("preflight-capabilities-invalid")
        else:
            missing = sorted(set(_string_list(provider.get("supports"))) - set(capabilities))
            if missing:
                reasons.append("preflight-capabilities-missing")
    return value, reasons


def _provider_status(
    provider: dict,
    root: Path,
    profile_path: Path,
    group_enabled: bool,
) -> dict:
    enabled = group_enabled and bool(provider.get("enabled", True))
    env = provider.get("env") if isinstance(provider.get("env"), dict) else {}
    secret_policy = (
        provider.get("secret_policy")
        if isinstance(provider.get("secret_policy"), dict)
        else {}
    )
    require_env = bool(secret_policy.get("require_env", bool(env)))
    missing_env = [
        str(name)
        for name in env.values()
        if isinstance(name, str) and name and not os.environ.get(name)
    ] if require_env else []
    command = provider.get("command")
    command_path = None
    command_exists = True
    command_executable = True
    if command:
        command_path = _resolve_command(str(command), root, profile_path)
        command_exists = command_path.exists()
        command_executable = os.access(command_path, os.X_OK) if command_exists else False
    reasons: list[str] = []
    if not enabled:
        reasons.append("disabled")
    for field in ("id", "type"):
        if enabled and not isinstance(provider.get(field), str):
            _append_reason(reasons, f"missing-{field}")
    supports = provider.get("supports")
    if enabled and (
        not isinstance(supports, list)
        or not supports
        or any(not isinstance(item, str) for item in supports)
    ):
        _append_reason(reasons, "invalid-supports")
    freshness = provider.get("freshness")
    if enabled and freshness is not None:
        if not isinstance(freshness, dict):
            _append_reason(reasons, "invalid-freshness")
        else:
            max_age = freshness.get("max_age")
            if max_age is not None and (not isinstance(max_age, str) or not max_age):
                _append_reason(reasons, "invalid-freshness")
    if enabled and env and any(not isinstance(name, str) or not name for name in env.values()):
        _append_reason(reasons, "invalid-env")
    if enabled and not command:
        _append_reason(reasons, "missing-command")
    if enabled and command and not command_exists:
        _append_reason(reasons, "command-not-found")
    if enabled and command and command_exists and not command_executable:
        _append_reason(reasons, "command-not-executable")
    if enabled and missing_env:
        _append_reason(reasons, "missing-env")
    preflight = None
    if enabled and not reasons:
        preflight, preflight_reasons = _run_provider_preflight(
            provider,
            root,
            profile_path,
        )
        for reason in preflight_reasons:
            _append_reason(reasons, reason)
    healthy = enabled and not reasons
    status = {
        "id": provider.get("id"),
        "type": provider.get("type"),
        "enabled": enabled,
        "available": healthy,
        "healthy": healthy,
        "mode": provider.get("mode", "unconfigured"),
        "supports": _string_list(provider.get("supports")),
    }
    if provider.get("subtype"):
        status["subtype"] = provider.get("subtype")
    if isinstance(provider.get("freshness"), dict):
        status["freshness"] = provider.get("freshness")
    if command_path:
        status["command"] = str(command_path)
    if preflight is not None:
        status["preflight"] = preflight
    if missing_env:
        status["missing_env"] = missing_env
    if reasons:
        status["reason"] = ",".join(reasons)
    return status


def _runtime_observation_preflight(profile: dict, root: Path, profile_path: Path) -> dict | None:
    adapters = profile.get("adapters")
    if not isinstance(adapters, dict):
        return None
    provider_groups: list[tuple[str, dict]] = []
    runtime_observation = adapters.get("runtime_observation")
    if isinstance(runtime_observation, dict):
        provider_groups.append(("runtime_observation", runtime_observation))
    runtime_config = adapters.get("runtime_config")
    if isinstance(runtime_config, dict) and isinstance(runtime_config.get("providers"), list):
        provider_groups.append(("runtime_config", runtime_config))
    providers: list[dict] = []
    aliases: list[str] = []
    for group_name, group in provider_groups:
        if group_name != "runtime_observation":
            aliases.append(group_name)
        group_enabled = bool(group.get("enabled", True))
        for provider in group.get("providers", []):
            if isinstance(provider, dict):
                providers.append(_provider_status(provider, root, profile_path, group_enabled))
    if not providers and not provider_groups:
        return None
    result = {
        "available": any(provider["healthy"] for provider in providers),
        "providers": providers,
    }
    if aliases:
        result["aliases"] = aliases
    return result


def _provider_candidates(
    request: dict,
    providers: list[dict],
) -> list[dict]:
    hints = set(_string_list(request.get("provider_hints")))
    capability = request.get("capability")
    candidates: list[dict] = []
    for provider in providers:
        provider_id = provider.get("id")
        supports = set(_string_list(provider.get("supports")))
        if hints and provider_id not in hints:
            continue
        if isinstance(capability, str) and supports and capability not in supports:
            continue
        candidates.append(provider)
    return candidates


def _record_id(record: dict) -> str | None:
    for field in ("evidence_id", "id"):
        value = record.get(field)
        if isinstance(value, str) and value:
            return value
    return None


def _is_runtime_evidence(record: dict) -> bool:
    if isinstance(record.get("provider_id"), str):
        return True
    record_type = str(record.get("type", ""))
    return record_type.startswith("runtime")


def _load_named_jsonl(root: Path, name: str) -> list[dict]:
    records: list[dict] = []
    for path in evidence_files(root, name):
        for _line_no, record in iter_jsonl(path):
            if isinstance(record, dict):
                record["_file"] = str(path)
                records.append(record)
    return records


def _load_all_jsonl_records(root: Path) -> list[dict]:
    evidence_root = root / "evidence"
    if not evidence_root.exists():
        return []
    records: list[dict] = []
    for path in sorted(evidence_root.rglob("*.jsonl")):
        for line_no, record in iter_jsonl(path):
            if isinstance(record, dict):
                record["_file"] = str(path)
                record["_line"] = line_no
                records.append(record)
    return records


def _runtime_text(record: dict) -> str:
    fields = (
        "status",
        "type",
        "kind",
        "failure_class",
        "degrade_reason",
        "runtime_promotion_role",
        "evidence_role",
        "summary",
        "rationale",
    )
    return " ".join(str(record.get(field, "")) for field in fields).lower()


def _runtime_state(record: dict, field: str) -> str | None:
    value = record.get(field)
    return value if isinstance(value, str) else None


def _is_degraded_runtime_record(record: dict) -> bool:
    text = _runtime_text(record)
    return any(
        marker in text
        for marker in (
            "audit-reference-only",
            "degraded",
            "unsafe-query",
            "missing-request-out",
            "insufficient-sample",
            "non-supporting-runtime-context",
            "provider-unavailable",
            "command-not-found",
            "requires-runtime-evidence",
            "health-only",
        )
    )


def _is_runtime_support_record(record: dict) -> bool:
    if not _is_runtime_evidence(record):
        return False
    text = _runtime_text(record)
    if _is_degraded_runtime_record(record):
        return False
    if "accepted-runtime-support" in text:
        return True
    if "runtime-supported" in text or "runtime-observed" in text:
        return True
    return False


def _evidence_id_from_coordinate(value: str) -> str:
    return value.removeprefix("evidence://")


def _load_observation_requests(root: Path) -> list[dict]:
    requests: list[dict] = []
    request_path = observation_request_file(root)
    if request_path.exists():
        for line_no, request in iter_jsonl(request_path):
            if isinstance(request, dict):
                request["_file"] = str(request_path)
                request["_line"] = line_no
                requests.append(request)
    for path in evidence_files(root, "observation-requests.jsonl"):
        if path == request_path:
            continue
        for line_no, request in iter_jsonl(path):
            if isinstance(request, dict):
                request["_file"] = str(path)
                request["_line"] = line_no
                requests.append(request)
    return requests


def _domain_manifest_paths(root: Path) -> list[Path]:
    domains = root / "knowledge" / "domains"
    if not domains.exists():
        return []
    return sorted(path for path in domains.glob("*/manifest.json") if path.is_file())


def audit_consistency(root: Path) -> dict:
    records = _load_all_jsonl_records(root)
    evidence_by_id = {
        evidence_id: record
        for record in records
        if (evidence_id := _record_id(record))
    }
    verdicts = [
        record for record in records
        if "verdicts" in Path(str(record.get("_file", ""))).name
        and "update" not in Path(str(record.get("_file", ""))).name
        and "suggestion" not in Path(str(record.get("_file", ""))).name
    ]
    requests = _load_observation_requests(root)
    requests_by_id = {
        request["id"]: request
        for request in requests
        if isinstance(request.get("id"), str)
    }
    terminal_runtime_verdicts = [
        verdict for verdict in verdicts
        if (_runtime_state(verdict, "verdict") or _runtime_state(verdict, "status"))
        in {"runtime-supported", "runtime-contradicted"}
    ]

    errors: list[str] = []
    warnings: list[str] = []
    for verdict in terminal_runtime_verdicts:
        verdict_id = verdict.get("verdict_id", verdict.get("id", "<unknown-verdict>"))
        evidence_ids = _string_list(verdict.get("evidence_ids"))
        if not evidence_ids:
            errors.append(f"{verdict_id}: terminal runtime verdict has no evidence_ids")
        for evidence_id in evidence_ids:
            evidence = evidence_by_id.get(evidence_id)
            if evidence is None:
                errors.append(f"{verdict_id}: evidence_id {evidence_id} is not present in evidence ledgers")
                continue
            if _is_degraded_runtime_record(evidence):
                errors.append(
                    f"{verdict_id}: terminal runtime verdict references degraded or health-only evidence {evidence_id}"
                )
            elif not _is_runtime_support_record(evidence):
                errors.append(
                    f"{verdict_id}: terminal runtime verdict references non-runtime-support evidence {evidence_id}"
                )
        for request_id in _string_list(verdict.get("observation_request_ids")):
            request = requests_by_id.get(request_id)
            if not request:
                continue
            if request.get("status") == "open" and request.get("degrade_reason"):
                errors.append(
                    f"{request_id}: open observation request has terminal runtime verdict {verdict_id}; close, supersede, or mark partial instead of leaving stale degrade_reason"
                )

    support_evidence_ids = {
        evidence_id for evidence_id, evidence in evidence_by_id.items()
        if _is_runtime_support_record(evidence)
    }
    degraded_evidence_ids = {
        evidence_id for evidence_id, evidence in evidence_by_id.items()
        if _is_degraded_runtime_record(evidence)
    }
    for manifest_path in _domain_manifest_paths(root):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"{manifest_path}: invalid JSON: {exc.msg}")
            continue
        freshness = manifest.get("freshness") if isinstance(manifest.get("freshness"), dict) else {}
        declared_supported = set(_string_list(freshness.get("runtime_supported_evidence")))
        declared_degraded = set(_string_list(freshness.get("runtime_degraded_evidence")))
        for evidence_id in sorted(declared_supported & degraded_evidence_ids):
            errors.append(
                f"{manifest_path}: runtime_supported_evidence includes degraded or health-only evidence {evidence_id}"
            )
        for evidence_id in sorted(declared_degraded & support_evidence_ids):
            errors.append(
                f"{manifest_path}: runtime_degraded_evidence includes accepted runtime support {evidence_id}"
            )
        publication_id = manifest.get("current_publication_id")
        context_map = manifest.get("context") if isinstance(manifest.get("context"), dict) else {}
        context_manifest = context_map.get("manifest")
        if not isinstance(publication_id, str) or not isinstance(context_manifest, str):
            continue
        context_path = (manifest_path.parent / context_manifest).resolve()
        if not context_path.exists():
            continue
        try:
            context = json.loads(context_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"{context_path}: invalid JSON: {exc.msg}")
            continue
        context_evidence_ids = {
            _evidence_id_from_coordinate(value)
            for value in _string_list(context.get("evidence_ids"))
            if value.startswith("evidence://")
        }
        missing_supported = sorted((context_evidence_ids & support_evidence_ids) - declared_supported)
        for evidence_id in missing_supported:
            errors.append(
                f"{manifest_path}: context manifest references runtime-supported evidence {evidence_id} but freshness.runtime_supported_evidence omits it"
            )
        if declared_supported and not context_evidence_ids:
            warnings.append(
                f"{manifest_path}: runtime_supported_evidence is declared but current context manifest has no evidence_ids"
            )

    return {
        "errors": errors,
        "warnings": warnings,
        "counts": {
            "requests": len(requests),
            "verdicts": len(verdicts),
            "terminal_runtime_verdicts": len(terminal_runtime_verdicts),
            "evidence_records": len(evidence_by_id),
            "runtime_support_evidence": len(support_evidence_ids),
            "runtime_degraded_evidence": len(degraded_evidence_ids),
            "domain_manifests": len(_domain_manifest_paths(root)),
        },
        "gate_passed": not errors,
    }


def audit_runtime_promotion(profile: dict, root: Path, profile_path: Path) -> dict:
    consistency = audit_consistency(root)
    runtime = _runtime_observation_preflight(profile, root, profile_path) or {
        "available": False,
        "providers": [],
    }
    providers = [
        provider for provider in runtime.get("providers", [])
        if provider.get("healthy")
    ]
    provider_ids = {provider.get("id") for provider in providers}
    requests_by_id: dict[str, dict] = {}
    anonymous_requests: list[dict] = []
    request_errors: list[str] = []

    def add_request(request: dict, path: Path, line_no: int) -> None:
        request["_file"] = str(path)
        request["_line"] = line_no
        request_errors.extend(validate_observation_request(request, path, line_no))
        request_id = request.get("id")
        if isinstance(request_id, str) and request_id:
            requests_by_id.setdefault(request_id, request)
        else:
            anonymous_requests.append(request)

    request_path = observation_request_file(root)
    if request_path.exists():
        for line_no, request in iter_jsonl(request_path):
            if isinstance(request, dict):
                add_request(request, request_path, line_no)
    for path in evidence_files(root, "observation-requests.jsonl"):
        if path == request_path:
            continue
        for line_no, request in iter_jsonl(path):
            if isinstance(request, dict):
                add_request(request, path, line_no)
    requests = [*requests_by_id.values(), *anonymous_requests]

    evidence = _load_named_jsonl(root, "evidence.jsonl")
    runtime_evidence = [
        record for record in evidence
        if _is_runtime_evidence(record)
    ]
    runtime_evidence_by_id = {
        evidence_id: record
        for record in runtime_evidence
        if (evidence_id := _record_id(record))
    }
    verdicts = _load_named_jsonl(root, "verdicts.jsonl")
    referenced_evidence = {
        evidence_id
        for verdict in verdicts
        for evidence_id in _string_list(verdict.get("evidence_ids"))
    }
    terminal_runtime_verdicts = [
        verdict for verdict in verdicts
        if _runtime_state(verdict, "verdict") in {"runtime-supported", "runtime-contradicted"}
    ]

    routable: list[dict] = []
    unresolved: list[dict] = []
    for request in requests:
        candidates = _provider_candidates(request, providers)
        if not candidates:
            continue
        candidate_ids = {candidate.get("id") for candidate in candidates}
        capability = request.get("capability")
        matching_evidence = [
            record for record in runtime_evidence
            if record.get("provider_id") in candidate_ids
            and (
                not isinstance(capability, str)
                or record.get("capability") == capability
                or record.get("capability") in _string_list(request.get("accepted_capabilities"))
            )
        ]
        matching_ids = [
            evidence_id for record in matching_evidence
            if (evidence_id := _record_id(record))
        ]
        verdict_refs = [
            verdict for verdict in verdicts
            if set(_string_list(verdict.get("evidence_ids"))) & set(matching_ids)
        ]
        item = {
            "id": request.get("id"),
            "capability": capability,
            "provider_ids": sorted(str(value) for value in candidate_ids if value),
            "matching_runtime_evidence": matching_ids,
            "referencing_verdicts": [
                verdict.get("verdict_id", verdict.get("id")) for verdict in verdict_refs
            ],
        }
        routable.append(item)
        if not matching_ids:
            unresolved.append({
                **item,
                "reason": "routable-request-has-no-runtime-evidence",
            })
        elif not verdict_refs:
            unresolved.append({
                **item,
                "reason": "runtime-evidence-not-referenced-by-verdict",
            })

    orphan_runtime_evidence = [
        evidence_id for evidence_id in runtime_evidence_by_id
        if evidence_id not in referenced_evidence
    ]
    return {
        "providers": {
            "healthy": sorted(str(provider_id) for provider_id in provider_ids if provider_id),
            "available": bool(providers),
        },
        "requests": {
            "total": len(requests),
            "routable": len(routable),
            "unresolved": unresolved,
            "validation_errors": request_errors,
        },
        "runtime_evidence": {
            "total": len(runtime_evidence),
            "referenced": len(runtime_evidence_by_id) - len(orphan_runtime_evidence),
            "orphan_ids": orphan_runtime_evidence,
        },
        "verdicts": {
            "runtime_terminal": len(terminal_runtime_verdicts),
        },
        "consistency": {
            "gate_passed": consistency["gate_passed"],
            "errors": consistency["errors"],
            "warnings": consistency["warnings"],
            "counts": consistency["counts"],
        },
        "gate_passed": (
            not request_errors
            and not unresolved
            and not orphan_runtime_evidence
            and consistency["gate_passed"]
        ),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="gg-evidence")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--profile", type=Path)
    parser.add_argument("--blueprint", type=Path)
    parser.add_argument("--policy", type=Path)
    parser.add_argument("--bundle", type=Path)
    parser.add_argument("--approval", type=Path)
    parser.add_argument("--observe-approval-bundle", type=Path)
    groups = parser.add_subparsers(dest="group", required=True)

    profile = groups.add_parser("profile").add_subparsers(dest="action", required=True)
    profile.add_parser("validate")

    claims = groups.add_parser("claims").add_subparsers(dest="action", required=True)
    claims.add_parser("validate")

    observation_requests = groups.add_parser("observation-requests").add_subparsers(
        dest="action",
        required=True,
    )
    observation_requests.add_parser("validate")
    observation_requests.add_parser("audit-runtime-promotion")

    consistency = groups.add_parser("consistency").add_subparsers(
        dest="action",
        required=True,
    )
    consistency.add_parser("audit")

    storage = groups.add_parser("storage").add_subparsers(dest="action", required=True)
    storage.add_parser("validate")

    index = groups.add_parser("index").add_subparsers(dest="action", required=True)
    index.add_parser("rebuild")
    index.add_parser("validate")
    query = index.add_parser("query")
    query.add_argument("text")

    adapters = groups.add_parser("adapters").add_subparsers(dest="action", required=True)
    adapters.add_parser("preflight")

    blueprints = groups.add_parser("blueprints").add_subparsers(dest="action", required=True)
    blueprints.add_parser("validate")

    synthesis = groups.add_parser("synthesis").add_subparsers(dest="action", required=True)
    coverage = synthesis.add_parser("coverage")
    coverage.add_argument("--facts", type=Path, required=True)
    synthesis.add_parser("validate")
    synthesis.add_parser("fingerprint")

    policies = groups.add_parser("publication-policies").add_subparsers(
        dest="action", required=True,
    )
    policies.add_parser("validate")

    approvals = groups.add_parser("approvals").add_subparsers(dest="action", required=True)
    approvals.add_parser("validate")

    observe_approvals = groups.add_parser("observe-approval-bundles").add_subparsers(
        dest="action", required=True,
    )
    observe_approvals.add_parser("validate")

    lifecycle = groups.add_parser("lifecycle").add_subparsers(
        dest="action", required=True,
    )
    lifecycle.add_parser("audit")

    knowledge = groups.add_parser("knowledge").add_subparsers(
        dest="action", required=True,
    )
    registry = knowledge.add_parser("registry").add_subparsers(
        dest="knowledge_action", required=True,
    )
    registry.add_parser("validate")
    locate = knowledge.add_parser("locate")
    locate.add_argument("--intent", required=True)
    resolve = knowledge.add_parser("resolve")
    resolve.add_argument("coordinate")
    inspect = knowledge.add_parser("inspect")
    inspect.add_argument("--domain", required=True)
    knowledge_validate = knowledge.add_parser("validate")
    knowledge_validate.add_argument("--domain", required=True)

    publications = groups.add_parser("publications").add_subparsers(
        dest="action", required=True,
    )
    plan = publications.add_parser("plan")
    plan.add_argument("--publication-id")
    stage = publications.add_parser("stage")
    stage.add_argument("--stage-id", required=True)
    stage.add_argument("--publication-id")
    review = publications.add_parser("review-record")
    review.add_argument("--stage-id", required=True)
    review.add_argument("--review-record", type=Path, required=True)
    apply = publications.add_parser("apply")
    apply.add_argument("--publication-id", required=True)
    apply.add_argument("--stage-id")
    status = publications.add_parser("status")
    status.add_argument("--publication-id", required=True)
    validate = publications.add_parser("validate")
    validate.add_argument("--publication-id", required=True)
    rollback = publications.add_parser("rollback")
    rollback.add_argument("--publication-id", required=True)

    fingerprint = groups.add_parser("fingerprint")
    fingerprint.add_argument("json_file", type=Path)
    return parser


def main(argv=None) -> int:
    global _VALIDATION_ARGV, _VALIDATION_INPUTS
    args = build_parser().parse_args(argv)
    _VALIDATION_ARGV = list(argv if argv is not None else sys.argv[1:])
    _VALIDATION_INPUTS = _explicit_input_records(args)
    root = args.root.resolve()
    command = f"{args.group} {getattr(args, 'action', '')}".strip()
    try:
        if args.group == "profile":
            if not args.profile:
                return emit(False, command, errors=["--profile is required"])
            profile = load_yaml(args.profile)
            errors = validate_profile(profile, args.profile)
            return emit(not errors, command, {"profile_id": profile.get("profile_id")}, errors)

        if args.group == "claims":
            errors: list[str] = []
            latest: dict[str, int] = {}
            claims: list[dict] = []
            for path in claim_files(root):
                claim = load_yaml(path)
                claims.append(claim)
                errors.extend(validate_claim(claim, path))
                claim_id = claim.get("id")
                revision = claim.get("revision", 0)
                if claim_id in latest and revision <= latest[claim_id]:
                    errors.append(f"{path}: revision must increase for claim {claim_id}")
                latest[claim_id] = revision
            known = set(latest)
            for claim in claims:
                target = claim.get("superseded_by")
                if target and target not in known:
                    errors.append(f"claim {claim.get('id')}: superseded_by target {target!r} does not exist")
            return emit(not errors, command, {"files": len(claims), "claims": len(latest)}, errors)

        if args.group == "observation-requests":
            if args.action == "audit-runtime-promotion":
                if not args.profile:
                    return emit(False, command, errors=["--profile is required"])
                audit = audit_runtime_promotion(
                    load_yaml(args.profile),
                    root,
                    args.profile.resolve(),
                )
                errors = []
                errors.extend(audit["requests"]["validation_errors"])
                errors.extend(
                    f"{item['id']}: {item['reason']}"
                    for item in audit["requests"]["unresolved"]
                )
                errors.extend(
                    f"{evidence_id}: runtime evidence is not referenced by any verdict"
                    for evidence_id in audit["runtime_evidence"]["orphan_ids"]
                )
                errors.extend(audit["consistency"]["errors"])
                return emit(audit["gate_passed"], command, audit, errors)
            if args.action == "validate":
                request_path = observation_request_file(root)
                errors: list[str] = []
                seen: set[str] = set()
                count = 0
                if not request_path.exists():
                    return emit(
                        False,
                        command,
                        {"file": str(request_path), "requests": 0},
                        [f"{request_path}: missing observation request ledger"],
                    )
                for line_no, request in iter_jsonl(request_path):
                    count += 1
                    errors.extend(validate_observation_request(request, request_path, line_no))
                    request_id = request.get("id")
                    if isinstance(request_id, str):
                        if request_id in seen:
                            errors.append(f"{request_path}:{line_no}: duplicate id {request_id}")
                        seen.add(request_id)
                return emit(
                    not errors,
                    command,
                    {"file": str(request_path), "requests": count},
                    errors,
                )

        if args.group == "consistency":
            audit = audit_consistency(root)
            return emit(
                audit["gate_passed"],
                command,
                audit,
                audit["errors"],
            )

        if args.group == "blueprints":
            if not args.blueprint:
                return emit(False, command, errors=["--blueprint is required"])
            blueprint = load_structured(args.blueprint)
            errors = validate_blueprint(blueprint, args.blueprint)
            return emit(
                not errors,
                command,
                {"blueprint_id": blueprint.get("blueprint_id")},
                errors,
            )

        if args.group == "synthesis":
            if not args.bundle and args.action in {"validate", "fingerprint"}:
                return emit(False, command, errors=["--bundle is required"])
            if args.action == "fingerprint":
                return emit(
                    True,
                    command,
                    {"bundle_hash": tree_fingerprint(args.bundle.resolve())},
                )
            if args.action == "validate":
                blueprint = (
                    load_structured(args.blueprint) if args.blueprint else None
                )
                manifest, errors = validate_synthesis_bundle(
                    args.bundle.resolve(), blueprint,
                )
                return emit(
                    not errors,
                    command,
                    {
                        "synthesis_id": manifest.get("synthesis_id"),
                        "bundle_hash": tree_fingerprint(args.bundle.resolve()),
                    },
                    errors,
                )
            if not args.blueprint:
                return emit(False, command, errors=["--blueprint is required"])
            blueprint = load_structured(args.blueprint)
            errors = validate_blueprint(blueprint, args.blueprint)
            if errors:
                return emit(False, command, errors=errors)
            result = calculate_blueprint_coverage(
                blueprint,
                load_structured(args.facts),
            )
            return emit(
                result["coverage"]["gate_passed"],
                command,
                result,
                [] if result["coverage"]["gate_passed"] else [
                    "blueprint minimum slot coverage was not met"
                ],
                )

        if args.group == "storage":
            errors = validate_storage_paths(root)
            return emit(
                not errors,
                command,
                {
                    "root": str(root),
                    "checked": [
                        "evidence/audit",
                        "evidence/stages",
                        "evidence/observe-runs",
                        "evidence/maintain-runs",
                        "evidence/publications",
                        "knowledge/domains",
                    ],
                },
                errors,
            )

        if args.group == "publication-policies":
            if not args.policy:
                return emit(False, command, errors=["--policy is required"])
            policy = load_structured(args.policy)
            errors = validate_publication_policy(policy, args.policy)
            return emit(
                not errors,
                command,
                {"policy_id": policy.get("policy_id")},
                errors,
            )

        if args.group == "approvals":
            if not args.approval:
                return emit(False, command, errors=["--approval is required"])
            approval = load_structured(args.approval)
            errors = validate_approval(approval, args.approval)
            if args.bundle:
                actual = tree_fingerprint(args.bundle.resolve())
                if approval.get("bundle_hash") != actual:
                    errors.append("approval bundle_hash does not match bundle")
            return emit(
                not errors,
                command,
                {"approval_id": approval.get("approval_id")},
                errors,
            )

        if args.group == "observe-approval-bundles":
            if not args.observe_approval_bundle:
                return emit(
                    False, command, errors=["--observe-approval-bundle is required"],
                )
            bundle = load_structured(args.observe_approval_bundle)
            errors = validate_observe_approval_bundle(
                bundle, args.observe_approval_bundle,
            )
            return emit(
                not errors,
                command,
                {"bundle_id": bundle.get("bundle_id"), "items": len(bundle.get("items", []))},
                errors,
            )

        if args.group == "lifecycle":
            audit = audit_lifecycle_state(root)
            return emit(audit["gate_passed"], command, audit, audit["errors"])

        if args.group == "knowledge":
            if args.action == "registry":
                command = f"{command} {args.knowledge_action}"
                registry, errors = validate_knowledge_registry(root)
                return emit(
                    not errors,
                    command,
                    {"domains": len(registry.get("domains", []))},
                    errors,
                )
            if args.action == "locate":
                return emit(
                    True,
                    command,
                    {"matches": locate_knowledge(root, args.intent)},
                )
            if args.action == "resolve":
                return emit(
                    True,
                    command,
                    {"resolved": resolve_coordinate(root, args.coordinate)},
                )
            if args.action == "inspect":
                return emit(
                    True,
                    command,
                    inspect_knowledge_domain(root, args.domain),
                )
            errors = validate_knowledge_domain(root, args.domain)
            return emit(
                not errors,
                command,
                {"domain_id": args.domain},
                errors,
            )

        if args.group == "publications":
            if args.action == "rollback":
                result = rollback_publication(root, args.publication_id)
                return emit(True, command, {"publication": result})
            if args.action == "status":
                result = publication_status(root, args.publication_id)
                return emit(True, command, {"publication": result})
            if args.action == "validate":
                errors = validate_publication(root, args.publication_id)
                return emit(
                    not errors,
                    command,
                    {"publication_id": args.publication_id},
                    errors,
                )
            if args.action == "review-record":
                result = record_semantic_review(
                    root,
                    args.stage_id,
                    load_structured(args.review_record),
                )
                return emit(True, command, {"stage": result})
            if args.action == "apply":
                if not args.stage_id:
                    return emit(False, command, errors=["--stage-id is required"])
                result = apply_publication(
                    root,
                    args.stage_id,
                    args.publication_id,
                )
                return emit(True, command, {"publication": result})
            missing = [
                flag for flag, value in (
                    ("--policy", args.policy),
                    ("--bundle", args.bundle),
                    ("--approval", args.approval),
                )
                if value is None
            ]
            if missing:
                return emit(False, command, errors=[f"{', '.join(missing)} required"])
            bundle = args.bundle.resolve()
            plan = plan_publication(
                root,
                bundle,
                load_structured(args.policy),
                load_structured(args.approval),
                args.publication_id,
                load_structured(args.blueprint) if args.blueprint else None,
            )
            if args.action == "plan":
                return emit(True, command, {"plan": plan})
            result = stage_publication(
                root,
                bundle,
                plan,
                args.stage_id,
            )
            return emit(True, command, {"stage": result})

        layout = EvidenceLayout(root)
        if args.group == "index":
            if args.action == "rebuild":
                return emit(True, command, {"database": str(layout.db), "counts": rebuild_index(layout)})
            if args.action == "validate":
                errors = validate_index(layout)
                return emit(not errors, command, {"database": str(layout.db)}, errors)
            return emit(True, command, {"results": query_index(layout, args.text)})

        if args.group == "adapters":
            if not args.profile:
                return emit(False, command, errors=["--profile is required"])
            profile = load_yaml(args.profile)
            repository_roots = [
                Path(os.path.expandvars(str(value))).expanduser()
                for value in profile.get("repository_roots", [])
                if "$" not in os.path.expandvars(str(value))
            ]
            required = {
                "claim_store": (root / "evidence" / "claims").exists(),
                "evidence_store": (root / "evidence" / "records").exists(),
                "repository_access": any(
                    path.is_dir() and (git_commit(path) or any(child.is_dir() for child in path.glob("*/.git")))
                    for path in repository_roots
                ),
                "index": layout.db.exists(),
            }
            configured = profile.get("adapters", {})
            optional = {
                name: {"available": bool(config.get("enabled")), "mode": config.get("mode", "unconfigured")}
                for name, config in configured.items()
                if name not in {"runtime_observation", "runtime_config"}
            }
            runtime_observation = _runtime_observation_preflight(profile, root, args.profile.resolve())
            if runtime_observation is not None:
                optional["runtime_observation"] = runtime_observation
            return emit(all(required.values()), command, {"required": required, "optional": optional})

        if args.group == "fingerprint":
            value = json.loads(args.json_file.read_text(encoding="utf-8"))
            return emit(True, command, {"sha256": canonical_fingerprint(value)})
    except (OSError, ValidationFailure, ValueError, json.JSONDecodeError) as exc:
        return emit(False, command, errors=[str(exc)])
    return emit(False, command, errors=["unsupported command"])


if __name__ == "__main__":
    raise SystemExit(main())
