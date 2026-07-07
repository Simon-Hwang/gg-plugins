#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
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
        query_index,
        rebuild_index,
        validate_claim,
        validate_index,
        validate_observation_request,
        validate_profile,
    )
    from evidence_docs.knowledge import (  # type: ignore
        apply_publication,
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
        query_index,
        rebuild_index,
        validate_claim,
        validate_index,
        validate_observation_request,
        validate_profile,
    )
    from .knowledge import (
        apply_publication,
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
        validate_blueprint,
        validate_publication_policy,
        validate_publication,
        validate_synthesis_bundle,
        validate_knowledge_domain,
        validate_knowledge_registry,
    )


def emit(ok: bool, command: str, data=None, errors=None) -> int:
    print(json.dumps(
        {"ok": ok, "command": command, "data": data or {}, "errors": errors or []},
        ensure_ascii=False,
        sort_keys=True,
    ))
    return 0 if ok else 2


def claim_files(root: Path) -> list[Path]:
    folder = root / "evidence" / "claims"
    return sorted([*folder.glob("*.yaml"), *folder.glob("*.yml")]) if folder.exists() else []


def observation_request_file(root: Path) -> Path:
    return root / "evidence" / "observation-requests" / "requests.jsonl"


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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="gg-evidence")
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--profile", type=Path)
    parser.add_argument("--blueprint", type=Path)
    parser.add_argument("--policy", type=Path)
    parser.add_argument("--bundle", type=Path)
    parser.add_argument("--approval", type=Path)
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
    args = build_parser().parse_args(argv)
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
