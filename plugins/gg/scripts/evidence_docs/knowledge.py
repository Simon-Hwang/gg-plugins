from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any

from .core import ValidationFailure, canonical_fingerprint, iter_jsonl, load_yaml, now_iso


CONTEXT_FILES = (
    "context-manifest.json",
    "retrieval-cards.jsonl",
    "topology.jsonl",
    "impact-index.jsonl",
    "gaps.jsonl",
)
CHANGE_TYPES = {"create", "replace", "merge", "redirect", "archive", "metadata-only"}
IMPLEMENTED_CHANGE_TYPES = {"create", "replace"}
OBSERVE_APPROVAL_ITEM_TYPES = {
    "reference-fix",
    "business-intent-change",
    "implementation-assertion-change",
    "mixed-semantic-change",
}
OBSERVE_APPROVAL_ROLES = {"wiki-maintainer", "business-owner", "code-owner"}
FULL_VERDICTS = {
    "static-supported", "runtime-supported", "verified-static",
    "verified-runtime", "supported",
}
CONSTRAINED_VERDICTS = {"partial", "requires-runtime-evidence"}
TOPOLOGY_NODE_TYPES = {
    "repository", "service", "rpc", "http", "topic", "storage", "config",
    "experiment", "external-interface", "business-stage",
}
PROCESS_STATE_PATTERN = re.compile(
    r"\b(awaiting-approval|ready-to-apply|publication_allowed|"
    r"bundle_hash|stage_id|approval_id)\b",
    re.IGNORECASE,
)
CLAIM_MARKER_PATTERN = re.compile(r"\[(?:Claim|Verdict|Evidence)\s*:", re.IGNORECASE)
COORDINATE_PATTERN = re.compile(
    r"^(?P<scheme>knowledge|claim|evidence|finding|code)://(?P<body>.+)$"
)
MARKDOWN_HEADING_PATTERN = re.compile(
    r"(?m)^(?P<level>#{1,6})\s+(?P<title>.+?)\s*$"
)
MIN_REVIEW_SECTION_CHARS = 16


def load_structured(path: Path) -> dict[str, Any]:
    if path.suffix.lower() == ".json":
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValidationFailure(f"{path}: invalid JSON: {exc.msg}") from exc
        if not isinstance(value, dict):
            raise ValidationFailure(f"{path}: expected an object")
        return value
    return load_yaml(path)


def sha256_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def tree_fingerprint(root: Path) -> str:
    if not root.is_dir():
        raise ValidationFailure(f"{root}: bundle directory does not exist")
    digest = hashlib.sha256()
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        relative = path.relative_to(root).as_posix()
        if relative in {"approval-decision.json", "approval-decision.yaml", "approval-decision.yml"}:
            continue
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return f"sha256:{digest.hexdigest()}"


def _safe_relative(value: Any, field: str) -> tuple[PurePosixPath | None, str | None]:
    if not isinstance(value, str) or not value.strip():
        return None, f"{field} must be a non-empty relative path"
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts:
        return None, f"{field} must not be absolute or contain '..': {value}"
    return path, None


def _markdown_section_body(text: str, section: str) -> str | None:
    matches = list(MARKDOWN_HEADING_PATTERN.finditer(text))
    for index, match in enumerate(matches):
        if match.group("title").strip() != section:
            continue
        level = len(match.group("level"))
        end = len(text)
        for next_match in matches[index + 1:]:
            if len(next_match.group("level")) <= level:
                end = next_match.start()
                break
        return text[match.end():end]
    return None


def validate_review_draft_surface(
    source: str,
    text: str,
    required_sections: list[Any],
    covers_knowledge_ids: set[str],
) -> list[str]:
    errors: list[str] = []
    for section_value in required_sections:
        section = str(section_value)
        body = _markdown_section_body(text, section)
        if body is None:
            errors.append(
                f"{source}: review draft required section missing: {section}"
            )
            continue
        body_text = re.sub(r"\s+", " ", body).strip()
        if len(body_text) < MIN_REVIEW_SECTION_CHARS:
            errors.append(
                f"{source}: review draft required section has no "
                f"reviewer-facing content: {section}"
            )
    for knowledge_id in sorted(covers_knowledge_ids):
        if knowledge_id and knowledge_id not in text:
            errors.append(
                f"{source}: review draft does not name covered knowledge_id: "
                f"{knowledge_id}"
            )
    return errors


def validate_blueprint(value: dict[str, Any], path: Path | None = None) -> list[str]:
    prefix = f"{path}: " if path else ""
    errors: list[str] = []
    for field in (
        "schema_version", "blueprint_id", "domain_profile", "scope",
        "knowledge_slots", "documents", "context_pack", "policies",
    ):
        if field not in value:
            errors.append(f"{prefix}missing required field {field}")
    if value.get("schema_version") != "1":
        errors.append(f'{prefix}schema_version must be "1"')
    slots = value.get("knowledge_slots", [])
    if not isinstance(slots, list):
        errors.append(f"{prefix}knowledge_slots must be a list")
        slots = []
    slot_ids: set[str] = set()
    for index, slot in enumerate(slots):
        if not isinstance(slot, dict) or not slot.get("id"):
            errors.append(f"{prefix}knowledge_slots[{index}].id is required")
            continue
        slot_id = str(slot["id"])
        if slot_id in slot_ids:
            errors.append(f"{prefix}duplicate knowledge slot {slot_id}")
        slot_ids.add(slot_id)
    documents = value.get("documents", [])
    if not isinstance(documents, list):
        errors.append(f"{prefix}documents must be a list")
        documents = []
    knowledge_ids: set[str] = set()
    for index, document in enumerate(documents):
        if not isinstance(document, dict):
            errors.append(f"{prefix}documents[{index}] must be an object")
            continue
        knowledge_id = document.get("knowledge_id")
        if not knowledge_id:
            errors.append(f"{prefix}documents[{index}].knowledge_id is required")
        elif knowledge_id in knowledge_ids:
            errors.append(f"{prefix}duplicate knowledge_id {knowledge_id}")
        else:
            knowledge_ids.add(str(knowledge_id))
        for slot_id in document.get("consumes_slots", []):
            if slot_id not in slot_ids:
                errors.append(
                    f"{prefix}documents[{index}] consumes unknown slot {slot_id}"
                )
    review_documents = value.get("review_documents", [])
    if not isinstance(review_documents, list):
        errors.append(f"{prefix}review_documents must be a list")
        review_documents = []
    review_ids: set[str] = set()
    reviewed_knowledge_ids: set[str] = set()
    for index, document in enumerate(review_documents):
        if not isinstance(document, dict):
            errors.append(f"{prefix}review_documents[{index}] must be an object")
            continue
        review_id = document.get("review_id")
        if not review_id:
            errors.append(f"{prefix}review_documents[{index}].review_id is required")
        elif review_id in review_ids:
            errors.append(f"{prefix}duplicate review_id {review_id}")
        else:
            review_ids.add(str(review_id))
        sections = document.get("required_sections", [])
        if not isinstance(sections, list) or not sections:
            errors.append(
                f"{prefix}review_documents[{index}].required_sections "
                "must be a non-empty list"
            )
        covers = document.get("covers_knowledge_ids", [])
        if not isinstance(covers, list) or not covers:
            errors.append(
                f"{prefix}review_documents[{index}].covers_knowledge_ids "
                "must be a non-empty list"
            )
            continue
        for knowledge_id in covers:
            if knowledge_id not in knowledge_ids:
                errors.append(
                    f"{prefix}review_documents[{index}] covers unknown "
                    f"knowledge_id {knowledge_id}"
                )
            else:
                reviewed_knowledge_ids.add(str(knowledge_id))
    if value.get("policies", {}).get("require_review_drafts"):
        if not review_documents:
            errors.append(f"{prefix}review_documents are required by policy")
        missing_reviews = sorted(knowledge_ids - reviewed_knowledge_ids)
        if missing_reviews:
            errors.append(
                f"{prefix}review drafts do not cover knowledge_ids: "
                f"{', '.join(missing_reviews)}"
            )
    context_pack = value.get("context_pack", {})
    if not isinstance(context_pack, dict):
        errors.append(f"{prefix}context_pack must be an object")
    else:
        for field in ("topology", "impact_index", "retrieval_cards", "gaps"):
            if field not in context_pack:
                errors.append(f"{prefix}context_pack.{field} is required")
    return errors


def calculate_blueprint_coverage(
    blueprint: dict[str, Any],
    facts: dict[str, Any],
) -> dict[str, Any]:
    slots = facts.get("slots", {})
    if not isinstance(slots, dict):
        raise ValidationFailure("facts.slots must be an object")
    rows: list[dict[str, Any]] = []
    requests: list[dict[str, Any]] = []
    required_total = 0
    required_covered = 0
    required_constrained = 0
    for slot in blueprint.get("knowledge_slots", []):
        slot_id = str(slot["id"])
        required = bool(slot.get("required"))
        eligible = slots.get(slot_id, {}).get("eligible_claims", [])
        if not isinstance(eligible, list):
            raise ValidationFailure(f"facts.slots.{slot_id}.eligible_claims must be a list")
        accepted_types = set(slot.get("accepted_fact_types", []))
        accepted: list[dict[str, Any]] = []
        constrained: list[dict[str, Any]] = []
        rejected: list[dict[str, Any]] = []
        for raw_claim in eligible:
            if not isinstance(raw_claim, dict):
                rejected.append({"claim": raw_claim, "reasons": ["not-an-eligible-claim"]})
                continue
            reasons: list[str] = []
            if raw_claim.get("revision") != raw_claim.get("latest_revision"):
                reasons.append("not-latest-revision")
            if raw_claim.get("status") != "active":
                reasons.append("status-not-active")
            if raw_claim.get("fact_type") not in accepted_types:
                reasons.append("fact-type-not-accepted")
            if raw_claim.get("scope_match") is not True:
                reasons.append("scope-mismatch")
            if raw_claim.get("evidence_valid") is not True:
                reasons.append("evidence-invalid")
            if raw_claim.get("evidence_reproducible") is not True:
                reasons.append("evidence-not-reproducible")
            verdict = raw_claim.get("verdict")
            if verdict not in FULL_VERDICTS | CONSTRAINED_VERDICTS:
                reasons.append("verdict-not-eligible")
            if reasons:
                rejected.append({"claim": raw_claim, "reasons": reasons})
            elif verdict in CONSTRAINED_VERDICTS:
                constrained.append(raw_claim)
            else:
                accepted.append(raw_claim)
        covered = bool(accepted)
        constrained_only = not covered and bool(constrained)
        if required:
            required_total += 1
            required_covered += int(covered)
            required_constrained += int(constrained_only)
        rows.append({
            "slot_id": slot_id,
            "required": required,
            "covered": covered,
            "constrained": constrained_only,
            "eligible_claims": accepted,
            "constrained_claims": constrained,
            "rejected_claims": rejected,
        })
        if required and not covered:
            requests.append({
                "request_id": f"observe-{blueprint.get('blueprint_id')}-{slot_id}",
                "blueprint_id": blueprint.get("blueprint_id"),
                "slot_id": slot_id,
                "reason": "missing-evidence",
                "required_fact_types": slot.get("accepted_fact_types", []),
                "scope": blueprint.get("scope", {}),
                "suggested_sources": [],
                "priority": "high",
            })
    ratio = 1.0 if required_total == 0 else required_covered / required_total
    minimum = float(blueprint.get("policies", {}).get("minimum_slot_coverage", 1.0))
    return {
        "coverage": {
            "required_total": required_total,
            "required_covered": required_covered,
            "required_constrained": required_constrained,
            "ratio": ratio,
            "minimum": minimum,
            "gate_passed": ratio >= minimum,
            "allow_partial_synthesis": bool(
                blueprint.get("policies", {}).get("allow_partial_synthesis")
            ),
            "slots": rows,
        },
        "observation_requests": requests,
    }


def validate_context_pack(bundle: Path, folder_name: str = "context-pack") -> list[str]:
    errors: list[str] = []
    folder = bundle / folder_name
    parsed: dict[str, Any] = {}
    for name in CONTEXT_FILES:
        path = folder / name
        if not path.is_file():
            errors.append(f"{path}: required context-pack file is missing")
            continue
        try:
            if name.endswith(".jsonl"):
                values = [value for _, value in iter_jsonl(path)]
                if not values:
                    errors.append(f"{path}: required context-pack file must not be empty")
                parsed[name] = values
            else:
                parsed[name] = load_structured(path)
        except ValidationFailure as exc:
            errors.append(str(exc))
    manifest = parsed.get("context-manifest.json", {})
    if not isinstance(manifest, dict):
        return errors
    required_manifest = (
        "schema_version", "synthesis_id", "knowledge_ids", "claim_refs",
        "subject_ids", "repository_ids", "evidence_ids", "slot_ids",
        "observation_request_ids", "finding_ids", "source_versions",
    )
    for field in required_manifest:
        if field not in manifest:
            errors.append(f"context-manifest.json: missing required field {field}")
    knowledge_ids = set(manifest.get("knowledge_ids", []))
    claim_refs = set(manifest.get("claim_refs", []))
    subject_ids = set(manifest.get("subject_ids", []))
    repository_ids = set(manifest.get("repository_ids", []))
    evidence_ids = set(manifest.get("evidence_ids", []))
    slot_ids = set(manifest.get("slot_ids", []))
    observation_request_ids = set(manifest.get("observation_request_ids", []))
    finding_ids = set(manifest.get("finding_ids", []))
    routed_knowledge_ids: set[str] = set()
    for index, card in enumerate(parsed.get("retrieval-cards.jsonl", [])):
        for field in ("retrieval_id", "knowledge_ids", "claim_refs", "subject_ids"):
            if field not in card:
                errors.append(f"retrieval-cards.jsonl[{index}]: missing {field}")
        for field in ("intents", "terms", "task_types"):
            if not isinstance(card.get(field), list) or not card.get(field):
                errors.append(f"retrieval-cards.jsonl[{index}]: missing {field}")
        for value in card.get("knowledge_ids", []):
            routed_knowledge_ids.add(value)
            if value not in knowledge_ids:
                errors.append(f"retrieval-cards.jsonl[{index}]: dangling knowledge_id {value}")
        for value in card.get("claim_refs", []):
            if value not in claim_refs:
                errors.append(f"retrieval-cards.jsonl[{index}]: dangling claim_ref {value}")
        for value in card.get("subject_ids", []):
            if value not in subject_ids:
                errors.append(f"retrieval-cards.jsonl[{index}]: dangling subject_id {value}")
    missing_retrieval = sorted(knowledge_ids - routed_knowledge_ids)
    for knowledge_id in missing_retrieval:
        errors.append(
            f"retrieval-cards.jsonl: retrieval coverage missing knowledge_id {knowledge_id}"
        )
    typed_repository_ids: set[str] = set()
    non_repository_ids: set[str] = set()
    for index, edge in enumerate(parsed.get("topology.jsonl", [])):
        for field in (
            "edge_id", "from", "to", "relation", "claim_refs",
            "evidence_refs", "source_versions", "verification_status",
        ):
            if field not in edge or edge.get(field) is None or edge.get(field) == "":
                errors.append(f"topology.jsonl[{index}]: missing {field}")
        if "from_repository" in edge or "to_repository" in edge:
            errors.append(
                f"topology.jsonl[{index}]: legacy from_repository/to_repository "
                "is forbidden; typed endpoints are required"
            )
        for field in ("from", "to"):
            endpoint = edge.get(field)
            if not isinstance(endpoint, dict) or not endpoint.get("type") or not endpoint.get("id"):
                errors.append(
                    f"topology.jsonl[{index}]: {field} must be a typed endpoint"
                )
                continue
            node_type = endpoint.get("type")
            node_id = str(endpoint.get("id"))
            if node_type not in TOPOLOGY_NODE_TYPES:
                errors.append(
                    f"topology.jsonl[{index}]: invalid node type {node_type}"
                )
            if node_type == "repository":
                typed_repository_ids.add(node_id)
                if node_id not in repository_ids:
                    errors.append(
                        f"topology.jsonl[{index}]: dangling repository_id {node_id}"
                    )
            else:
                non_repository_ids.add(node_id)
        for value in edge.get("claim_refs", []):
            if value not in claim_refs:
                errors.append(f"topology.jsonl[{index}]: dangling claim_ref {value}")
        for value in edge.get("evidence_refs", []):
            if value not in evidence_ids:
                errors.append(f"topology.jsonl[{index}]: dangling evidence_ref {value}")
    for value in sorted(repository_ids & non_repository_ids):
        errors.append(
            f"context-manifest.json: non-repository entity appears in repository_ids: {value}"
        )
    for value in sorted(repository_ids - typed_repository_ids):
        errors.append(
            f"context-manifest.json: repository_id has no typed repository node: {value}"
        )
    impacted_knowledge_ids: set[str] = set()
    for index, impact in enumerate(parsed.get("impact-index.jsonl", [])):
        for field in (
            "impact_id", "knowledge_id", "slot_ids", "claim_refs",
            "evidence_refs", "repository_ids", "symbols",
        ):
            if not impact.get(field):
                errors.append(f"impact-index.jsonl[{index}]: missing {field}")
        if impact.get("knowledge_id") not in knowledge_ids:
            errors.append(
                f"impact-index.jsonl[{index}]: dangling knowledge_id "
                f"{impact.get('knowledge_id')}"
            )
        else:
            impacted_knowledge_ids.add(impact.get("knowledge_id"))
        for value in impact.get("claim_refs", []):
            if value not in claim_refs:
                errors.append(f"impact-index.jsonl[{index}]: dangling claim_ref {value}")
        for value in impact.get("slot_ids", []):
            if value not in slot_ids:
                errors.append(f"impact-index.jsonl[{index}]: dangling slot_id {value}")
        for value in impact.get("evidence_refs", []):
            if value not in evidence_ids:
                errors.append(f"impact-index.jsonl[{index}]: dangling evidence_ref {value}")
        for value in impact.get("repository_ids", []):
            if value not in repository_ids:
                errors.append(f"impact-index.jsonl[{index}]: dangling repository_id {value}")
    for index, gap in enumerate(parsed.get("gaps.jsonl", [])):
        if not gap.get("gap_id") or not gap.get("slot_id"):
            errors.append(f"gaps.jsonl[{index}]: gap_id and slot_id are required")
        if not gap.get("observation_request_id") and not gap.get("finding_id"):
            errors.append(
                f"gaps.jsonl[{index}]: observation_request_id or finding_id is required"
            )
        if gap.get("slot_id") not in slot_ids:
            errors.append(f"gaps.jsonl[{index}]: dangling slot_id {gap.get('slot_id')}")
        if (
            gap.get("observation_request_id")
            and gap["observation_request_id"] not in observation_request_ids
        ):
            errors.append(
                f"gaps.jsonl[{index}]: dangling observation_request_id "
                f"{gap['observation_request_id']}"
            )
        if gap.get("finding_id") and gap["finding_id"] not in finding_ids:
            errors.append(f"gaps.jsonl[{index}]: dangling finding_id {gap['finding_id']}")
    for knowledge_id in sorted(knowledge_ids - impacted_knowledge_ids):
        errors.append(
            f"impact-index.jsonl: impact coverage missing knowledge_id {knowledge_id}"
        )
    return errors


def _markdown_statements(value: str) -> list[str]:
    paragraphs = re.split(r"\n\s*\n", value)
    return [
        " ".join(line.strip() for line in paragraph.splitlines()).strip()
        for paragraph in paragraphs
        if paragraph.strip() and not paragraph.lstrip().startswith(("#", "<!--"))
    ]


def validate_statement_sidecar(
    bundle: Path,
    artifact: dict[str, Any],
    known_claim_refs: set[str],
) -> list[str]:
    errors: list[str] = []
    source = bundle / str(artifact.get("source", ""))
    sidecar_value = artifact.get("statements")
    if not artifact.get("knowledge_id") or not sidecar_value:
        return ["knowledge artifact requires knowledge_id and statements sidecar"]
    sidecar = bundle / str(sidecar_value)
    if not sidecar.is_file():
        return [f"statement sidecar does not exist: {sidecar_value}"]
    rows = [value for _, value in iter_jsonl(sidecar)]
    mapped_hashes: set[str] = set()
    for index, row in enumerate(rows):
        for field in ("statement_id", "type", "text", "text_hash"):
            if not row.get(field):
                errors.append(f"{sidecar_value}[{index}]: missing {field}")
        expected = sha256_bytes(str(row.get("text", "")).encode())
        if row.get("text_hash") != expected:
            errors.append(f"{sidecar_value}[{index}]: text_hash mismatch")
        mapped_hashes.add(expected)
        statement_type = row.get("type")
        text = str(row.get("text", ""))
        if statement_type not in {"fact", "example", "gap"}:
            errors.append(f"{sidecar_value}[{index}]: invalid statement type")
        if statement_type == "fact":
            refs = row.get("claim_refs", [])
            if not refs:
                errors.append(f"{sidecar_value}[{index}]: fact requires claim_refs")
            for ref in refs:
                if ref not in known_claim_refs:
                    errors.append(f"{sidecar_value}[{index}]: dangling claim_ref {ref}")
        elif statement_type == "example":
            if row.get("non_factual") is not True:
                errors.append(
                    f"{sidecar_value}[{index}]: example requires non_factual=true"
                )
            if row.get("claim_refs") or CLAIM_MARKER_PATTERN.search(text):
                errors.append(
                    f"{sidecar_value}[{index}]: example must not contain Claim, "
                    "Verdict, or Evidence references"
                )
        elif statement_type == "gap":
            if CLAIM_MARKER_PATTERN.search(text):
                errors.append(
                    f"{sidecar_value}[{index}]: gap must not disguise supported facts"
                )
        if PROCESS_STATE_PATTERN.search(text):
            errors.append(
                f"{sidecar_value}[{index}]: business knowledge contains process state"
            )
    for statement in _markdown_statements(source.read_text(encoding="utf-8")):
        if sha256_bytes(statement.encode()) not in mapped_hashes:
            errors.append(f"{artifact.get('source')}: statement mapping missing: {statement}")
    return errors


def find_synthesis_manifest(bundle: Path) -> Path:
    for name in ("synthesis-manifest.yaml", "synthesis-manifest.yml", "synthesis-manifest.json"):
        path = bundle / name
        if path.is_file():
            return path
    raise ValidationFailure(f"{bundle}: synthesis manifest is missing")


def validate_synthesis_bundle(
    bundle: Path,
    blueprint: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], list[str]]:
    errors = validate_context_pack(bundle)
    try:
        manifest_path = find_synthesis_manifest(bundle)
        manifest = load_structured(manifest_path)
    except ValidationFailure as exc:
        return {}, [str(exc), *errors]
    for field in (
        "schema_version", "synthesis_id", "status", "verification_status",
        "findings", "freshness", "artifacts",
    ):
        if field not in manifest:
            errors.append(f"{manifest_path}: missing required field {field}")
    if manifest.get("schema_version") != "1":
        errors.append(f'{manifest_path}: schema_version must be "1"')
    if manifest.get("blueprint_id") and blueprint is None:
        errors.append("--blueprint is required for a Blueprint-bound Synthesis Bundle")
    context_manifest_path = bundle / "context-pack" / "context-manifest.json"
    context_manifest = (
        load_structured(context_manifest_path) if context_manifest_path.is_file() else {}
    )
    if context_manifest.get("synthesis_id") != manifest.get("synthesis_id"):
        errors.append("context manifest synthesis_id does not match synthesis manifest")
    known_claim_refs = set(context_manifest.get("claim_refs", []))
    artifacts = manifest.get("artifacts", [])
    if not isinstance(artifacts, list):
        errors.append(f"{manifest_path}: artifacts must be a list")
        artifacts = []
    change_ids: set[str] = set()
    for index, artifact in enumerate(artifacts):
        if not isinstance(artifact, dict):
            errors.append(f"{manifest_path}: artifacts[{index}] must be an object")
            continue
        for field in ("change_id", "change_type", "source", "target"):
            if not artifact.get(field):
                errors.append(f"{manifest_path}: artifacts[{index}].{field} is required")
        change_id = artifact.get("change_id")
        if change_id in change_ids:
            errors.append(f"{manifest_path}: duplicate change_id {change_id}")
        change_ids.add(change_id)
        if artifact.get("change_type") not in CHANGE_TYPES:
            errors.append(
                f"{manifest_path}: artifacts[{index}].change_type is invalid"
            )
        source, source_error = _safe_relative(
            artifact.get("source"), f"artifacts[{index}].source"
        )
        _, target_error = _safe_relative(
            artifact.get("target"), f"artifacts[{index}].target"
        )
        if source_error:
            errors.append(f"{manifest_path}: {source_error}")
        elif not (bundle / Path(str(source))).is_file():
            errors.append(f"{manifest_path}: source does not exist: {source}")
        if target_error:
            errors.append(f"{manifest_path}: {target_error}")
        if artifact.get("kind", "knowledge") == "knowledge":
            errors.extend(validate_statement_sidecar(bundle, artifact, known_claim_refs))
            source_path = bundle / str(artifact.get("source", ""))
            if source_path.is_file():
                text = source_path.read_text(encoding="utf-8")
                if PROCESS_STATE_PATTERN.search(text):
                    errors.append(
                        f"{artifact.get('source')}: business knowledge contains process state"
                    )
                for section in artifact.get("required_sections", []):
                    if not re.search(
                        rf"(?m)^#+\s+{re.escape(str(section))}\s*$", text,
                    ):
                        errors.append(
                            f"{artifact.get('source')}: required section missing: {section}"
                        )
    if blueprint is not None:
        errors.extend(validate_blueprint(blueprint))
        if not manifest.get("publication_id"):
            errors.append(
                "synthesis manifest publication_id is required for stable Knowledge Coordinates"
            )
        if manifest.get("blueprint_id") != blueprint.get("blueprint_id"):
            errors.append("synthesis manifest blueprint_id does not match Blueprint")
        if manifest.get("domain_id") != blueprint.get("domain_id"):
            errors.append("synthesis manifest domain_id does not match Blueprint")
        artifacts_by_knowledge = {
            item.get("knowledge_id"): item
            for item in artifacts if isinstance(item, dict)
        }
        for document in blueprint.get("documents", []):
            knowledge_id = document.get("knowledge_id")
            artifact = artifacts_by_knowledge.get(knowledge_id)
            if not artifact:
                errors.append(f"Blueprint knowledge document is missing: {knowledge_id}")
                continue
            source_path = bundle / str(artifact.get("source", ""))
            text = source_path.read_text(encoding="utf-8") if source_path.is_file() else ""
            for section in document.get("required_sections", []):
                if not re.search(rf"(?m)^#+\s+{re.escape(str(section))}\s*$", text):
                    errors.append(
                        f"{artifact.get('source')}: Blueprint required section missing: {section}"
                    )
        review_documents = blueprint.get("review_documents", [])
        if blueprint.get("policies", {}).get("require_review_drafts"):
            for artifact in artifacts:
                source = str(artifact.get("source", ""))
                if artifact.get("kind", "knowledge") == "knowledge" and not source.startswith(
                    "agent-knowledge/"
                ):
                    errors.append(
                        f"{source}: publishable knowledge must be sourced "
                        "from agent-knowledge/"
                    )
            review_artifacts = manifest.get("review_artifacts", [])
            if not isinstance(review_artifacts, list):
                errors.append("synthesis manifest review_artifacts must be a list")
                review_artifacts = []
            review_by_id = {
                item.get("review_id"): item
                for item in review_artifacts if isinstance(item, dict)
            }
            for review_document in review_documents:
                review_id = review_document.get("review_id")
                review_artifact = review_by_id.get(review_id)
                if not review_artifact:
                    errors.append(f"review draft is missing: {review_id}")
                    continue
                source, source_error = _safe_relative(
                    review_artifact.get("source"),
                    f"review_artifacts[{review_id}].source",
                )
                if source_error:
                    errors.append(source_error)
                    continue
                source_path = bundle / Path(str(source))
                if not source_path.is_file():
                    errors.append(f"review draft source does not exist: {source}")
                    continue
                actual_covers = set(
                    review_artifact.get("covers_knowledge_ids", [])
                )
                expected_covers = set(
                    review_document.get("covers_knowledge_ids", [])
                )
                if actual_covers != expected_covers:
                    errors.append(
                        f"review draft knowledge coverage mismatch: {review_id}"
                    )
                text = source_path.read_text(encoding="utf-8")
                errors.extend(validate_review_draft_surface(
                    str(source),
                    text,
                    list(review_document.get("required_sections", [])),
                    expected_covers,
                ))
        approval_bundle = bundle / "approval-bundle.md"
        if not approval_bundle.is_file():
            errors.append("approval-bundle.md is required")
        else:
            approval_text = approval_bundle.read_text(encoding="utf-8")
            if str(manifest.get("synthesis_id")) not in approval_text:
                errors.append("approval-bundle.md synthesis_id does not match")
            for artifact in artifacts:
                change_id = str(artifact.get("change_id", ""))
                if change_id and change_id not in approval_text:
                    errors.append(
                        f"approval-bundle.md missing change_id: {change_id}"
                    )
            for review_artifact in manifest.get("review_artifacts", []):
                review_id = str(review_artifact.get("review_id", ""))
                if review_id and review_id not in approval_text:
                    errors.append(
                        f"approval-bundle.md missing review_id: {review_id}"
                    )
    return manifest, errors


def validate_publication_policy(
    value: dict[str, Any],
    path: Path | None = None,
) -> list[str]:
    prefix = f"{path}: " if path else ""
    errors: list[str] = []
    knowledge_mode = any(
        field in value for field in (
            "knowledge_route", "domain_manifest_route", "registry_route",
            "gateway_route",
        )
    )
    for field in (
        "schema_version", "policy_id", "allowed_roots",
        "required_approvals", "allowed_verification_statuses", "finding_gates",
        "freshness_policy", "index_targets", "context_pack_route",
        "rollback_policy",
    ):
        if field not in value:
            errors.append(f"{prefix}missing required field {field}")
    if value.get("schema_version") != "1":
        errors.append(f'{prefix}schema_version must be "1"')
    roots = value.get("allowed_roots", [])
    if not isinstance(roots, list) or not roots:
        errors.append(f"{prefix}allowed_roots must be a non-empty list")
        roots = []
    for index, root in enumerate(roots):
        _, error = _safe_relative(root, f"allowed_roots[{index}]")
        if error:
            errors.append(f"{prefix}{error}")
    if not knowledge_mode and "routes" not in value:
        errors.append(f"{prefix}missing required field routes")
    routes = value.get("routes", [])
    if not isinstance(routes, list):
        errors.append(f"{prefix}routes must be a list")
        routes = []
    for index, route in enumerate(routes):
        if not isinstance(route, dict):
            errors.append(f"{prefix}routes[{index}] must be an object")
            continue
        if not route.get("knowledge_id") and not route.get("match"):
            errors.append(
                f"{prefix}routes[{index}] requires knowledge_id or match"
            )
        target, error = _safe_relative(route.get("target"), f"routes[{index}].target")
        if error:
            errors.append(f"{prefix}{error}")
        elif not _target_allowed(target, roots):
            errors.append(f"{prefix}routes[{index}].target is outside allowed_roots")
    for field in (
        "required_approvals", "allowed_verification_statuses",
        "finding_gates", "index_targets",
    ):
        if field in value and not isinstance(value[field], list):
            errors.append(f"{prefix}{field} must be a list")
    for index, target_value in enumerate(value.get("index_targets", [])):
        target, error = _safe_relative(
            target_value, f"index_targets[{index}]",
        )
        if error:
            errors.append(f"{prefix}{error}")
        elif not _target_allowed(target, roots):
            errors.append(f"{prefix}index_targets[{index}] is outside allowed_roots")
    for field in ("freshness_policy", "rollback_policy"):
        if field in value and not isinstance(value[field], dict):
            errors.append(f"{prefix}{field} must be an object")
    context_route = value.get("context_pack_route")
    if not isinstance(context_route, dict):
        errors.append(f"{prefix}context_pack_route must be an object")
    else:
        route_target, error = _safe_relative(
            context_route.get("target"), "context_pack_route.target",
        )
        if error:
            errors.append(f"{prefix}{error}")
        elif not _target_allowed(route_target, roots):
            errors.append(f"{prefix}context_pack_route.target is outside allowed_roots")
        if context_route.get("mode") != "copy":
            errors.append(f"{prefix}context_pack_route.mode must be copy")
    if knowledge_mode:
        for field in ("domain_id", "knowledge_route", "domain_manifest_route", "registry_route"):
            if not value.get(field):
                errors.append(f"{prefix}{field} is required for knowledge publication")
        for field in ("knowledge_route", "domain_manifest_route", "registry_route"):
            route = value.get(field)
            if not isinstance(route, dict):
                continue
            target, error = _safe_relative(route.get("target"), f"{field}.target")
            if error:
                errors.append(f"{prefix}{error}")
            elif not _target_allowed(target, roots):
                errors.append(f"{prefix}{field}.target is outside allowed_roots")
        knowledge_route = value.get("knowledge_route", {})
        if isinstance(knowledge_route, dict) and knowledge_route.get("immutable") is not True:
            errors.append(f"{prefix}knowledge_route.immutable must be true")
        gateway = value.get("gateway_route", {})
        if gateway.get("enabled"):
            target, error = _safe_relative(
                gateway.get("target"), "gateway_route.target",
            )
            if error:
                errors.append(f"{prefix}{error}")
            elif not _target_allowed(target, roots):
                errors.append(f"{prefix}gateway_route.target is outside allowed_roots")
            if gateway.get("mode") != "thin-link":
                errors.append(f"{prefix}gateway_route.mode must be thin-link")
        for index, route in enumerate(routes):
            if (
                isinstance(route, dict)
                and str(route.get("target", "")).startswith("wiki/")
            ):
                errors.append(
                    f"{prefix}routes[{index}] cannot publish knowledge into wiki"
                )
    return errors


def validate_approval(
    value: dict[str, Any],
    path: Path | None = None,
) -> list[str]:
    prefix = f"{path}: " if path else ""
    errors: list[str] = []
    for field in (
        "schema_version", "approval_id", "synthesis_id", "bundle_hash",
        "status", "approved_at", "approvers", "decisions",
    ):
        if field not in value:
            errors.append(f"{prefix}missing required field {field}")
    if value.get("schema_version") != "1":
        errors.append(f'{prefix}schema_version must be "1"')
    if value.get("status") != "approved":
        errors.append(f"{prefix}status must be approved")
    approvers = value.get("approvers", [])
    if not isinstance(approvers, list):
        errors.append(f"{prefix}approvers must be a list")
    else:
        for index, approver in enumerate(approvers):
            if not isinstance(approver, dict):
                errors.append(f"{prefix}approvers[{index}] must be an object")
                continue
            for field in ("role", "identity"):
                if not approver.get(field):
                    errors.append(f"{prefix}approvers[{index}].{field} is required")
    decisions = value.get("decisions", [])
    if not isinstance(decisions, list):
        errors.append(f"{prefix}decisions must be a list")
    else:
        for index, decision in enumerate(decisions):
            if not isinstance(decision, dict):
                errors.append(f"{prefix}decisions[{index}] must be an object")
                continue
            if not decision.get("change_id"):
                errors.append(f"{prefix}decisions[{index}].change_id is required")
            if decision.get("decision") not in {"approve", "reject", "defer"}:
                errors.append(f"{prefix}decisions[{index}].decision is invalid")
    return errors


def validate_observe_approval_bundle(
    value: dict[str, Any],
    path: Path | None = None,
) -> list[str]:
    """Validate the executable Wiki-only approval contract from docs-observe."""
    prefix = f"{path}: " if path else ""
    errors: list[str] = []
    allowed_fields = {
        "schema_version", "bundle_id", "run_id", "status", "created_at",
        "source_versions", "items", "approvals", "notes",
    }
    unknown_fields = sorted(set(value) - allowed_fields)
    for field in unknown_fields:
        errors.append(f"{prefix}unknown field {field}")
    for field in (
        "schema_version", "bundle_id", "run_id", "status", "created_at",
        "source_versions", "items",
    ):
        if field not in value:
            errors.append(f"{prefix}missing required field {field}")
    if value.get("schema_version") != "1":
        errors.append(f'{prefix}schema_version must be "1"')
    if value.get("status") not in {
        "pending-approval", "partially-approved", "approved", "applied",
        "rejected", "stale",
    }:
        errors.append(f"{prefix}status is invalid")
    source_versions = value.get("source_versions")
    if not isinstance(source_versions, list) or not source_versions:
        errors.append(f"{prefix}source_versions must be a non-empty list")
    items = value.get("items")
    if not isinstance(items, list) or not items:
        errors.append(f"{prefix}items must be a non-empty list")
        return errors
    seen: set[str] = set()
    item_fields = {
        "item_id", "type", "target", "target_hash", "candidate_patch",
        "required_roles", "claim_ids", "finding_ids", "description",
    }
    for index, item in enumerate(items):
        item_prefix = f"{prefix}items[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{item_prefix} must be an object")
            continue
        for field in sorted(set(item) - item_fields):
            errors.append(f"{item_prefix} has unknown field {field}")
        for field in (
            "item_id", "type", "target", "target_hash", "candidate_patch",
            "required_roles",
        ):
            if field not in item:
                errors.append(f"{item_prefix}.{field} is required")
        item_id = item.get("item_id")
        if item_id in seen:
            errors.append(f"{item_prefix}.item_id is duplicated: {item_id}")
        if isinstance(item_id, str):
            seen.add(item_id)
        item_type = item.get("type")
        if item_type not in OBSERVE_APPROVAL_ITEM_TYPES:
            errors.append(
                f"{item_prefix}.type is unknown or not executable by docs-approve"
            )
        target, target_error = _safe_relative(item.get("target"), f"items[{index}].target")
        if target_error:
            errors.append(f"{prefix}{target_error}")
        elif not str(target).startswith("wiki/"):
            errors.append(f"{item_prefix}.target must be under wiki/")
        patch, patch_error = _safe_relative(
            item.get("candidate_patch"), f"items[{index}].candidate_patch",
        )
        if patch_error:
            errors.append(f"{prefix}{patch_error}")
        elif not str(patch).startswith("candidate-patches/"):
            errors.append(
                f"{item_prefix}.candidate_patch must be under candidate-patches/"
            )
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(item.get("target_hash", ""))):
            errors.append(f"{item_prefix}.target_hash must be a sha256 fingerprint")
        roles = item.get("required_roles")
        if not isinstance(roles, list) or not roles:
            errors.append(f"{item_prefix}.required_roles must be a non-empty list")
            roles = []
        unknown_roles = sorted(set(str(role) for role in roles) - OBSERVE_APPROVAL_ROLES)
        if unknown_roles:
            errors.append(f"{item_prefix}.required_roles contains unknown roles")
        required_by_type = {
            "reference-fix": {"wiki-maintainer"},
            "business-intent-change": {"business-owner"},
            "implementation-assertion-change": {"code-owner"},
            "mixed-semantic-change": {"business-owner", "code-owner"},
        }.get(str(item_type), set())
        if not required_by_type.issubset(set(roles)):
            errors.append(
                f"{item_prefix}.required_roles does not satisfy {item_type}"
            )
    return errors


def _target_allowed(target: PurePosixPath, allowed_roots: list[str]) -> bool:
    return any(
        target == PurePosixPath(root) or PurePosixPath(root) in target.parents
        for root in allowed_roots
    )


def evaluate_policy_gates(
    manifest: dict[str, Any],
    policy: dict[str, Any],
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    errors: list[str] = []
    gates: dict[str, dict[str, Any]] = {}
    verification = manifest.get("verification_status")
    allowed = policy.get("allowed_verification_statuses", [])
    verification_pass = verification in allowed
    gates["verification_status"] = {
        "status": "pass" if verification_pass else "fail",
        "actual": verification,
        "allowed": allowed,
    }
    if not verification_pass:
        errors.append(f"verification_status is not allowed: {verification}")

    blocked_findings: list[str] = []
    findings = manifest.get("findings", [])
    for rule in policy.get("finding_gates", []):
        if not isinstance(rule, dict):
            continue
        severity = rule.get("severity")
        block_statuses = set(rule.get("block_statuses", ["open"]))
        for finding in findings:
            if (
                isinstance(finding, dict)
                and finding.get("severity") == severity
            ):
                blocked = finding.get("status") in block_statuses
                if rule.get("require_disposition") and not finding.get("disposition"):
                    blocked = True
                if rule.get("require_disclosure") and finding.get("disclosed") is not True:
                    blocked = True
                if blocked:
                    blocked_findings.append(str(finding.get("finding_id", "unknown")))
    gates["findings"] = {
        "status": "fail" if blocked_findings else "pass",
        "blocked": blocked_findings,
    }
    if blocked_findings:
        errors.append(f"blocked critical findings: {', '.join(blocked_findings)}")

    freshness = manifest.get("freshness", {})
    freshness_policy = policy.get("freshness_policy", {})
    freshness_failures: list[str] = []
    if (
        freshness_policy.get("require_current_claim_revision")
        and freshness.get("claim_revisions_current") is not True
    ):
        freshness_failures.append("claim revisions are stale")
    if (
        freshness_policy.get("require_source_version_match")
        and freshness.get("source_versions_current") is not True
    ):
        freshness_failures.append("source versions are stale")
    gates["freshness"] = {
        "status": "fail" if freshness_failures else "pass",
        "failures": freshness_failures,
    }
    errors.extend(freshness_failures)

    rollback = policy.get("rollback_policy", {})
    rollback_pass = (
        rollback.get("require_after_hash_match") is True
        and rollback.get("preserve_publication_record") is True
    )
    gates["rollback"] = {"status": "pass" if rollback_pass else "fail"}
    if not rollback_pass:
        errors.append("rollback_policy must require after-hash matching and record preservation")
    return gates, errors


def _expand_publication_route(
    value: Any,
    domain_id: str,
    publication_id: str,
    synthesis_id: str,
) -> PurePosixPath:
    return PurePosixPath(
        str(value)
        .replace("{domain_id}", domain_id)
        .replace("{publication_id}", publication_id)
        .replace("{synthesis_id}", synthesis_id)
    )


def _json_content(value: dict[str, Any]) -> str:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, indent=2,
    ) + "\n"


def _routing_terms(bundle: Path, domain_id: str) -> tuple[list[str], list[str]]:
    intents: set[str] = set()
    terms: set[str] = set()
    for _, row in iter_jsonl(bundle / "context-pack" / "retrieval-cards.jsonl"):
        intents.update(str(item) for item in row.get("intents", []) if item)
        terms.update(str(item) for item in row.get("terms", []) if item)
    return sorted(intents or {domain_id}), sorted(terms or {domain_id})


def plan_publication(
    root: Path,
    bundle: Path,
    policy: dict[str, Any],
    approval: dict[str, Any],
    publication_id: str | None = None,
    blueprint: dict[str, Any] | None = None,
) -> dict[str, Any]:
    manifest, errors = validate_synthesis_bundle(bundle, blueprint)
    errors.extend(validate_publication_policy(policy))
    errors.extend(validate_approval(approval))
    fingerprint = tree_fingerprint(bundle)
    gates, gate_errors = evaluate_policy_gates(manifest, policy)
    errors.extend(gate_errors)
    if approval.get("bundle_hash") != fingerprint:
        errors.append(
            f"approval bundle_hash does not match bundle: "
            f"{approval.get('bundle_hash')} != {fingerprint}"
        )
    if approval.get("synthesis_id") != manifest.get("synthesis_id"):
        errors.append("approval synthesis_id does not match synthesis manifest")
    required_roles = set(policy.get("required_approvals", []))
    actual_roles = {
        item.get("role") for item in approval.get("approvers", [])
        if isinstance(item, dict)
    }
    missing_roles = sorted(required_roles - actual_roles)
    if missing_roles:
        errors.append(f"missing required approval roles: {', '.join(missing_roles)}")
    approved = {
        item.get("change_id") for item in approval.get("decisions", [])
        if isinstance(item, dict) and item.get("decision") == "approve"
    }
    allowed_roots = policy.get("allowed_roots", [])
    routes_by_knowledge_id = {
        route["knowledge_id"]: route["target"]
        for route in policy.get("routes", [])
        if isinstance(route, dict) and route.get("knowledge_id") and route.get("target")
    }
    synthesis_id = str(manifest.get("synthesis_id", "unknown"))
    knowledge_mode = "knowledge_route" in policy
    domain_id = str(policy.get("domain_id") or manifest.get("domain_id") or "")
    if knowledge_mode and not publication_id:
        errors.append("--publication-id is required for knowledge publication")
    if knowledge_mode and blueprint is None:
        errors.append("--blueprint is required for knowledge publication")
    if (
        knowledge_mode
        and publication_id
        and manifest.get("publication_id") != publication_id
    ):
        errors.append(
            "publication_id does not match the Blueprint-bound Synthesis Bundle"
        )
    if knowledge_mode and manifest.get("domain_id") not in {None, domain_id}:
        errors.append("synthesis manifest domain_id conflicts with publication policy")
    publication_value = publication_id or synthesis_id
    knowledge_root = (
        _expand_publication_route(
            policy.get("knowledge_route", {}).get("target", ""),
            domain_id, publication_value, synthesis_id,
        )
        if knowledge_mode else None
    )
    planned: list[dict[str, Any]] = []
    for artifact in manifest.get("artifacts", []):
        change_id = artifact.get("change_id")
        if artifact.get("change_type") not in IMPLEMENTED_CHANGE_TYPES:
            errors.append(
                f"change type {artifact.get('change_type')} is not implemented safely"
            )
        if change_id not in approved:
            errors.append(f"change_id is not approved: {change_id}")
        source = PurePosixPath(str(artifact.get("source", "")))
        routed_target = routes_by_knowledge_id.get(artifact.get("knowledge_id"))
        raw_target = routed_target or artifact.get("target", "")
        target = _expand_publication_route(
            raw_target, domain_id, publication_value, synthesis_id,
        )
        if routed_target and artifact.get("target") not in {None, routed_target}:
            errors.append(
                f"artifact target conflicts with policy route: {change_id}"
            )
        if not _target_allowed(target, allowed_roots):
            errors.append(f"target is outside allowed_roots: {target}")
            continue
        if (
            knowledge_root is not None
            and target != knowledge_root
            and knowledge_root not in target.parents
        ):
            errors.append(f"knowledge target is outside immutable publication: {target}")
            continue
        source_path = bundle / Path(str(source))
        target_path = root / Path(str(target))
        after_hash = sha256_file(source_path) if source_path.is_file() else None
        before_hash = sha256_file(target_path) if target_path.is_file() else None
        expected_base = artifact.get("base_hash")
        if expected_base is not None and expected_base != before_hash:
            errors.append(f"target base_hash conflict: {target}")
        if artifact.get("change_type") == "create" and before_hash not in {None, after_hash}:
            errors.append(f"create target already exists with different content: {target}")
        if artifact.get("change_type") == "replace" and expected_base is None:
            errors.append(f"replace requires base_hash: {target}")
        planned.append({
            "change_id": change_id,
            "change_type": artifact.get("change_type"),
            "source": source.as_posix(),
            "target": target.as_posix(),
            "before_hash": before_hash,
            "after_hash": after_hash,
            "kind": "knowledge",
        })
    route_template = str(policy.get("context_pack_route", {}).get("target", ""))
    context_root = _expand_publication_route(
        route_template, domain_id, publication_value, synthesis_id,
    )
    index_targets = [PurePosixPath(value) for value in policy.get("index_targets", [])]
    registry_target = (
        _expand_publication_route(
            policy.get("registry_route", {}).get("target", ""),
            domain_id, publication_value, synthesis_id,
        )
        if knowledge_mode else None
    )
    index_target_pass = (
        registry_target in index_targets
        if knowledge_mode
        else any(
            context_root == target or target in context_root.parents
            for target in index_targets
        )
    )
    if not index_target_pass:
        errors.append("context_pack_route is not registered under index_targets")
    for name in CONTEXT_FILES:
        source = PurePosixPath(f"context-pack/{name}")
        target = context_root / name
        if not _target_allowed(target, allowed_roots):
            errors.append(f"context-pack target is outside allowed_roots: {target}")
            continue
        source_path = bundle / Path(str(source))
        target_path = root / Path(str(target))
        planned.append({
            "change_id": f"context:{name}",
            "change_type": "metadata-only",
            "source": source.as_posix(),
            "target": target.as_posix(),
            "before_hash": sha256_file(target_path) if target_path.is_file() else None,
            "after_hash": sha256_file(source_path) if source_path.is_file() else None,
            "kind": "context-pack",
        })
    if knowledge_mode and publication_id:
        domain_manifest_target = _expand_publication_route(
            policy["domain_manifest_route"]["target"],
            domain_id, publication_id, synthesis_id,
        )
        domain_root = domain_manifest_target.parent
        previous_manifest = (
            load_structured(root / Path(str(domain_manifest_target)))
            if (root / Path(str(domain_manifest_target))).is_file()
            else {}
        )
        knowledge_entries = {
            str(artifact.get("knowledge_id")): PurePosixPath(
                item["target"],
            ).relative_to(domain_root).as_posix()
            for artifact, item in zip(manifest.get("artifacts", []), planned)
            if item.get("kind") == "knowledge"
        }
        context_entries = {
            {
                "context-manifest.json": "manifest",
                "retrieval-cards.jsonl": "retrieval_cards",
                "topology.jsonl": "topology",
                "impact-index.jsonl": "impact_index",
                "gaps.jsonl": "gaps",
            }[name]: (context_root / name).relative_to(domain_root).as_posix()
            for name in CONTEXT_FILES
        }
        context_manifest = load_structured(
            bundle / "context-pack" / "context-manifest.json",
        )
        domain_manifest = {
            "schema_version": "1",
            "domain_id": domain_id,
            "current_publication_id": publication_id,
            "publication_manifest":
                f"evidence/publications/{publication_id}/publication-manifest.json",
            "verification_status": manifest.get("verification_status"),
            "scope": manifest.get("scope", {}),
            "knowledge": knowledge_entries,
            "context": context_entries,
            "source_versions": context_manifest.get("source_versions", []),
            "freshness": manifest.get("freshness", {}),
            "supersedes": previous_manifest.get("current_publication_id"),
        }
        manifest_content = _json_content(domain_manifest)
        manifest_path = root / Path(str(domain_manifest_target))
        planned.append({
            "change_id": "metadata:domain-manifest",
            "change_type": "metadata-only",
            "target": domain_manifest_target.as_posix(),
            "before_hash": sha256_file(manifest_path) if manifest_path.is_file() else None,
            "after_hash": sha256_bytes(manifest_content.encode()),
            "kind": "domain-manifest",
            "generated_content": manifest_content,
        })
        registry_path = root / Path(str(registry_target))
        registry = (
            load_structured(registry_path)
            if registry_path.is_file()
            else {"schema_version": "1", "domains": []}
        )
        intents, terms = _routing_terms(bundle, domain_id)
        registry_entry = {
            "domain_id": domain_id,
            "scope": manifest.get("scope", {}),
            "manifest": domain_manifest_target.as_posix(),
            "manifest_hash": sha256_bytes(manifest_content.encode()),
            "intents": intents,
            "terms": terms,
            "verification_status": manifest.get("verification_status"),
            "updated_at": approval.get("approved_at"),
        }
        registry["domains"] = sorted(
            [
                item for item in registry.get("domains", [])
                if item.get("domain_id") != domain_id
            ] + [registry_entry],
            key=lambda item: item["domain_id"],
        )
        registry_content = _json_content(registry)
        planned.append({
            "change_id": "metadata:registry",
            "change_type": "metadata-only",
            "target": registry_target.as_posix(),
            "before_hash": sha256_file(registry_path) if registry_path.is_file() else None,
            "after_hash": sha256_bytes(registry_content.encode()),
            "kind": "knowledge-registry",
            "generated_content": registry_content,
        })
        gateway = policy.get("gateway_route", {})
        if gateway.get("enabled"):
            gateway_target = _expand_publication_route(
                gateway["target"], domain_id, publication_id, synthesis_id,
            )
            gateway_path = root / Path(str(gateway_target))
            links = "\n".join(
                f"- [{knowledge_id}]"
                f"(/{(domain_root / relative).as_posix()})"
                for knowledge_id, relative in sorted(knowledge_entries.items())
            )
            gateway_content = (
                f"# {domain_id} evidence-backed knowledge\n\n"
                f"Current publication: `{publication_id}`\n\n"
                f"- [Domain Manifest](/{domain_manifest_target.as_posix()})\n"
                f"{links}\n"
            )
            planned.append({
                "change_id": "metadata:gateway",
                "change_type": "metadata-only",
                "target": gateway_target.as_posix(),
                "before_hash": sha256_file(gateway_path) if gateway_path.is_file() else None,
                "after_hash": sha256_bytes(gateway_content.encode()),
                "kind": "wiki-gateway",
                "generated_content": gateway_content,
            })
    if errors:
        raise ValidationFailure("\n".join(errors))
    return {
        "schema_version": "1",
        "synthesis_id": synthesis_id,
        "publication_id": publication_id,
        "domain_id": domain_id or None,
        "knowledge_mode": knowledge_mode,
        "policy_id": policy.get("policy_id"),
        "approval_id": approval.get("approval_id"),
        "bundle_hash": fingerprint,
        "policy_hash": canonical_fingerprint(policy),
        "approval_hash": canonical_fingerprint(approval),
        "gates": {
            **gates,
            "approvals": {"status": "pass"},
            "target_routing": {"status": "pass"},
            "context_pack": {"status": "pass"},
            "index_targets": {"status": "pass" if index_target_pass else "fail"},
        },
        "publication_policy": policy,
        "approval_decision": approval,
        "artifacts": planned,
    }


def _atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(dir=path.parent, delete=False)
    temp_path = Path(handle.name)
    try:
        with handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    _atomic_write(
        path,
        (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode(),
    )


def stage_publication(
    root: Path,
    bundle: Path,
    plan: dict[str, Any],
    stage_id: str,
) -> dict[str, Any]:
    stage = root / "evidence" / "stages" / stage_id
    manifest_path = stage / "stage-manifest.json"
    if manifest_path.exists():
        raise ValidationFailure(f"stage already exists: {stage_id}")
    for gate, result in plan.get("gates", {}).items():
        if result.get("status") != "pass":
            raise ValidationFailure(f"publication gate did not pass: {gate}")
    for artifact in plan["artifacts"]:
        target = root / artifact["target"]
        current = sha256_file(target) if target.is_file() else None
        if current != artifact["before_hash"]:
            raise ValidationFailure(f"target changed after planning: {artifact['target']}")
        if "generated_content" in artifact:
            content = artifact["generated_content"].encode()
        else:
            source = bundle / artifact["source"]
            content = source.read_bytes()
        _atomic_write(stage / "tree" / artifact["target"], content)
    staged_tree_hash = tree_fingerprint(stage / "tree")
    manifest = {
        **plan,
        "stage_id": stage_id,
        "status": "awaiting-semantic-review",
        "staged_tree_hash": staged_tree_hash,
        "created_at": now_iso(),
    }
    _atomic_json(manifest_path, manifest)
    return manifest


def record_semantic_review(
    root: Path,
    stage_id: str,
    review: dict[str, Any],
) -> dict[str, Any]:
    stage = root / "evidence" / "stages" / stage_id
    manifest_path = stage / "stage-manifest.json"
    manifest = load_structured(manifest_path)
    errors: list[str] = []
    for field in (
        "schema_version", "stage_id", "staged_tree_hash", "verdict", "reviewer",
    ):
        if not review.get(field):
            errors.append(f"semantic review missing required field {field}")
    if review.get("stage_id") != stage_id:
        errors.append("semantic review stage_id does not match")
    actual_tree_hash = tree_fingerprint(stage / "tree")
    if review.get("staged_tree_hash") != actual_tree_hash:
        errors.append("semantic review staged_tree_hash does not match")
    if review.get("verdict") != "pass":
        errors.append("semantic review verdict must be pass")
    if errors:
        raise ValidationFailure("\n".join(errors))
    _atomic_json(stage / "semantic-review.json", review)
    manifest["status"] = "ready-to-apply"
    manifest["semantic_review_hash"] = canonical_fingerprint(review)
    manifest["reviewed_at"] = now_iso()
    _atomic_json(manifest_path, manifest)
    return manifest


def load_ready_stage(root: Path, stage_id: str) -> tuple[Path, dict[str, Any]]:
    stage = root / "evidence" / "stages" / stage_id
    manifest = load_structured(stage / "stage-manifest.json")
    if manifest.get("status") != "ready-to-apply":
        raise ValidationFailure(f"stage is not ready-to-apply: {stage_id}")
    review = load_structured(stage / "semantic-review.json")
    if canonical_fingerprint(review) != manifest.get("semantic_review_hash"):
        raise ValidationFailure("semantic review record hash mismatch")
    actual_tree_hash = tree_fingerprint(stage / "tree")
    if actual_tree_hash != manifest.get("staged_tree_hash"):
        raise ValidationFailure("staged tree hash mismatch")
    for artifact in manifest.get("artifacts", []):
        target = root / artifact["target"]
        current = sha256_file(target) if target.is_file() else None
        if current != artifact.get("before_hash"):
            raise ValidationFailure(f"target changed after staging: {artifact['target']}")
        staged = stage / "tree" / artifact["target"]
        if sha256_file(staged) != artifact.get("after_hash"):
            raise ValidationFailure(f"staged artifact hash mismatch: {artifact['target']}")
    return stage, manifest


def validate_published_targets(root: Path, artifacts: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    markdown_link = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    for artifact in artifacts:
        target = root / artifact["target"]
        current = sha256_file(target) if target.is_file() else None
        if current != artifact.get("after_hash"):
            errors.append(f"published target hash mismatch: {artifact['target']}")
            continue
        if target.suffix.lower() != ".md":
            continue
        text = target.read_text(encoding="utf-8")
        for raw_link in markdown_link.findall(text):
            link = raw_link.split("#", 1)[0].strip()
            if not link or "://" in link or link.startswith(("mailto:", "#", "/")):
                continue
            linked = (target.parent / link).resolve()
            try:
                linked.relative_to(root.resolve())
            except ValueError:
                errors.append(f"markdown link escapes publication root: {raw_link}")
                continue
            if not linked.exists():
                errors.append(f"broken markdown link in {artifact['target']}: {raw_link}")
    return errors


def apply_publication(
    root: Path,
    stage_id: str,
    publication_id: str,
) -> dict[str, Any]:
    stage, plan = load_ready_stage(root, stage_id)
    if plan.get("publication_id") not in {None, publication_id}:
        raise ValidationFailure(
            "publication_id does not match the staged publication identity"
        )
    record = root / "evidence" / "publications" / publication_id
    manifest_path = record / "publication-manifest.json"
    if manifest_path.exists():
        existing = load_structured(manifest_path)
        if existing.get("status") == "published" and existing.get("bundle_hash") == plan.get("bundle_hash"):
            stage_manifest_path = stage / "stage-manifest.json"
            stage_manifest = load_structured(stage_manifest_path)
            stage_manifest.update({
                "status": "applied",
                "publication_id": publication_id,
                "publication_status": "published",
                "publication_manifest": manifest_path.relative_to(root).as_posix(),
                "applied_at": existing.get("published_at") or now_iso(),
            })
            _atomic_json(stage_manifest_path, stage_manifest)
            return existing
        raise ValidationFailure(f"publication record already exists: {publication_id}")
    applied: list[dict[str, Any]] = []
    record.mkdir(parents=True, exist_ok=True)
    applying_manifest = {
        **plan,
        "publication_id": publication_id,
        "stage_id": stage_id,
        "status": "applying",
        "started_at": now_iso(),
    }
    _atomic_json(manifest_path, applying_manifest)
    try:
        for artifact in plan["artifacts"]:
            source = stage / "tree" / artifact["target"]
            target = root / artifact["target"]
            before = target.read_bytes() if target.is_file() else None
            if before is not None:
                _atomic_write(record / "before" / artifact["target"], before)
            _atomic_write(record / "after" / artifact["target"], source.read_bytes())
            _atomic_write(target, source.read_bytes())
            applied.append({
                key: value for key, value in {
                    **artifact,
                    "existed_before": before is not None,
                }.items()
                if key != "generated_content"
            })
        post_errors = validate_published_targets(root, applied)
        if post_errors:
            raise ValidationFailure("\n".join(post_errors))
        manifest = {
            **plan,
            "publication_id": publication_id,
            "stage_id": stage_id,
            "status": "published",
            "published_at": now_iso(),
            "artifacts": applied,
        }
        _atomic_json(manifest_path, manifest)
        if plan.get("knowledge_mode"):
            knowledge_errors = validate_knowledge_domain(
                root, str(plan.get("domain_id")),
            )
            if knowledge_errors:
                raise ValidationFailure("\n".join(knowledge_errors))
        _atomic_json(record / "publication-policy.json", plan["publication_policy"])
        _atomic_json(record / "approval-decision.json", plan["approval_decision"])
        _atomic_json(record / "rollback-manifest.json", {
            "schema_version": "1",
            "publication_id": publication_id,
            "artifacts": applied,
        })
        stage_manifest_path = stage / "stage-manifest.json"
        stage_manifest = load_structured(stage_manifest_path)
        stage_manifest.update({
            "status": "applied",
            "publication_id": publication_id,
            "publication_status": "published",
            "publication_manifest": manifest_path.relative_to(root).as_posix(),
            "applied_at": manifest["published_at"],
        })
        _atomic_json(stage_manifest_path, stage_manifest)
        return manifest
    except Exception as exc:
        for artifact in reversed(applied):
            target = root / artifact["target"]
            before_path = record / "before" / artifact["target"]
            if artifact["existed_before"]:
                _atomic_write(target, before_path.read_bytes())
            elif target.exists():
                target.unlink()
        failed = {
            **applying_manifest,
            "status": "validation-failed",
            "failed_at": now_iso(),
            "error": str(exc),
            "artifacts": applied,
        }
        _atomic_json(manifest_path, failed)
        stage_manifest_path = stage / "stage-manifest.json"
        stage_manifest = load_structured(stage_manifest_path)
        stage_manifest.update({
            "status": "apply-failed",
            "publication_id": publication_id,
            "publication_status": "validation-failed",
            "publication_manifest": manifest_path.relative_to(root).as_posix(),
            "failed_at": failed["failed_at"],
            "error": str(exc),
        })
        _atomic_json(stage_manifest_path, stage_manifest)
        raise


def rollback_publication(root: Path, publication_id: str) -> dict[str, Any]:
    record = root / "evidence" / "publications" / publication_id
    manifest_path = record / "publication-manifest.json"
    manifest = load_structured(manifest_path)
    if manifest.get("status") != "published":
        raise ValidationFailure(f"publication is not in published state: {publication_id}")
    for artifact in manifest.get("artifacts", []):
        target = root / artifact["target"]
        current = sha256_file(target) if target.is_file() else None
        if current != artifact.get("after_hash"):
            raise ValidationFailure(f"rollback conflict for target: {artifact['target']}")
    for artifact in reversed(manifest.get("artifacts", [])):
        target = root / artifact["target"]
        before_path = record / "before" / artifact["target"]
        if artifact.get("existed_before"):
            _atomic_write(target, before_path.read_bytes())
        elif target.exists():
            target.unlink()
    manifest["status"] = "rolled-back"
    manifest["rolled_back_at"] = now_iso()
    _atomic_json(manifest_path, manifest)
    stage_id = manifest.get("stage_id")
    if isinstance(stage_id, str):
        stage_manifest_path = root / "evidence" / "stages" / stage_id / "stage-manifest.json"
        if stage_manifest_path.is_file():
            stage_manifest = load_structured(stage_manifest_path)
            stage_manifest["publication_status"] = "rolled-back"
            stage_manifest["rolled_back_at"] = manifest["rolled_back_at"]
            _atomic_json(stage_manifest_path, stage_manifest)
    return manifest


def publication_status(root: Path, publication_id: str) -> dict[str, Any]:
    path = (
        root / "evidence" / "publications" / publication_id
        / "publication-manifest.json"
    )
    if not path.is_file():
        raise ValidationFailure(f"publication record does not exist: {publication_id}")
    return load_structured(path)


def validate_publication(root: Path, publication_id: str) -> list[str]:
    manifest = publication_status(root, publication_id)
    errors: list[str] = []
    for field in (
        "schema_version", "publication_id", "synthesis_id", "policy_id",
        "approval_id", "bundle_hash", "status", "artifacts",
    ):
        if field not in manifest:
            errors.append(f"publication manifest missing required field {field}")
    if manifest.get("publication_id") != publication_id:
        errors.append("publication_id does not match record path")
    if manifest.get("status") == "published":
        errors.extend(validate_published_targets(root, manifest.get("artifacts", [])))
    return errors


def audit_lifecycle_state(root: Path) -> dict[str, Any]:
    """Check cross-artifact state bindings for approval-gated publications."""
    errors: list[str] = []
    warnings: list[str] = []
    stage_paths = sorted((root / "evidence" / "stages").glob("*/stage-manifest.json"))
    publication_paths = sorted(
        (root / "evidence" / "publications").glob("*/publication-manifest.json")
    )
    stages: dict[str, dict[str, Any]] = {}
    publications: dict[str, dict[str, Any]] = {}
    stage_statuses = {
        "awaiting-semantic-review", "ready-to-apply", "applied", "apply-failed",
    }
    publication_statuses = {
        "published", "rolled-back", "validation-failed", "superseded",
    }

    for path in stage_paths:
        try:
            stage = load_structured(path)
        except ValidationFailure as exc:
            errors.append(str(exc))
            continue
        stage_id = stage.get("stage_id")
        if not isinstance(stage_id, str) or not stage_id:
            errors.append(f"{path}: stage_id is required")
            continue
        if stage_id in stages:
            errors.append(f"{path}: duplicate stage_id {stage_id}")
        stages[stage_id] = stage
        status = stage.get("status")
        if status not in stage_statuses:
            errors.append(f"{path}: unknown stage status {status!r}")
        review_path = path.parent / "semantic-review.json"
        if status == "awaiting-semantic-review" and review_path.exists():
            errors.append(f"{path}: awaiting stage must not have a semantic review")
        if status in {"ready-to-apply", "applied", "apply-failed"} and not review_path.is_file():
            errors.append(f"{path}: {status} stage requires a semantic review")
        approval = stage.get("approval_decision")
        if isinstance(approval, dict):
            if approval.get("status") != "approved":
                errors.append(f"{path}: staged approval decision is not approved")
            if approval.get("synthesis_id") != stage.get("synthesis_id"):
                errors.append(f"{path}: approval synthesis_id does not match stage")
            if approval.get("bundle_hash") != stage.get("bundle_hash"):
                errors.append(f"{path}: approval bundle_hash does not match stage")
            expected_hash = stage.get("approval_hash")
            if expected_hash and canonical_fingerprint(approval) != expected_hash:
                errors.append(f"{path}: approval_hash does not match staged decision")
        elif status in {"ready-to-apply", "applied", "apply-failed"}:
            errors.append(f"{path}: {status} stage requires approval_decision")

    for path in publication_paths:
        try:
            publication = load_structured(path)
        except ValidationFailure as exc:
            errors.append(str(exc))
            continue
        publication_id = publication.get("publication_id")
        if not isinstance(publication_id, str) or not publication_id:
            errors.append(f"{path}: publication_id is required")
            continue
        if publication_id in publications:
            errors.append(f"{path}: duplicate publication_id {publication_id}")
        publications[publication_id] = publication
        status = publication.get("status")
        if status not in publication_statuses:
            errors.append(f"{path}: unknown publication status {status!r}")
        stage_id = publication.get("stage_id")
        stage = stages.get(str(stage_id)) if stage_id else None
        if status in {"published", "rolled-back"}:
            if stage is None:
                errors.append(f"{path}: {status} publication requires an existing stage")
                continue
            if stage.get("status") != "applied":
                errors.append(
                    f"{path}: published publication requires stage status applied"
                )
            for field in (
                "synthesis_id", "bundle_hash", "policy_id", "approval_id",
            ):
                if publication.get(field) != stage.get(field):
                    errors.append(f"{path}: {field} does not match stage {stage_id}")
            if stage.get("publication_id") != publication_id:
                errors.append(f"{path}: publication_id does not match stage {stage_id}")
        elif status == "validation-failed":
            if stage is None or stage.get("status") != "apply-failed":
                errors.append(
                    f"{path}: validation-failed publication requires apply-failed stage"
                )
            else:
                for field in (
                    "synthesis_id", "bundle_hash", "policy_id", "approval_id",
                ):
                    if publication.get(field) != stage.get(field):
                        errors.append(f"{path}: {field} does not match stage {stage_id}")
                if stage.get("publication_id") != publication_id:
                    errors.append(f"{path}: publication_id does not match stage {stage_id}")

    for stage_id, stage in stages.items():
        publication_id = stage.get("publication_id")
        publication = publications.get(str(publication_id)) if publication_id else None
        if stage.get("status") == "applied" and publication is None:
            errors.append(
                f"stage {stage_id}: applied stage has no publication record"
            )
        if stage.get("status") == "ready-to-apply" and publication is not None:
            if publication.get("status") == "published":
                errors.append(
                    f"publication {publication_id}: published publication requires stage status applied"
                )

    registry_path = root / "knowledge" / "registry.json"
    if registry_path.is_file():
        _, registry_errors = validate_knowledge_registry(root)
        errors.extend(registry_errors)
    pointed_publications: set[str] = set()
    domains_root = root / "knowledge" / "domains"
    if domains_root.exists():
        for manifest_path in sorted(domains_root.glob("*/manifest.json")):
            try:
                domain = load_structured(manifest_path)
            except ValidationFailure as exc:
                errors.append(str(exc))
                continue
            publication_id = domain.get("current_publication_id")
            if isinstance(publication_id, str):
                pointed_publications.add(publication_id)
                publication = publications.get(publication_id)
                if publication is not None and publication.get("status") != "published":
                    errors.append(
                        f"{manifest_path}: current publication must be published"
                    )
    for publication_id, publication in publications.items():
        if publication.get("knowledge_mode") and publication.get("status") == "published":
            if publication_id not in pointed_publications:
                warnings.append(
                    f"publication {publication_id}: published knowledge is not current in a Domain Manifest"
                )

    return {
        "gate_passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "counts": {
            "stages": len(stages),
            "publications": len(publications),
            "domain_manifests": len(list(domains_root.glob("*/manifest.json")))
            if domains_root.exists() else 0,
            "registry_present": registry_path.is_file(),
        },
    }


def _root_path(root: Path, value: Any, field: str) -> tuple[Path | None, str | None]:
    relative, error = _safe_relative(value, field)
    if error:
        return None, error
    return root / Path(str(relative)), None


def validate_domain_manifest(
    root: Path,
    manifest_path: Path,
    expected_domain_id: str | None = None,
) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    try:
        manifest = load_structured(manifest_path)
    except (OSError, ValidationFailure) as exc:
        return {}, [str(exc)]
    for field in (
        "schema_version", "domain_id", "current_publication_id",
        "publication_manifest", "verification_status", "scope", "knowledge",
        "context", "source_versions", "freshness", "supersedes",
    ):
        if field not in manifest:
            errors.append(f"{manifest_path}: missing required field {field}")
    if manifest.get("schema_version") != "1":
        errors.append(f'{manifest_path}: schema_version must be "1"')
    if expected_domain_id and manifest.get("domain_id") != expected_domain_id:
        errors.append(f"{manifest_path}: domain_id does not match registry")
    publication_path, path_error = _root_path(
        root, manifest.get("publication_manifest"), "publication_manifest",
    )
    if path_error:
        errors.append(f"{manifest_path}: {path_error}")
    elif not publication_path.is_file():
        errors.append(f"{manifest_path}: publication manifest does not exist")
    else:
        publication = load_structured(publication_path)
        if publication.get("status") != "published":
            errors.append(
                f"{manifest_path}: current publication is not published"
            )
        if publication.get("publication_id") != manifest.get("current_publication_id"):
            errors.append(
                f"{manifest_path}: publication_id does not match current pointer"
            )
    domain_root = manifest_path.parent
    for group in ("knowledge", "context"):
        values = manifest.get(group)
        if not isinstance(values, dict) or not values:
            errors.append(f"{manifest_path}: {group} must be a non-empty object")
            continue
        for key, raw_value in values.items():
            relative, relative_error = _safe_relative(
                raw_value, f"{group}.{key}",
            )
            if relative_error:
                errors.append(f"{manifest_path}: {relative_error}")
            elif not (domain_root / Path(str(relative))).is_file():
                errors.append(
                    f"{manifest_path}: {group}.{key} target does not exist"
                )
    return manifest, errors


def validate_knowledge_registry(
    root: Path,
) -> tuple[dict[str, Any], list[str]]:
    registry_path = root / "knowledge" / "registry.json"
    if not registry_path.is_file():
        return {}, [f"{registry_path}: knowledge registry is missing"]
    try:
        registry = load_structured(registry_path)
    except ValidationFailure as exc:
        return {}, [str(exc)]
    errors: list[str] = []
    if registry.get("schema_version") != "1":
        errors.append(f'{registry_path}: schema_version must be "1"')
    domains = registry.get("domains")
    if not isinstance(domains, list):
        return registry, [*errors, f"{registry_path}: domains must be a list"]
    seen: set[str] = set()
    for index, domain in enumerate(domains):
        if not isinstance(domain, dict):
            errors.append(f"{registry_path}: domains[{index}] must be an object")
            continue
        for field in (
            "domain_id", "scope", "manifest", "manifest_hash", "intents",
            "terms", "verification_status", "updated_at",
        ):
            if field not in domain:
                errors.append(f"{registry_path}: domains[{index}] missing {field}")
        domain_id = str(domain.get("domain_id", ""))
        if domain_id in seen:
            errors.append(f"{registry_path}: duplicate domain_id {domain_id}")
        seen.add(domain_id)
        manifest_path, path_error = _root_path(
            root, domain.get("manifest"), f"domains[{index}].manifest",
        )
        if path_error:
            errors.append(f"{registry_path}: {path_error}")
            continue
        if not manifest_path.is_file():
            errors.append(
                f"{registry_path}: manifest does not exist for {domain_id}"
            )
            continue
        actual_hash = sha256_file(manifest_path)
        if domain.get("manifest_hash") != actual_hash:
            errors.append(
                f"{registry_path}: manifest_hash mismatch for {domain_id}"
            )
        _, manifest_errors = validate_domain_manifest(
            root, manifest_path, domain_id,
        )
        errors.extend(manifest_errors)
    return registry, errors


def _registry_domain(
    root: Path,
    domain_id: str,
) -> tuple[dict[str, Any], Path, dict[str, Any]]:
    registry, errors = validate_knowledge_registry(root)
    if errors:
        raise ValidationFailure("\n".join(errors))
    entry = next(
        (
            item for item in registry.get("domains", [])
            if item.get("domain_id") == domain_id
        ),
        None,
    )
    if not entry:
        raise ValidationFailure(f"knowledge domain is not registered: {domain_id}")
    manifest_path = root / Path(str(entry["manifest"]))
    return entry, manifest_path, load_structured(manifest_path)


def locate_knowledge(root: Path, intent: str) -> list[dict[str, Any]]:
    registry, errors = validate_knowledge_registry(root)
    if errors:
        raise ValidationFailure("\n".join(errors))
    query = intent.casefold()
    tokens = {token for token in re.split(r"\W+", query) if token}
    matches: list[dict[str, Any]] = []
    for entry in registry.get("domains", []):
        candidates = [
            *entry.get("intents", []),
            *entry.get("terms", []),
            entry.get("domain_id", ""),
        ]
        score = 0
        matched: list[str] = []
        for candidate in candidates:
            value = str(candidate).casefold()
            candidate_tokens = {token for token in re.split(r"\W+", value) if token}
            if value and value in query:
                score += 4
                matched.append(str(candidate))
            overlap = tokens & candidate_tokens
            score += len(overlap)
            if overlap and str(candidate) not in matched:
                matched.append(str(candidate))
        if score:
            manifest_path = root / Path(str(entry["manifest"]))
            manifest = load_structured(manifest_path)
            retrieval_path = manifest_path.parent / Path(
                str(manifest.get("context", {}).get("retrieval_cards", ""))
            )
            knowledge_scores: dict[str, dict[str, Any]] = {}
            if retrieval_path.is_file():
                for _, card in iter_jsonl(retrieval_path):
                    card_score = 0
                    card_matched: list[str] = []
                    for candidate in [
                        *card.get("intents", []),
                        *card.get("terms", []),
                        *card.get("task_types", []),
                    ]:
                        value = str(candidate).casefold()
                        candidate_tokens = {
                            token for token in re.split(r"\W+", value) if token
                        }
                        if value and value in query:
                            card_score += 4
                            card_matched.append(str(candidate))
                        overlap = tokens & candidate_tokens
                        card_score += len(overlap)
                        if overlap and str(candidate) not in card_matched:
                            card_matched.append(str(candidate))
                    if not card_score:
                        continue
                    for knowledge_id in card.get("knowledge_ids", []):
                        current = knowledge_scores.setdefault(str(knowledge_id), {
                            "knowledge_id": str(knowledge_id),
                            "score": 0,
                            "matched": [],
                        })
                        current["score"] += card_score
                        current["matched"] = sorted(set(
                            current["matched"] + card_matched
                        ))
            knowledge_matches = sorted(
                knowledge_scores.values(),
                key=lambda item: (-item["score"], item["knowledge_id"]),
            )[:3]
            matches.append({
                "domain_id": entry.get("domain_id"),
                "score": score,
                "matched": matched,
                "manifest": entry.get("manifest"),
                "verification_status": entry.get("verification_status"),
                "knowledge_matches": knowledge_matches,
            })
    return sorted(matches, key=lambda item: (-item["score"], item["domain_id"]))


def _find_structured_record(
    folder: Path,
    identifier: str,
    revision: int | None = None,
) -> dict[str, Any] | None:
    if not folder.exists():
        return None
    for path in sorted(folder.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {
            ".json", ".jsonl", ".yaml", ".yml",
        }:
            continue
        try:
            values = (
                [value for _, value in iter_jsonl(path)]
                if path.suffix.lower() == ".jsonl"
                else [load_structured(path)]
            )
        except (OSError, ValidationFailure):
            continue
        for line_index, value in enumerate(values, start=1):
            record_id = (
                value.get("id") or value.get("claim_id")
                or value.get("evidence_id") or value.get("finding_id")
            )
            if record_id != identifier:
                continue
            if revision is not None and int(value.get("revision", 0)) != revision:
                continue
            result = {"path": str(path), "record": value}
            if path.suffix.lower() == ".jsonl":
                result["line"] = line_index
            return result
    return None


def resolve_coordinate(root: Path, coordinate: str) -> dict[str, Any]:
    match = COORDINATE_PATTERN.fullmatch(coordinate)
    if not match:
        raise ValidationFailure(f"invalid knowledge coordinate: {coordinate}")
    scheme = match.group("scheme")
    body = match.group("body")
    if scheme == "knowledge":
        if "/" not in body or "@" not in body:
            raise ValidationFailure(f"invalid knowledge coordinate: {coordinate}")
        domain_id, knowledge_ref = body.split("/", 1)
        knowledge_id, publication_id = knowledge_ref.rsplit("@", 1)
        _, manifest_path, manifest = _registry_domain(root, domain_id)
        if publication_id != manifest.get("current_publication_id"):
            raise ValidationFailure(
                f"knowledge coordinate is not the current publication: {coordinate}"
            )
        candidates = manifest.get("knowledge", {})
        selected = candidates.get(knowledge_id)
        if not selected:
            matching = [
                value for key, value in candidates.items()
                if knowledge_id == key or knowledge_id.endswith(f"-{key}")
                or Path(str(value)).stem == knowledge_id
            ]
            selected = matching[0] if len(matching) == 1 else None
        if not selected:
            raise ValidationFailure(f"unknown knowledge_id: {knowledge_id}")
        path = manifest_path.parent / Path(str(selected))
        return {
            "coordinate": coordinate,
            "scheme": scheme,
            "domain_id": domain_id,
            "knowledge_id": knowledge_id,
            "publication_id": publication_id,
            "path": str(path),
        }
    if scheme == "claim":
        if "@" not in body:
            raise ValidationFailure(f"claim coordinate requires revision: {coordinate}")
        identifier, raw_revision = body.rsplit("@", 1)
        try:
            revision = int(raw_revision)
        except ValueError as exc:
            raise ValidationFailure(
                f"claim coordinate revision is invalid: {coordinate}"
            ) from exc
        result = _find_structured_record(
            root / "evidence" / "claims", identifier, revision,
        )
    elif scheme == "evidence":
        result = _find_structured_record(
            root / "evidence" / "records", body,
        )
    elif scheme == "finding":
        result = _find_structured_record(
            root / "evidence" / "findings", body,
        )
    else:
        code_match = re.fullmatch(
            r"(?P<repository>[^@]+)@(?P<commit>[^/]+)/"
            r"(?P<path>[^#]+)(?:#(?P<symbol>.+))?",
            body,
        )
        if not code_match:
            raise ValidationFailure(f"invalid code coordinate: {coordinate}")
        return {
            "coordinate": coordinate,
            "scheme": scheme,
            **code_match.groupdict(),
        }
    if result is None:
        raise ValidationFailure(f"coordinate cannot be resolved: {coordinate}")
    return {"coordinate": coordinate, "scheme": scheme, **result}


def inspect_knowledge_domain(root: Path, domain_id: str) -> dict[str, Any]:
    entry, manifest_path, manifest = _registry_domain(root, domain_id)
    publication = load_structured(root / Path(str(manifest["publication_manifest"])))
    return {
        "registry_entry": entry,
        "manifest_path": str(manifest_path),
        "manifest": manifest,
        "publication": publication,
    }


def validate_knowledge_domain(root: Path, domain_id: str) -> list[str]:
    try:
        _, manifest_path, manifest = _registry_domain(root, domain_id)
    except ValidationFailure as exc:
        return [str(exc)]
    errors: list[str] = []
    context_manifest = manifest_path.parent / Path(
        str(manifest.get("context", {}).get("manifest", "")),
    )
    if context_manifest.is_file():
        errors.extend(validate_context_pack(
            context_manifest.parent.parent,
            context_manifest.parent.name,
        ))
    coordinate_values: set[str] = set()
    claim_refs: set[str] = set()
    for relative in manifest.get("context", {}).values():
        path = manifest_path.parent / Path(str(relative))
        if path.suffix.lower() != ".jsonl" or not path.is_file():
            continue
        for _, row in iter_jsonl(path):
            for value in row.get("coordinates", []):
                coordinate_values.add(str(value))
            for value in row.get("claim_refs", []):
                claim_refs.add(str(value))
    coordinate_values.update(f"claim://{value}" for value in claim_refs)
    for coordinate in sorted(coordinate_values):
        try:
            resolve_coordinate(root, coordinate)
        except ValidationFailure as exc:
            errors.append(str(exc))
    return errors
