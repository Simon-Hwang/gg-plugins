#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from evidence_docs.core import (  # type: ignore
        EvidenceLayout,
        ValidationFailure,
        canonical_fingerprint,
        git_commit,
        load_yaml,
        query_index,
        rebuild_index,
        validate_claim,
        validate_index,
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
        load_yaml,
        query_index,
        rebuild_index,
        validate_claim,
        validate_index,
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
            }
            return emit(all(required.values()), command, {"required": required, "optional": optional})

        if args.group == "fingerprint":
            value = json.loads(args.json_file.read_text(encoding="utf-8"))
            return emit(True, command, {"sha256": canonical_fingerprint(value)})
    except (OSError, ValidationFailure, ValueError, json.JSONDecodeError) as exc:
        return emit(False, command, errors=[str(exc)])
    return emit(False, command, errors=["unsupported command"])


if __name__ == "__main__":
    raise SystemExit(main())
