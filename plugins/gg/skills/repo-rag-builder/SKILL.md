---
name: repo-rag-builder
description: 为 Go/Python 后端仓库构建多层级 RAG 知识库，产出 .rag/ 目录（L0→L3 分层文档、OpenAPI 契约、ADR 两级检索体系、GraphRAG 知识图谱）。当用户提出"为仓库建立 RAG"、"构建代码知识库"、"建立项目知识图谱"、"让 AI 理解我的代码"时触发，或由 /gg:build-rag 命令显式调用。_manifest.json 中的 last_synced_commit 字段是后续 /gg:rag-sync 增量维护的 git 锚点。
---

# Repo RAG Builder — 仓库级 RAG 知识库构建工作流

## 核心使命

为 LLM 编程助手构建一套**分层文档 + API 契约 + 知识图谱**三位一体的代码仓库知识库。

这套知识库服务于一个核心场景：当 AI 助手执行需求时，RAG 提供的是**开卷考试资料**。问题的粒度千差万别——从"项目用了什么技术栈"到"这个函数的并发锁怎么设计的"——所以资料必须分层组织、精准召回、避免上下文爆炸。

## 三大 RAG 支柱

| 支柱 | 作用 | 产出格式 |
|------|------|----------|
| **分层文档** | 从仓库全景到核心链路的逐级深入，匹配不同粒度的问题 | Markdown + YAML frontmatter |
| **API 契约** | 结构化的接口定义，LLM 编码时直接引用的"字典" | OpenAPI JSON / Markdown 契约表 |
| **知识图谱 (GraphRAG)** | 模块、文件、API、决策之间的依赖网络，支持带关系的精准代码召回 | `_graph.json` 节点-边结构 |

---

## 文档层级体系

| 层级 | 名称 | 核心问题 | 分析路线 | 典型粒度 |
|------|------|----------|----------|----------|
| **L0** | 仓库全景 | "这个仓库是干什么的？" | 自动生成 | 1 篇/仓库 |
| **L1** | 系统/服务级 | "这个子系统的架构和编码规范？" | **style-analyzer** | 1 篇/子系统 |
| **L2** | 模块级 | "这个模块的职责、接口和扩展点？" | 混合（偏 style） | 1 篇/核心模块 |
| **L3** | 核心链路级 | "这条业务流具体怎么跑的？" | **code-analyzer** | 1 篇/关键链路 |
| **API** | API 契约 | "这个接口入参出参是什么？" | 自动提取 | 1 份/子系统 |
| **ADR** | 架构决策记录 | "之前为什么这么做？" | 提取+补全 | 摘要索引 + 按需全文 |

---

## 全自动执行工作流

整个流程**不需要中间交互**，一次性跑完。

### Phase 1: 仓库探测与分类 (Discovery)

1. **结构扫描**：使用 Glob、文件读取等工具，扫描目录树、技术栈、入口文件、配置文件。
2. **子系统识别**：以独立包管理文件（`package.json`、`pyproject.toml`、`go.mod`）、独立构建配置、明显目录隔离为边界。
3. **API 端点发现**：扫描路由注册代码（Go `mux.HandleFunc`、Gin/Echo 路由、gRPC proto 文件等），建立端点清单。
4. **模块分类与路线决策**：
   - **style-analyzer 路线**（L1/L2）：interface/abstract/base/config/schema 密集 → 提取"规则"和"怎么写才对"
   - **code-analyzer 路线**（L3）：handler/service/flow/pipeline/orchestrator 密集 → 提取"具体怎么跑"和"边界在哪"
   - 不明显时，默认 style 路线（对 RAG 通用价值更高）
5. **知识图谱初始化**：开始构建节点列表（子系统、模块、关键文件），后续 Phase 逐步补充边。

### Phase 2: L0 仓库全景

**产出**：`L0-overview.md`

回答"一个完全陌生的 LLM 需要知道什么才能开始工作"：
- 项目定位（一句话）
- 技术栈总览
- 子系统拓扑图（Mermaid，标出依赖方向）
- 目录结构速览（带职责注解）
- 快速导航（指向 L1 各文档的链接）

### Phase 3: L1 系统级文档（style-analyzer 路线）

对每个子系统，一次性完成 style-analyzer 的全部分析步骤：

1. **探索骨架**：核心接口、基类、路由注册、依赖注入、配置加载
2. **提取规则**：
   - 分层与职责边界
   - 核心设计哲学（附代码片段）
   - 标准开发工作流（保姆级步骤）
   - 强制红线 DOs/DON'Ts
   - 公共工具备忘录
3. **写入** `L1-systems/<system>.md`

### Phase 4: L2 模块级文档

对每个核心模块：
1. 职责概述 + 在子系统中的角色
2. 对外接口（暴露的 API/函数/类）
3. 内部结构（关键文件分工）
4. 扩展点（加功能的切入点）
5. 依赖关系（上游、下游）
6. 代表性代码片段

### Phase 5: API 契约提取

API 契约是 LLM 编码时的"字典"——写请求、调接口、做联调时第一个查的资料。

1. **路由扫描**：遍历 Phase 1 发现的所有路由注册点，提取：
   - HTTP Method + Path
   - 请求参数（path/query/body）及类型
   - 响应结构及类型
   - 认证/鉴权要求
   - 中间件链
2. **输出格式**：优先生成 OpenAPI 3.0 JSON（`api-contracts/<system>.openapi.json`）。如果仓库没有显式的类型标注，回退为 Markdown 契约表格式：
   ```markdown
   ## POST /api/battles
   **Auth**: Bearer JWT
   **Request Body**:
   | Field | Type | Required | Description |
   |-------|------|----------|-------------|
   | target | string | yes | 股票代码 |
   | agents | string[] | no | 参战 Agent 列表 |
   **Response 200**:
   | Field | Type | Description |
   |-------|------|-------------|
   | battle_id | string | Battle UUID |
   | status | string | 初始状态 |
   ```
3. **gRPC/内部 RPC**：如果存在 proto 文件或内部 RPC 定义，也一并提取为契约文档
4. **知识图谱更新**：每个 API 端点作为节点，关联到所属模块和处理函数

### Phase 6: L3 核心链路文档（code-analyzer 路线）

筛选仓库中最核心的 3-8 条业务流程，一次性完成 code-analyzer 的全部分析：

1. **全链路追踪**：从入口到落盘的完整调用链（Mermaid 时序图）
2. **量化指标**：硬编码参数（超时、重试、队列大小、并发数）
3. **可靠性分析**：并发控制、异常恢复、数据一致性
4. **边界与风险**：极端场景下的系统行为

### Phase 7: ADR 架构决策记录（两级检索体系）

ADR 的设计原则是**避免上下文爆炸**：不把所有决策全文塞给 LLM，而是通过两级检索——先查摘要命中关键字，再按需读全文。

#### 第一级：ADR-Summary.md（摘要字典）

这是 ADR 体系的核心检索入口。LLM 在需要理解"为什么"时，首先读这份文件：

```markdown
# ADR 摘要索引

| ID | 标题 | 状态 | 关键字 | 一句话摘要 | 全文路径 |
|----|------|------|--------|-----------|----------|
| 001 | 文档驱动架构替代 JSON-First | Accepted | markdown, document-driven, json, parser | 将 Agent 输出从强制 JSON 改为 Markdown-First 以提升 LLM 输出稳定性和人类可读性 | ADR/001-document-driven.md |
| 002 | Swarm 编排器取代线性 Pipeline | Accepted | swarm, parallel, orchestrator, battle | 引入 TaskBoard + 并行执行模型替代线性 Agent 调用链 | ADR/002-swarm-orchestrator.md |
```

**设计要点**：
- 每行控制在一行内，整个文件控制在 LLM 一次读取的安全范围内（< 2000 tokens）
- `关键字` 列是检索命中的关键——包含与该决策相关的技术术语、模块名、概念名
- LLM 根据关键字匹配判断是否需要读全文，通过 `全文路径` 列用 Read 工具按需加载

#### 第二级：ADR 全文文件

每条 ADR 使用标准化格式，存放在 `ADR/` 目录：

```markdown
---
id: "001"
title: "文档驱动架构替代 JSON-First"
status: Accepted          # Accepted | Superseded | Deprecated
keywords: [markdown, document-driven, json, parser, llm-output]
created: 2026-03-19
supersedes: null           # 如果替代了旧决策，填旧 ADR ID
---

# ADR-001: 文档驱动架构替代 JSON-First

## 上下文
Agent 输出强制 JSON 导致 LLM 输出不稳定（解析失败率高）、人类不可读、与 Plugin Skills 的 Markdown 风格不一致。

## 决策
将 Agent 输出从 JSON-First 迁移到 Markdown-First，通过 Markdown Parser 提取结构化数据。

## 理由
- LLM 更擅长生成结构化 Markdown（失败率大幅下降）
- 人类可直接阅读和审计
- 与 Skills 文档风格统一
- 支持 Evidence 相对路径引用

## 后果
- 需要开发 Markdown Parser
- 渐进迁移期需支持双模式（JSON + Markdown）
- 存储从 SQLAlchemy 迁移到 Markdown 文件

## 关联代码
- `server/aegis/parsers/markdown_parser.py`
- `server/aegis/storage/markdown/`
- `aegis-finance-plugin/schemas/agent-output-spec.md`
```

#### ADR 来源自动提取

从以下来源发现已有的架构决策：
- 仓库中的 `docs/`、`trd/`、`.aegis/plans/` 等目录
- 代码注释中的 `TODO`、`HACK`、`FIXME`、`NOTE` 以及设计说明注释
- Git commit message 中的重大变更
- README 中的设计说明段落
- 对于代码中明显存在但没有显式文档的决策，基于代码证据推断并在 status 后标注 `[推断]`

### Phase 8: GraphRAG 知识图谱构建

知识图谱将需求文档、代码文件、模块、API 端点、架构决策构建成一张**带依赖关系的网络**。它解决的问题是：当 LLM 需要修改某个模块时，能精准召回所有受影响的上下游代码，而不是盲目搜索。

#### 节点类型 (Node Types)

| 类型 | 说明 | 来源 |
|------|------|------|
| `repo` | 仓库 | Phase 1 |
| `system` | 子系统 | Phase 1 |
| `module` | 模块 | Phase 4 |
| `file` | 关键源文件 | 全流程扫描 |
| `class` | 核心类/结构体 | Phase 3/4 |
| `function` | 关键函数 | Phase 6 |
| `api` | API 端点 | Phase 5 |
| `adr` | 架构决策 | Phase 7 |
| `config` | 配置项 | Phase 1 |

#### 边类型 (Edge Types)

| 类型 | 含义 | 示例 |
|------|------|------|
| `contains` | 包含关系 | repo → system → module → file |
| `depends_on` | 依赖关系 | module A depends_on module B |
| `calls` | 调用关系 | function A calls function B |
| `implements` | 实现关系 | class X implements interface Y |
| `handles` | 处理关系 | function Z handles API endpoint /foo |
| `decided_by` | 决策关联 | module M decided_by ADR-001 |
| `imports` | 导入关系 | file A imports file B |
| `extends` | 继承关系 | class Child extends class Parent |

#### `_graph.json` 格式

```json
{
  "nodes": [
    {
      "id": "server-agents",
      "type": "module",
      "label": "agents 模块",
      "path": "server/aegis/agents/",
      "tags": ["python", "agent", "battle"],
      "doc_ref": "L2-modules/server-agents.md"
    },
    {
      "id": "api-post-battles",
      "type": "api",
      "label": "POST /api/battles",
      "path": "server/aegis/api/routes/battles.py",
      "method": "POST",
      "doc_ref": "api-contracts/server.openapi.json#/paths/~1api~1battles/post"
    }
  ],
  "edges": [
    {
      "source": "api-post-battles",
      "target": "server-agents",
      "type": "calls",
      "label": "触发 Battle 执行"
    },
    {
      "source": "server-agents",
      "target": "adr-001",
      "type": "decided_by",
      "label": "Agent 输出格式由 ADR-001 决定"
    }
  ]
}
```

#### 构建策略

知识图谱不是在 Phase 8 从头构建的——它在整个流程中**逐步积累**：
- Phase 1：创建 repo/system 节点
- Phase 3/4：补充 module/class 节点，添加 contains/depends_on 边
- Phase 5：补充 api 节点，添加 handles 边
- Phase 6：补充 function 节点，添加 calls 边
- Phase 7：补充 adr 节点，添加 decided_by 边
- Phase 8：**校验与补全**——检查孤立节点、补充遗漏的 imports/extends 边、生成最终 `_graph.json`

重点关注：**不要追求穷举所有文件和函数**。只纳入"如果要改它，你需要知道它影响了谁"的关键节点。一个模块内部的私有辅助函数不需要进图谱，但暴露给其他模块的接口函数必须在。

---

## 输出目录结构

```
.rag/
├── _index.md                      # 总索引（人类+机器可读导航）
├── _manifest.json                 # 全局元数据清单
├── _graph.json                    # GraphRAG 知识图谱
├── L0-overview.md                 # 仓库全景
├── L1-systems/                    # 系统级文档（style-analyzer 路线）
│   └── <system-name>.md
├── L2-modules/                    # 模块级文档
│   └── <system>-<module>.md
├── L3-chains/                     # 核心链路文档（code-analyzer 路线）
│   └── <chain-name>.md
├── api-contracts/                 # API 契约
│   ├── <system>.openapi.json      # OpenAPI 格式（优先）
│   └── <system>-api.md            # Markdown 契约表（回退）
└── ADR/                           # 架构决策记录
    ├── ADR-Summary.md             # 一级检索：摘要字典
    └── NNN-<decision>.md          # 二级检索：全文文件
```

## 文档元数据规范（YAML Frontmatter）

每份 Markdown 文档包含 YAML frontmatter 作为 RAG 检索元数据：

```yaml
---
level: L1                              # L0 | L1 | L2 | L3 | API | ADR
type: system-style                     # overview | system-style | module | chain-analysis | api-contract | adr
title: "Server 子系统编码风格与架构指南"
path: server/aegis/
tags: [python, agents, battle]
parent: L0-overview
children: [server-agents, server-api]
dependencies: [L0-overview]
summary: >
  Python 后端服务的架构分层、Agent 框架设计哲学与编码规范
graph_node_id: server                  # 对应 _graph.json 中的节点 ID
created: 2026-03-21
analyzer: style                        # style | code | auto
---
```

## `_manifest.json` 格式

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
  "documents": [
    {
      "id": "L0-overview",
      "path": ".rag/L0-overview.md",
      "level": "L0",
      "title": "Aegis Finance 仓库全景",
      "summary": "...",
      "tags": ["overview", "architecture"],
      "graph_node_id": "repo-aegis-finance",
      "token_estimate": 1200
    }
  ],
  "graph_stats": {
    "total_nodes": 45,
    "total_edges": 78,
    "node_types": {"repo": 1, "system": 3, "module": 12, "file": 15, "api": 8, "adr": 4, "class": 2},
    "edge_types": {"contains": 30, "depends_on": 15, "calls": 12, "handles": 8, "decided_by": 5, "imports": 8}
  }
}
}
```

---

## 分析路线的智能选择

### style-analyzer 路线信号
- interface/abstract/base 类占比高
- 清晰分层架构（handler → service → repository）
- 大量配置、规约文件
- 代码模式高度重复
- **产出**：规则、范式、DOs/DON'Ts、标准工作流

### code-analyzer 路线信号
- 复杂业务状态机或流程编排
- 并发控制、分布式锁、队列
- 跨服务长调用链
- 数据一致性、幂等性
- **产出**：调用链路图、量化参数、异常场景

---

## 文档质量标准

1. **自包含性**：单独取出一份文档，LLM 能否理解？必要上下文用简短引述补全。
2. **代码锚定**：关键论述附带真实代码片段和文件路径。
3. **粒度一致**：同层级文档详细程度大致一致。
4. **检索友好**：frontmatter 的 tags 和 summary 匹配自然语言问题。
5. **Token 安全**：单份文档 1000-3000 tokens，ADR-Summary.md < 2000 tokens。超长文档拆分。

---

## 多仓库场景

多个相关仓库时：
1. **主仓库**（代码量最大、最复杂）：完整走 L0→L3 + API + ADR + GraphRAG
2. **卫星仓库**：前端类 → L1 + L2；文档类 → 融入 ADR；独立服务 → 视复杂度
3. **跨仓引用**：知识图谱中标注跨仓边（`cross_repo: true`）

---

## 执行节奏

1. Phase 1（探测）+ Phase 2（L0） — 建立全局视图
2. Phase 3（L1）— 逐子系统并行（用 Task 工具）
3. Phase 4（L2）— 逐模块并行
4. Phase 5（API 契约）— 可与 Phase 4 同步进行
5. Phase 6（L3）— 逐链路深挖（最耗时，优先核心链路）
6. Phase 7（ADR）— 两级体系构建
7. Phase 8（GraphRAG）— 校验补全 + 生成 `_graph.json`
8. 收尾 — 生成 `_index.md` + `_manifest.json`（写入 `last_synced_commit = git rev-parse HEAD`）

每批次完成后写入 `.rag/`。全部完成后告知用户产出位置，并提示后续用 `/gg:rag-sync` 进行增量维护。

> **`last_synced_commit`** 是增量维护的关键字段：`/gg:rag-sync` 用它计算 `git diff <commit>..HEAD`，精确锁定本次需要更新的 RAG 文档范围，避免全量重建。

---

## 注意事项

- **分析器职责分离**：L1 聚焦"怎么写才对"，L3 聚焦"具体怎么跑"。交叉内容按"哪层用户更需要"归属，另一边简短引用+链接。
- **ADR 推断谨慎**：标注 `[推断]` 的 ADR 不是确定事实，方便用户确认或修正。
- **图谱精简原则**：只纳入"改它需要知道影响了谁"的关键节点，不追求穷举。
- **并行加速**：L1 各子系统、L2 各模块、API 契约提取彼此独立，尽量并行执行。
