# _manifest.json 格式规范

## 顶层结构

```json
{
  "schema_version": "1",
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
  "path": "L2-modules/backend-order-service.md",
  "level": "L2",
  "title": "Order Service 模块文档",
  "summary": "订单服务的职责、对外接口、状态流转与扩展点",
  "tags": ["go", "order", "domain"],
  "domain": ["order", "payment", "fulfillment"],
  "intent": [
    "查订单服务职责",
    "定位创建订单、取消订单、支付回调处理代码",
    "修改订单状态流转或扩展订单接口"
  ],
  "symbols": ["OrderService", "CreateOrder", "CancelOrder", "OnPaymentCallback"],
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
| `domain` | string[] | 业务域/概念标签，用于语义路由（短数组，建议 2-6 个） |
| `intent` | string[] | 用户可能提出的自然语言检索意图（短数组，建议 2-5 条） |
| `symbols` | string[] | 关键类、函数、RPC、配置、表名等精确检索锚点（建议 3-12 个） |
| `source_paths` | string[] | 衍生自哪些源码目录/文件（精准 sync 的关键，优先于启发式路径匹配） |
| `confidence` | string | `high` / `medium` / `low`——生成时代码信号的丰富度 |
| `review_status` | string | `unreviewed` / `reviewed` / `needs-human-review` / `needs-update` |
| `generated_from_commit` | string | 首次生成时的 commit SHA |
| `last_verified_commit` | string | 最后一次 `--validate` 通过时的 commit SHA |

`documents[]` 是完整注册表，可保留较完整的 `source_paths` 与审计状态；Markdown frontmatter 是检索路由卡片，只放判断是否加载正文所需的短字段。

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

> **强制执行**：构建期见 `flows/document-format-requirements.md`；校验期见 `flows/large-stage4-validation.md` **4b**（缺失即 FAIL）。

每份 Markdown 文档包含 YAML frontmatter：

```yaml
---
id: server
level: L1
type: system-style   # overview | system-style | module | chain-analysis | api-contract | adr
title: "Server 子系统编码风格与架构指南"
path: server/aegis/
tags: [python, agents, battle]
domain: [battle, agent-framework, backend]
intent:
  - "查 Server 子系统架构与编码规范"
  - "新增 Agent 或修改战斗流程时定位扩展点"
  - "理解后端分层、依赖注入和配置加载方式"
source_paths:
  - server/aegis/
  - server/config/
symbols:
  - Agent
  - BattleService
  - load_config
parent: L0-overview
children: [server-agents, server-api]
dependencies: [L0-overview]
token_estimate: 1800
summary: >
  Python 后端服务的架构分层、Agent 框架设计哲学与编码规范
graph_node_id: server
created: 2026-03-21
updated: 2026-05-21
analyzer: style      # style | code | auto
confidence: high
---
```

### Frontmatter 设计原则

Frontmatter 是**检索路由卡片**，用于决定是否加载正文，不承载完整正文信息。

- `summary` 写“职责 + 关键动作 + 适用场景”，避免泛化成“模块文档”。
- `intent` 写用户会问的问题或任务意图，提升自然语言召回。
- `domain` 写业务概念，不堆技术废词。
- `symbols` 写高价值精确锚点，优先函数/RPC/类/配置/表名。
- `source_paths` 在 frontmatter 中保持短小，优先 1-5 个最关键路径；完整来源仍以 `documents[].source_paths` 和正文末尾 `source_paths` 为准。
- 禁止把完整接口表、长调用链、大段代码片段、几十个路径塞进 frontmatter。
