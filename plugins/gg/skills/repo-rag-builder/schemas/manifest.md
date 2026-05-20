# _manifest.json 格式规范

## 顶层结构

```json
{
  "repo": "aegis-finance",
  "generated_at": "2026-03-21T10:00:00Z",
  "last_synced_commit": "abc1234",
  "total_documents": 18,
  "hierarchy": {
    "L0": ["L0-overview"],
    "L1": ["server", "web", "plugin"],
    "L2": ["server-agents", "server-api", "server-data"],
    "L3": ["battle-flow", "auth-flow"],
    "API": ["server-api-contract"],
    "ADR": ["001-document-driven", "002-swarm-orchestrator"]
  },
  "documents": [ ... ],
  "graph_stats": { ... }
}
```

> **`last_synced_commit`** 是增量维护的关键字段：`/gg:rag-sync` 用它计算 `git diff <commit>..HEAD`，精确锁定需要更新的 RAG 文档范围，避免全量重建。

## documents[] 条目

```json
{
  "id": "backend-order-service",
  "path": ".rag/L2-modules/backend-order-service.md",
  "level": "L2",
  "title": "Order Service 模块文档",
  "summary": "...",
  "tags": ["go", "order", "domain"],
  "graph_node_id": "backend-order-service",
  "token_estimate": 1800,
  "source_paths": [
    "server/order/",
    "server/domain/order/"
  ],
  "confidence": "high",
  "review_status": "unreviewed",
  "generated_from_commit": "abc1234",
  "last_verified_commit": "abc1234"
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 文档唯一标识符 |
| `path` | string | `.rag/` 内的相对路径 |
| `level` | string | L0 / L1 / L2 / L3 / API / ADR |
| `source_paths` | string[] | 衍生自哪些源码目录/文件（精准 sync 的关键，优先于启发式路径匹配） |
| `confidence` | string | `high` / `medium` / `low`——生成时代码信号的丰富度 |
| `review_status` | string | `unreviewed` / `reviewed` / `needs-human-review` / `needs-update` |
| `generated_from_commit` | string | 首次生成时的 commit SHA |
| `last_verified_commit` | string | 最后一次 `--validate` 通过时的 commit SHA |

## graph_stats

```json
{
  "total_nodes": 45,
  "total_edges": 78,
  "node_types": {
    "repo": 1, "system": 3, "module": 12,
    "file": 15, "api": 8, "adr": 4, "class": 2
  },
  "edge_types": {
    "contains": 30, "depends_on": 15, "calls": 12,
    "handles": 8, "decided_by": 5, "imports": 8
  }
}
```

## 文档 YAML Frontmatter 规范

每份 Markdown 文档包含 YAML frontmatter：

```yaml
---
level: L1
type: system-style   # overview | system-style | module | chain-analysis | api-contract | adr
title: "Server 子系统编码风格与架构指南"
path: server/aegis/
tags: [python, agents, battle]
parent: L0-overview
children: [server-agents, server-api]
dependencies: [L0-overview]
summary: >
  Python 后端服务的架构分层、Agent 框架设计哲学与编码规范
graph_node_id: server
created: 2026-03-21
analyzer: style      # style | code | auto
---
```
