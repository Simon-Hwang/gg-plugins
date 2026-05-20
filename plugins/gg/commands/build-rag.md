---
description: Build a full RAG knowledge base for the current repository. Scans all source code and generates .rag/ with layered docs (L0→L3), API contracts, ADR index, and GraphRAG knowledge graph. Run once to initialize; use /gg:rag-sync for incremental updates after code changes.
---

# Build RAG Knowledge Base

Trigger the `repo-rag-builder` skill to perform a full, one-time construction of the `.rag/` knowledge base for this repository.

## When to Use

- **First-time initialization**: No `.rag/` directory exists yet.
- **Major restructuring**: Significant architectural changes have made the existing knowledge base stale (> 40% of modules changed).
- **Periodic deep refresh**: Quarterly rebuild to pick up accumulated drift.

For routine code changes after initialization, use `/gg:rag-sync` (incremental, much faster).

## What Gets Built

```
.rag/
├── _index.md              # Navigation index
├── _manifest.json         # Metadata + last_synced_commit anchor
├── _graph.json            # GraphRAG knowledge graph
├── L0-overview.md         # Repository panorama
├── L1-systems/            # Subsystem-level docs (style-analyzer route)
├── L2-modules/            # Module-level docs
├── L3-chains/             # Core business flow docs (code-analyzer route)
├── api-contracts/         # OpenAPI JSON / Markdown contract tables
└── ADR/                   # Architecture decision records (2-level retrieval)
    ├── ADR-Summary.md     # First-level: summary index (< 2000 tokens)
    └── NNN-*.md           # Second-level: full ADR files
```

## Execution

Invoke the `repo-rag-builder` skill and run all 8 phases without interruption:

1. **Discovery** — Scan project structure, identify subsystems and API endpoints
2. **L0** — Generate repository panorama
3. **L1** — Subsystem-level docs (parallel per subsystem)
4. **L2 + API Contracts** — Module docs and API contract extraction (parallel)
5. **L3** — Core chain analysis for 3–8 key business flows
6. **ADR** — Extract architecture decisions, build two-level retrieval system
7. **GraphRAG** — Validate and finalize `_graph.json`
8. **Wrap-up** — Write `_index.md` and `_manifest.json` with `last_synced_commit`

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
- If `.rag/` already exists, the command confirms before overwriting.
- After completion, configure your RAG retrieval pipeline to index `.rag/` using `_manifest.json` as the document registry and `_graph.json` for graph-aware retrieval.
