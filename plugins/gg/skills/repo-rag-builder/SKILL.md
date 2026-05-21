---
name: repo-rag-builder
description: 为 Go/Python 后端仓库构建多层级 RAG 知识库，产出 .rag/ 目录（L0→L3 分层文档、OpenAPI 契约、ADR 两级检索体系、GraphRAG 知识图谱）。当用户提出"为仓库建立 RAG"、"构建代码知识库"、"建立项目知识图谱"、"让 AI 理解我的代码"时触发，或由 /gg:build-rag 命令显式调用。_manifest.json 中的 last_synced_commit 字段是后续 /gg:rag-sync 增量维护的 git 锚点。
---

# Repo RAG Builder

为 LLM 编程助手构建**分层文档 + API 契约 + 知识图谱**三位一体的代码仓库知识库，产出 `.rag/` 目录。

核心原则：**按需加载，分而治之。** 本文件是路由器，执行细节在子文件中。

---

## 第一步：模式路由

根据调用参数选择执行路径，**立即 Read 对应子文件并按其指令执行**：

| 参数 | 执行路径 | 加载文件 |
|------|---------|---------|
| *(无参数)* | **先做轻量探测**（见下方步骤）：子系统 ≤ 5 **且** 业务文件数 < 500 → 小仓流；否则**停止**提示 `--large` | `flows/small-repo.md`（仅确认为小仓后） |
| `--large` | 大仓分阶段流（Stage 1→5，含人工确认网关）；若 `.rag/_plan.json` 已存在则**跳过 Stage 1**，但须先同步 `_state.json`（见下方说明），再进入 Stage 2 | 依次加载 `flows/large-stage1~5.md` |
| `--plan-only` | 仅执行 Stage 1（探测 + 成本投影），不写文档 | `flows/large-stage1-discovery.md` |
| `--system <name>` | Stage 3 单子系统定向构建（**前置条件**：`.rag/_plan.json` 必须存在；若不存在先运行 `--plan-only`）；完成后将该子系统在 `_state.json` 中更新为 `completed` | `flows/large-stage3-build.md` |
| `--validate` | 仅执行 Stage 4（结构 + 内容双层校验），不重建 | `flows/large-stage4-validation.md` |
| `--resume` | 读取 `_state.json`，从断点继续大仓构建（**前置条件**：`_state.json` 必须存在） | `flows/large-stage3-build.md` |
| `--yes` | 附加到任何参数（如 `--large --yes`）；跳过所有交互式确认（`.rag/` 已存在检测、Stage 2 成本网关均自动通过）。**仅限 CI / 自动化场景**；非 CI 不建议使用，Stage 2 成本确认对大仓有保护价值 | 与对应参数相同 |

> **`--large` 重入时 `_state.json` 同步步骤**（跳过 Stage 1 时必须执行）：
> 1. 读取 `_plan.json` 的 `subsystems` 键集合 P
> 2. 读取 `_state.json` 的 `subsystems` 键集合 S
> 3. 对 S 中存在但 P 中不存在的键：从 `_state.json` 中删除（用户已移除该子系统）
> 4. 对 P 中存在但 S 中不存在的键：在 `_state.json` 中补充 `{ "status": "pending", "commit_sha": null, "planned_files": [] }`（新增子系统）
> 5. 已为 `completed` 的键保持不变（不重复构建）
> 6. 同步完成后进入 Stage 2

> **无参数轻量探测步骤**（执行 small-repo.md 之前）：
> 1. `Glob **/go.mod, **/package.json, **/pyproject.toml`（排除 `**/vendor/**`、`**/node_modules/**`）→ 统计顶级包管理文件数
> 2. `Glob **/*.{go,py,ts,js,java,rs}`（排除 `**/vendor/**`、`**/node_modules/**`、`**/*_test.go`、`**/*.pb.go`、`**/*.gen.go`）→ 统计业务源码文件总数
> 3. 若文件数 ≥ 500 **或** 包管理文件数 > 5（工具包判断：代码行数 < 200 的 go.mod 所在目录不计入子系统数）→ **立即停止**，输出："检测到大仓（业务子系统约 N 个 / 业务源文件约 M 个），请使用 `--large` 分阶段构建，或用 `--plan-only` 先做零成本预检。"

---

## 文档层级体系

| 层级 | 名称 | 核心问题 | 分析路线 |
|------|------|----------|----------|
| **L0** | 仓库全景 | "这个仓库是干什么的？" | 自动生成 |
| **L1** | 系统/服务级 | "这个子系统的架构和编码规范？" | style-analyzer |
| **L2** | 模块级 | "这个模块的职责、接口和扩展点？" | 混合（偏 style） |
| **L3** | 核心链路级 | "这条业务流具体怎么跑的？" | code-analyzer |
| **API** | API 契约 | "这个接口入参出参是什么？" | 自动提取 |
| **ADR** | 架构决策记录 | "之前为什么这么做？" | 提取 + 补全 |

---

## 分析路线选择信号

**style-analyzer**（L1/L2）：interface/abstract/base 类占比高 / 清晰分层架构 / 大量配置规约文件 / 代码模式高度重复 → 产出规则、范式、DOs/DON'Ts

**code-analyzer**（L3）：复杂业务状态机 / 并发控制分布式锁 / 跨服务长调用链 / 数据一致性幂等性 → 产出调用链路图、量化参数、异常场景

不明显时默认 style 路线。

---

## 输出目录结构

```
.rag/
├── _index.md              # 总索引
├── _manifest.json         # 全局元数据（格式见 schemas/manifest.md）
├── _graph.json            # GraphRAG 知识图谱（格式见 schemas/graph.md）
├── _plan.json             # (--large/--plan-only) 子系统计划 + Token 成本预测
├── _discovery.md          # (--large/--plan-only) 人类可读探测报告
├── _state.json            # (--large) 断点续传状态
├── L0-overview.md
├── L1-systems/<system>.md
├── L2-modules/<system>-<module>.md
├── L3-chains/<chain>.md
├── api-contracts/<system>.openapi.json | <system>-api.md
└── ADR/ADR-Summary.md + NNN-<decision>.md
```

---

## 格式规范

**生成任何 L0–ADR Markdown 或 `_manifest.json` 前，必须先 Read：**

- `flows/document-format-requirements.md` — frontmatter、manifest、`source_paths` **硬约束**
- `schemas/manifest.md` — `_manifest.json` 与 frontmatter 字段定义
- `schemas/graph.md` — `_graph.json` 节点/边定义

缺少 frontmatter 或非标准 manifest 视为**构建未完成**，Stage 4 不得判通过。

---

## 质量标准

1. **自包含性**：单独取出一份文档，LLM 能否独立理解？
2. **代码锚定**：关键论述附带真实代码片段和文件路径。
3. **粒度一致**：同层级文档详细程度大致一致。
4. **检索友好**：每份文档必须有 YAML frontmatter 检索路由卡片（`summary` / `domain` / `intent` / `symbols` / `source_paths` / `graph_node_id` 等，见 `flows/document-format-requirements.md`），并与 `_manifest.json` 的 `documents[]` 条目一一对应。
5. **Token 安全**：单份文档 1000-3000 tokens；ADR-Summary.md < 2000 tokens；超长文档拆分。

---

## 多仓库场景

| 仓库类型 | 构建范围 |
|----------|---------|
| 主仓库（最大/最复杂） | 完整 L0→L3 + API + ADR + GraphRAG |
| 前端卫星仓 | L1 + L2 |
| 文档仓 | 融入 ADR |
| 独立服务 | 视复杂度，至少 L1 + API |

**操作步骤**：
1. **各仓库独立构建**：在每个仓库根目录分别运行 `/gg:build-rag`，产出各自的 `.rag/` 目录
2. **`.rag/` 存放位置**：放在各自仓库根目录内，不合并到主仓
3. **跨仓依赖边**：若主仓 A 调用卫星仓 B 的服务，在 A 的 `_graph.json` 中添加边，标注 `"cross_repo": true` 和 `"target_repo": "仓库B名称"`；目标节点 id 使用卫星仓 B 的 `_manifest.json` 中对应文档的 `graph_node_id`（需先完成 B 的构建）
4. **建议构建顺序**：依赖链底层（公共服务/SDK）→ 上层服务 → 主仓（这样 cross_repo 边的目标节点 id 均已存在）
5. **无全局索引**：各仓库 `_manifest.json` 相互独立；检索时由工具链按仓库范围分别查询

跨仓依赖在 `_graph.json` 边上标注 `"cross_repo": true`。

> **跨仓边的单向性说明**：`cross_repo` 边仅在**调用方**仓库的 `_graph.json` 中创建（A 调用 B → 在 A 的图谱中记录）。被依赖方 B 对 A 无感知，这是设计决策（各仓库 `.rag/` 独立，不跨仓写入）。若需在 B 的 RAG 中也能看到"谁依赖了我"，可在 B 的 `L1` 或 `ADR` 文档中手动备注已知的上游调用方。

---

## 注意事项

- **分析器职责分离**：L1 聚焦"怎么写才对"，L3 聚焦"具体怎么跑"；交叉内容按用户需求归属，另一边简短引用+链接。
- **ADR 推断谨慎**：`[推断]` 标注不是确定事实，供用户确认。
- **大仓成本控制**：Stage 2 确认网关不允许跳过；`--plan-only` 是零成本的预审工具。
- **并行加速**：L1 各子系统、L2 各模块、API 契约提取彼此独立，尽量并行执行。
- **纯配置/脚本仓**：若轻量探测未发现任何受支持的包管理文件（`go.mod`/`package.json`/`pyproject.toml`）且源码文件总数为 0，**立即终止**，输出提示："未检测到受支持的技术栈（Go/Python/TS/Java/Rust）。如需为纯配置/脚本仓库建立 RAG，建议手动编写文档后导入 `.rag/` 目录。"
- **近阈值场景（400–499 文件）**：业务文件数介于 400–499 时虽满足小仓条件，但接近上限。小仓流不显示成本确认网关；若单子系统文件数 ≥ 400，建议在 Phase 1 轻量摘要中额外提示："文件数接近大仓阈值，预计构建耗时较长，如需成本预检可改用 `--plan-only`。"不强制要求用户确认，仅供参考。
- **`/gg:rag-sync` 增量维护**：实现位于 `plugins/gg/commands/rag-sync.md`，以 `_manifest.json` 的 `last_synced_commit` 为 git 锚点，计算 `git diff <commit>..HEAD` 精确更新受影响文档，无需全量重建。
- **`.rag/` 目录已存在**：检测到已有构建时，提示用户：
  - 有新代码变更 → 优先使用 `/gg:rag-sync` 做增量更新（成本更低）
  - 需要全量重建（如架构大改）→ 确认后继续，原 `.rag/` 目录将被覆盖
  - 大仓全量重建前显式警告预估费用（来自 `_plan.json` 的 `total_cost_projection_usd`）
  - 附加 `--yes` 跳过此确认（CI 场景）
