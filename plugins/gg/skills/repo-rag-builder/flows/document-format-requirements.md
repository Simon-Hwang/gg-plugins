# RAG 文档格式硬约束（构建期 + 校验期）

**所有生成 `.rag/` 文档的阶段（小仓 Phase 2–7、大仓 Stage 3、Stage 5 收尾）必须遵守。** 不满足则 Stage 4 / `--validate` 判 **FAIL**，不得报告「全通过」。

格式定义见 `schemas/manifest.md`（frontmatter + `_manifest.json`）、`schemas/graph.md`（`_graph.json`）。

---

## 1. 每份 Markdown 必须有 YAML frontmatter

适用路径（**除** 元数据/索引类文件外）：

- `L0-overview.md`
- `L1-systems/*.md`
- `L2-modules/*.md`
- `L3-chains/*.md`
- `api-contracts/*-api.md`（Markdown 契约表；OpenAPI JSON 除外）
- `ADR/ADR-Summary.md`
- `ADR/NNN-*.md`

**豁免**（可无 frontmatter）：`_index.md`、`_discovery.md`、`_plan.json`、`_state.json`、`_manifest.json`、`_graph.json`、`api-contracts/*.openapi.json`

### 必填字段

| 字段 | 说明 |
|------|------|
| `id` | 文档唯一标识，必须与 `_manifest.json documents[].id` 一致 |
| `level` | `L0` / `L1` / `L2` / `L3` / `API` / `ADR` |
| `type` | `overview` / `system-style` / `module` / `chain-analysis` / `api-contract` / `adr` |
| `title` | 文档标题 |
| `summary` | 一句话摘要（检索用）：职责 + 关键动作 + 适用场景 |
| `tags` | 至少 2 个标签 |
| `domain` | 业务域/概念标签，短数组（建议 2-6 个） |
| `intent` | 自然语言检索意图，短数组（建议 2-5 条） |
| `source_paths` | 最关键源码路径，短数组（建议 1-5 个，必须真实存在） |
| `symbols` | 关键类、函数、RPC、配置、表名等精确检索锚点 |
| `graph_node_id` | 对应 `_graph.json` 节点 `id`（L0 用 `repo-<name>`） |
| `token_estimate` | 正文 token 估算，用于检索器决定是否加载全文 |
| `confidence` | `high` / `medium` / `low` |
| `updated` | 最近生成或修订日期，`YYYY-MM-DD` |

Frontmatter 是**检索路由卡片**：只放判断“是否值得加载正文”的短元数据。禁止放完整接口表、长调用链、大段代码片段或几十个路径。

**Frontmatter 控制“要不要读”，正文负责“读后怎么用”**：

| 检索阶段 | 使用数据 | 说明 |
|----------|----------|------|
| 路由匹配 | `_manifest.json documents[]` + frontmatter | 检索器用 `domain` / `intent` / `symbols` 决定候选；**此阶段不加载正文** |
| 内容加载 | 正文全文 | frontmatter 命中后才按需读正文；`token_estimate` 供检索器预判是否超 token 预算 |
| 邻接扩展 | `_graph.json` | 通过 `graph_node_id` 找到图谱邻居，追加相关上下文；不替代正文 |

`summary` 必须是一句话判断“是否相关”用，不得替代正文段落。

### 按层级额外必填

| 层级 | 额外字段 |
|------|----------|
| L1 | `path`（源码根目录）、`analyzer: style` |
| L2 | `parent`（L1 文档 id）、`analyzer: style` 或 `auto` |
| L3 | `parent`、`dependencies`、`analyzer: code` |
| ADR | `type: adr`；`graph_node_id` 与 ADR 节点一致 |

### 正文末尾 `source_paths`

除 frontmatter 外，L1/L2/L3/API(md) 正文末尾须有 **非空** `source_paths` 列表（与 manifest 中该文档的 `source_paths` 一致）。禁止仅用「推测用途」占位而无真实路径。

Frontmatter 中的 `source_paths` 是短路由列表；正文末尾与 manifest 中的 `source_paths` 是完整溯源列表。短路由列表必须是完整列表的子集。

### 模板

```yaml
---
id: backend-order-service
level: L2
type: module
title: "Order Service 模块文档"
path: backend/order/
tags: [go, order, service]
domain: [order, payment, fulfillment]
intent:
  - "查订单服务职责"
  - "定位创建订单、取消订单、支付回调处理代码"
  - "修改订单状态流转或扩展订单接口"
source_paths:
  - backend/order/
  - backend/domain/order/
symbols:
  - OrderService
  - CreateOrder
  - CancelOrder
  - OnPaymentCallback
parent: backend-outgame
dependencies: [L0-overview, backend-outgame]
token_estimate: 1800
summary: >
  订单服务的职责、对外接口、状态流转与扩展点
graph_node_id: backend-order-service
created: 2026-05-20
updated: 2026-05-21
analyzer: style
confidence: high
---
```

---

## 2. `_manifest.json` 必须符合 schema

禁止仅用按层级分组的路径数组替代 `documents[]`。

### 顶层必填

- `repo`、`generated_at`、`last_synced_commit`、`total_documents`
- `hierarchy`（各层文档 id 列表）
- `documents`（**数组**，每项一条文档注册表）
- `graph_stats`（与 `_graph.json` 实际计数一致）

### 每条 `documents[]` 必填

`id`, `path`, `level`, `title`, `summary`, `tags`, `domain`, `intent`, `symbols`, `graph_node_id`, `token_estimate`, `source_paths`（非空数组）, `confidence`, `review_status`, `generated_from_commit`, `last_verified_commit`

构建完成时 `review_status` 默认为 `unreviewed`；Stage 4g Santa 通过后改为 `reviewed` 或 `needs-human-review`。

### 与磁盘一致性

- 每个 `documents[].path` 指向的文件必须存在
- `total_documents` 必须等于 `documents.length`
- 每个 Markdown 文档在 `documents[]` 中有且仅有一条对应条目

---

## 3. 构建顺序（避免漏项）

每写完一份 Markdown：

1. 先写 YAML frontmatter，再写正文
2. 立即在内存/草稿中追加对应的 `documents[]` 条目（含 `domain` / `intent` / `symbols` / 完整 `source_paths`）
3. 更新 `_graph.json` 节点 `doc_ref` 与 frontmatter `graph_node_id` 一致

Stage 5 / 小仓收尾时一次性写出符合 schema 的 `_manifest.json`，不要用非标准 JSON 形状。

---

## 4. `_graph.json` 边字段

边必须使用 `source` / `target`，**禁止** `from` / `to`。节点 `type` 仅使用 `schemas/graph.md` 列出的类型。
