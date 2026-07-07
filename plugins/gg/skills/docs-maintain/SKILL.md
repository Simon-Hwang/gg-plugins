---
name: docs-maintain
description: Incrementally and periodically revalidate evidence-backed documentation using git changes and optional deployment, runtime configuration, experiment, trace, metric, incident, and ownership adapters. Use for documentation drift monitoring, release/config/experiment-triggered revalidation, full evidence freshness checks, finding revalidation, or questions about current online state that require explicit capability preflight and safe degradation.
---

# Docs Maintain

Maintain existing Claim/Evidence foundations. Never bootstrap missing foundations implicitly.

Read [references/workflow.md](references/workflow.md) before running. Use the shared CLI and schemas directly.

## Mandatory preflight

Run `scripts/gg-evidence --root <wiki-root> --profile <profile> adapters preflight`.
Run `scripts/gg-evidence --root <wiki-root> observation-requests validate` when
runtime Observation Requests exist.

Stop and recommend `docs-observe` if Claim store, Evidence store, repository access, or index is unavailable. Record every optional adapter as available, unavailable, or degraded.

For a published domain, validate `knowledge/registry.json` and begin at its
Domain Manifest. If Registry validation fails, emit or update a
`knowledge-registry-unavailable` Finding and explicitly degrade to Wiki plus the
Evidence index.

## Run modes

- `--claim <id>`: revalidate one Claim.
- `--document <path>`: revalidate Claims referenced by a document.
- `--knowledge <coordinate>`: revalidate Claims referenced by one published Knowledge artifact.
- `--domain <domain-id>`: start from the current Domain Manifest and revalidate its registered Claims.
- `--scope <domain>`: revalidate a scoped set.
- `--changed-since <commit>`: follow changed subjects through mappings.
- `--full`: recheck freshness, all high-risk Claims, integrity, Findings, and adapter health.

## Rules

1. Map changes from files/config/experiments/deployments to subjects, Evidence,
   Claims, Knowledge Coordinates, Publications/domains, documents, and Findings.
2. Reuse Evidence only while its source version and freshness policy remain valid.
   Runtime Evidence must satisfy the stricter of provider freshness and the
   Observation Request's `freshness.max_age`.
3. Append Evidence and Verdict history; never update history in place.
4. Revalidate fixed Findings before closing them.
5. Escalate overdue Findings by appending events to the original Finding.
6. Return time-sensitive Claims as `partial`, `unknown`, or `requires-runtime-evidence` when adapters are absent.
7. Never describe scheduled maintenance as enabled unless a scheduler is configured and observed.
8. Never edit an immutable Knowledge Publication in place. A changed Claim,
   freshness baseline, or Finding produces an Observation Request for a new
   Synthesis Bundle and Publication.
9. Update a Domain Manifest or Registry only through `docs-publish`; Maintain
   records affected coordinates and revalidation results in the Evidence layer.

## Runtime provider boundary

Resolve runtime Observation Requests through
`adapters.runtime_observation.providers[]` by `provider_hints` and
`capability`. Execute only enabled, healthy project-defined provider commands.
Treat request `query` and provider `runtime` payloads as business-owned
structures; GG core records provenance, scope, observation time, source version,
content hash, confidence, freshness, and raw payload references without
interpreting provider-specific semantics.
