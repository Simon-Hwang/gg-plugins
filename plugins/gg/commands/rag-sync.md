---
description: Incrementally sync the .rag/ knowledge base after code changes. Uses git diff against last_synced_commit to identify what changed, then surgically updates only the affected RAG documents. Delegates to doc-updater agent. Requires /gg:build-rag to have been run first.
---

# RAG Incremental Sync

Delegate to the `doc-updater` agent to perform a surgical, git-diff-driven update of the `.rag/` knowledge base. Only documents affected by recent code changes are updated — no full rebuild needed.

## When to Use

- After completing a feature, bugfix, or refactor that modifies code structure.
- Before a PR review, to ensure the knowledge base reflects the latest state.
- As part of the release workflow: `code-reviewer → security-reviewer → pr-test-analyzer → rag-sync`.

## Prerequisites

`.rag/_manifest.json` must exist. If not, run `/gg:build-rag` first.

## What Happens

```
1. Read .rag/_manifest.json → get last_synced_commit
2. git diff <last_synced_commit>..HEAD --name-only → changed file list
3. Map each changed file to affected RAG layers (see table below)
4. For each affected RAG document:
   a. Read current document content
   b. Read changed source code
   c. Apply minimal, targeted updates
5. Update _manifest.json (timestamps, last_synced_commit = HEAD)
6. If structural change (new/deleted module): patch _graph.json
7. Print sync report
```

## File → RAG Layer Mapping

| Changed File Pattern | Affected RAG Layers |
|---------------------|---------------------|
| `**/handler/**, **/router/**, **/api/**, **/routes/**` | L3-chains, api-contracts |
| `**/service/**, **/usecase/**, **/domain/**` | L2-modules, L3-chains |
| `**/interface*, **/abstract*, **/base*, **/schema/**` | L1-systems, L2-modules |
| `**/repository/**, **/repo/**, **/store/**` | L2-modules |
| `.env.example, **/config/**, **/settings.**` | L0-overview |
| `go.mod, pyproject.toml, requirements*.txt` | L0-overview |
| `Makefile, Taskfile.yml, Earthfile, Dockerfile` | L0-overview |
| `**/*.proto, **/proto/**` | api-contracts |
| New module directory (first `.go` / `.py` file) | Create new L2-modules doc |
| Deleted module directory | Remove from _manifest.json + _graph.json |
| `**/*_test.go, **/*_test.py, **/test_*.py` | (skip) |

## Sync Report

```
RAG Sync Report
─────────────────────────────────────────
Commit range:  <last_synced_commit>..<HEAD>
Changed files: N

Layer Updates:
  ✅ .rag/L2-modules/backend-order.md      — updated handler interface
  ✅ .rag/api-contracts/backend.openapi.json — added new endpoint
  ✅ .rag/L3-chains/order-flow.md          — updated timeout parameter
  ⏭️  .rag/L1-systems/backend.md           — no structural change, skipped

Graph: ✅ _graph.json — N nodes / N edges
Manifest: ✅ last_synced_commit updated to <HEAD>

Warnings:
  ⚠️  <path> — possible new subsystem; consider /gg:build-rag if > 40% docs affected
─────────────────────────────────────────
```

## Notes

- **Preserve manual sections**: Only update code-derived sections; hand-written design notes are left intact.
- **ADR updates**: If the change implies a new architectural decision, the sync flags it for manual ADR creation rather than auto-generating an unconfirmed entry.
- **Rebuild threshold**: If > 40% of manifest documents need updating, the report recommends a full `/gg:build-rag` rebuild instead.
