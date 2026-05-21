---
description: Build a full RAG knowledge base for the current repository. Scans all source code and generates .rag/ with layered docs (L0→L3), API contracts, ADR index, and GraphRAG knowledge graph. For small repos, runs fully automatically. For large/monorepo repos, use --large to enable multi-stage, checkpoint-resumable, cost-budgeted builds.
---

# Build RAG Knowledge Base

Trigger the `repo-rag-builder` skill to construct the `.rag/` knowledge base for this repository.

## When to Use

- **First-time initialization**: No `.rag/` directory exists yet.
- **Major restructuring**: Significant architectural changes have made the existing knowledge base stale (> 40% of modules changed).
- **Periodic deep refresh**: Quarterly rebuild to pick up accumulated drift.

For routine code changes after initialization, use `/gg:rag-sync` (incremental, much faster).

## Command Parameters

| Parameter | Description |
|-----------|-------------|
| *(none)* | Default: auto-detect. Small repos run fully automatically. Large repos prompt to add `--large`. |
| `--large` | Enable multi-stage large-repo flow: Preflight Discovery → Acceptance Gate → Subsystem Batch Build → Validation → Merge. Prompts for boundary and cost confirmation before generating any docs. |
| `--plan-only` | Run Discovery only and output `.rag/_plan.json` + `.rag/_discovery.md` with subsystem boundaries, Token budget projection, and cost estimates. **Does not write any documentation.** Use for cost audit before committing to a full build. |
| `--system <name>` | Build or rebuild only the specified logical subsystem (e.g. `--system order-service`). Skips all other subsystems. Requires a prior `--plan-only` or `--large` run to have identified boundaries. |
| `--validate` | Validate existing `.rag/` without rebuilding. **Must** run Stage 4 (`flows/large-stage4-validation.md`) in full: **4a** manifest schema (`documents[]`, required fields), **4b** YAML frontmatter on every doc, **4c** `source_paths`, **4d** API traceability, **4e** graph (`source`/`target`, no `from`/`to`), **4g** Santa content audit with mandatory report. Conclude PASS / PARTIAL / FAIL — never「全通过」without Santa report or if frontmatter/manifest missing. |
| `--resume` | Resume a previously interrupted `--large` build from the last completed checkpoint. Reads `.rag/_state.json` and skips subsystems already marked `completed`. |

## Usage Examples

```bash
# Small repo — fully automatic
/gg:build-rag

# Large/monorepo — confirm boundaries and cost before building
/gg:build-rag --large

# Audit cost and boundaries only, no doc generation
/gg:build-rag --plan-only

# Build a single subsystem
/gg:build-rag --system order-service

# Validate existing .rag/ (integrity check, no rebuild)
/gg:build-rag --validate

# Resume interrupted large-repo build
/gg:build-rag --resume
```

## What Gets Built

```
.rag/
├── _index.md              # Navigation index
├── _manifest.json         # Metadata + last_synced_commit anchor
├── _graph.json            # GraphRAG knowledge graph
├── _plan.json             # (--large / --plan-only) Subsystem plan + Token budget
├── _discovery.md          # (--large / --plan-only) Human-readable discovery report
├── _state.json            # (--large) Checkpoint state for resume
├── L0-overview.md         # Repository panorama
├── L1-systems/            # Subsystem-level docs (style-analyzer route)
├── L2-modules/            # Module-level docs
├── L3-chains/             # Core business flow docs (code-analyzer route)
├── api-contracts/         # OpenAPI JSON / Markdown contract tables
└── ADR/                   # Architecture decision records (2-level retrieval)
    ├── ADR-Summary.md     # First-level: summary index (< 2000 tokens)
    └── NNN-*.md           # Second-level: full ADR files
```

## Execution Flow

### Small Repo (default)

Invoke the `repo-rag-builder` skill and run all 8 phases without interruption:

1. **Discovery** — Scan project structure, identify subsystems and API endpoints
2. **L0** — Generate repository panorama
3. **L1** — Subsystem-level docs (parallel per subsystem)
4. **L2 + API Contracts** — Module docs and API contract extraction (parallel)
5. **L3** — Core chain analysis for 3–8 key business flows
6. **ADR** — Extract architecture decisions, build two-level retrieval system
7. **GraphRAG** — Validate and finalize `_graph.json`
8. **Wrap-up** — Write `_index.md` and `_manifest.json` with `last_synced_commit`

### Large Repo (`--large`)

Invoke the `repo-rag-builder` skill in large-repo mode. The 5-stage flow includes mandatory human confirmation gates:

1. **Preflight Discovery** — Multi-dimensional boundary detection (physical packages + logical subsystem inference for monoliths), Token budget projection, checkpoint initialization
2. **Acceptance Gate** — Present `.rag/_plan.json` and `.rag/_discovery.md`; **wait for user to confirm** subsystem boundaries, analysis candidates, and cost estimates before proceeding
3. **Subsystem Batch Build** — Build L1/L2/API docs per confirmed subsystem; persist progress to `.rag/_state.json` after each subsystem
4. **Validation Gateway** — Manifest schema + frontmatter + `source_paths` + API + graph schema + Santa content audit (see `flows/large-stage4-validation.md`)
5. **Final Merge** — Generate global `_index.md`, `_manifest.json`, `_graph.json`; write `last_synced_commit` anchor

## Completion Report

```
RAG Knowledge Base Built
─────────────────────────────────────────
Repository:    <repo-name>
Commit anchor: <git-sha>
Documents:     N total (L0:1 L1:N L2:N L3:N API:N ADR:N)
Graph:         N nodes, N edges
Output:        .rag/
─────────────────────────────────────────
Next: use /gg:rag-sync after code changes to keep the knowledge base current.
```

## Notes

- Full build takes several minutes for large repositories; parallel execution on L1/L2/API phases reduces wall time.
- If `.rag/` already exists, the command confirms before overwriting (or resumes with `--resume`).
- `--large` enables checkpoint recovery: if the build is interrupted mid-way, run `/gg:build-rag --resume` to continue from where it left off without re-spending tokens on completed subsystems.
- After completion, configure your RAG retrieval pipeline to index `.rag/` using `_manifest.json` as the document registry and `_graph.json` for graph-aware retrieval.
