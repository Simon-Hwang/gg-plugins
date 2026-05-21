---
description: Incrementally sync existing .rag/ documents after business code changes. Uses git diff against last_synced_commit and _manifest.json documents[].source_paths to update only affected RAG content. Delegates to doc-updater in RAG Sync Mode. Requires /gg:build-rag to have been run first.
---

# RAG Incremental Sync

Delegate to the `doc-updater` agent in **RAG Sync Mode** to update existing `.rag/` documents after business code changes. This command maintains RAG content and metadata; it is not a general documentation update command and does not update README, runbooks, or ordinary codemaps.

## When to Use

- After completing a feature, bugfix, or refactor that changes business code already covered by `.rag/`.
- Before a PR review, to ensure the RAG knowledge base reflects the latest code state.
- As part of the release workflow: `code-reviewer → security-reviewer → pr-test-analyzer → rag-sync`.

Do **not** use this for first-time RAG creation, major boundary changes, or large restructuring. Use `/gg:build-rag`, `/gg:build-rag --system <name>`, or `/gg:build-rag --large` instead.

## Prerequisites

- `.rag/_manifest.json` must exist. If not, run `/gg:build-rag` first.
- `_manifest.json` must use the current `documents[]` registry shape with non-empty `source_paths`.
- `_graph.json` must be consistent with manifest `graph_stats` before sync starts.

## What Happens

```
1. Read .rag/_manifest.json → get last_synced_commit
2. Validate last_synced_commit still exists in local git history
3. git diff --name-status <last_synced_commit>..HEAD → changed file list with A/M/D/R status
4. Read _manifest.json documents[] and match changed files against document.source_paths
5. Fall back to heuristic layer mapping only when source_paths are missing or legacy
6. Stop and recommend rebuild/validate when sync would be unsafe
7. For each affected RAG document:
   a. Read current document content and frontmatter
   b. Read changed source code
   c. Apply minimal, targeted updates to code-derived sections only
   d. Update frontmatter fields such as updated, source_paths, symbols, summary, intent when needed
8. Patch _graph.json only for structural changes that remain within existing boundaries
9. Update _manifest.json metadata and graph_stats
10. Update last_synced_commit = HEAD
11. Print sync report
```

## Matching Strategy

Primary method: use `_manifest.json documents[].source_paths`.

```
For each changed file:
  1. Compare it with every document.source_paths entry
  2. If the changed path is inside a source path, queue that document
  3. If no document matches, classify the change as structural or fallback-only
```

Fallback method: use heuristic layer mapping only for legacy manifests without usable `source_paths`.

| Changed File Pattern | Fallback RAG Scope |
|---------------------|--------------------|
| `**/handler/**`, `**/router/**`, `**/api/**`, `**/routes/**` | L3 chains, API contracts |
| `**/service/**`, `**/usecase/**`, `**/domain/**` | L2 modules, L3 chains |
| `**/interface*`, `**/abstract*`, `**/base*`, `**/schema/**` | L1 systems, L2 modules |
| `**/repository/**`, `**/repo/**`, `**/store/**` | L2 modules |
| `.env.example`, `**/config/**`, `**/settings.*` | L0 overview or affected L1/L2 docs |
| `go.mod`, `pyproject.toml`, `requirements*.txt`, `package.json` | L0 overview and affected subsystem docs |
| `Makefile`, `Taskfile.yml`, `Earthfile`, `Dockerfile` | L0 overview |
| `**/*.proto`, `**/proto/**` | API contracts, L3 chains |
| `**/*_test.go`, `**/*_test.py`, `**/test_*.py` | Skip unless tests are explicitly documented in RAG |

## Safety Gates

Stop instead of hard-editing when any of these are true:

- More than 40% of manifest documents would be affected.
- `_manifest.json` is missing required current-schema fields or `documents[]`.
- `_graph.json` and manifest `graph_stats` are already inconsistent.
- A new standalone subsystem is detected.
- A rename/move crosses subsystem boundaries.
- Large file moves suggest subsystem boundaries changed.

Recommended next command:

| Situation | Next Step |
|-----------|-----------|
| Manifest or graph is invalid | `/gg:build-rag --validate` |
| One subsystem needs regeneration | `/gg:build-rag --system <name>` |
| Architecture or boundary changed broadly | `/gg:build-rag --large` |
| First-time RAG setup | `/gg:build-rag` |

## Metadata Rules

RAG sync may update:

- Markdown frontmatter: `updated`, `source_paths`, `symbols`, `summary`, `intent`
- `_manifest.json`: `last_synced_commit`, affected `source_paths`, affected `symbols`, affected `review_status`, `graph_stats`
- `_graph.json`: nodes and edges for in-boundary structural changes

RAG sync must **not** update:

- `last_verified_commit` unless `/gg:build-rag --validate` or an equivalent validation flow passed
- `review_status: reviewed` for changed documents

After ordinary sync, affected documents should be marked `needs-update` or `unreviewed` until validation passes.

## Update Scope

For each affected RAG document:

```
1. Read current document content
2. Read changed source code mapped through source_paths
3. Update only code-derived content:
   - route signatures, request/response fields, proto/API contracts
   - module interfaces, exported types, dependencies
   - business flow steps and L3 sequence details
   - hardcoded parameters such as timeouts, retry counts, queue sizes
   - source_paths and symbols when files or anchors changed
4. Preserve non-derived content:
   - preserve hand-written design notes and rationale
   - do not invent behavior not present in code
   - do not auto-generate inferred ADRs; flag them for human review
```

## Sync Report

```
RAG Sync Report
─────────────────────────────────────────
Commit range:  <last_synced_commit>..<HEAD>
Changed files: N

Document Updates:
  ✅ .rag/L2-modules/backend-order.md      — updated handler interface
  ✅ .rag/api-contracts/backend.openapi.json — added new endpoint
  ✅ .rag/L3-chains/order-flow.md          — updated timeout parameter
  ⏭️  .rag/L1-systems/backend.md           — no structural change, skipped

Graph: ✅ _graph.json — N nodes / N edges
Manifest: ✅ last_synced_commit updated to <HEAD>
Review: affected docs marked needs-update

Warnings:
  ⚠️  <path> — possible new subsystem; run /gg:build-rag --system <name>
─────────────────────────────────────────
```

## Notes

- **Preserve manual sections**: Only update code-derived sections; hand-written design notes are left intact.
- **ADR updates**: If the change implies a new architectural decision, the sync flags it for manual ADR creation rather than auto-generating an unconfirmed entry.
- **Review status**: Changed documents are no longer considered verified until `/gg:build-rag --validate` passes.
- **Rebuild threshold**: If > 40% of manifest documents need updating, the report recommends a full `/gg:build-rag` rebuild instead.
