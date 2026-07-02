# GG 命令参考手册

GG 插件面向 Go / Python 后端开发场景，提供覆盖完整开发生命周期的 slash 命令。本手册面向**开发者**，说明每个命令的作用和适用场景。

> AI 导航图用途：`/gg:gg-guide` 命令会读取本文件来回答关于命令选择和工作流链路的问题。

---

## 一、功能开发主链路

这是一个完整功能从立项到上线的典型命令序列：

```
/gg:explore → /gg:plan → /gg:feature → /gg:tdd → /gg:review → /gg:ship
```

### `/gg:explore` — 代码库探索与上手引导

**适用场景：** 接手新项目、进入陌生模块、了解某个功能的执行路径。

扫描项目结构、入口点、架构分层、关键领域类型，生成一份「定向报告」供后续开发参考。支持 `--scan`（完整资产分类）和 `--onboard`（新人引导）模式，也可以直接传入库名来查阅文档。

---

### `/gg:plan` — 需求分析与实现规划

**适用场景：** 开始新功能、进行重大重构、需求模糊时、多文件改动前的规划。

用自然语言描述需求，命令会：重述需求→识别风险→按阶段拆解任务→等待你确认后再动代码。支持传入 `.prd.md` 文件，会自动将计划写入 `.claude/plans/`。

> ⚠️ 确认前不会修改任何代码。

---

### `/gg:feature` — 功能立项全流程

**适用场景：** 启动一个全新功能，需要完整的「研究 → 探索 → 规划 → 设计」前置阶段。

是 `/gg:explore` + `/gg:plan` + `/gg:design` 的组合管道，依次调用专用 agent：搜索已有实现、探索代码库、生成实现计划（等待确认）、输出架构蓝图和 ADR 决策记录。

> 与 `/gg:plan` 的区别：`feature` 包含代码库探索和架构设计，`plan` 是轻量的单阶段规划。

---

### `/gg:design` — 架构与 API 设计

**适用场景：** 需要在多个技术路线间做决策（同步 vs 异步、REST vs 事件驱动），或需要正式的服务层架构设计和 API 合约。

启动「四声部议会」（Architect / Skeptic / Pragmatist / Critic）评估各方案，输出六边形架构设计、REST API 合约草案，并将决策记录为 ADR 文件（`.claude/decisions/`）。

> 数据库 schema 设计请用 `/gg:db`，轻量规划请用 `/gg:plan`。

---

### `/gg:tdd` — 测试驱动开发

**适用场景：** 实现任何需要保障质量的功能，尤其是业务逻辑、公共 API、复杂边界条件。

严格执行 **RED → GREEN → REFACTOR** 循环，Go 和 Python 均支持。包含覆盖率分析（目标 80%+）、E2E 验证选项，以及构建失败时的自动错误修复。

---

### `/gg:build-fix` — 构建与编译错误修复

**适用场景：** 构建报错、类型检查失败、lint 报错、import 错误。

自动检测项目语言（Go / Python / TypeScript / Rust / Java 等），逐一修复错误并验证，避免引入新问题。遇到架构级问题会主动停下询问。

> PyTorch / CUDA 训练错误请用 `/gg:ml --fix`。

---

### `/gg:refactor` — 代码清理与重构

**适用场景：** 代码逐渐腐化、函数过长、错误处理混乱、存在死代码或重复逻辑。

要求测试先绿才能开始，按四个维度清理：死代码 → 错误处理 → 复杂度 → 编码规范。全程验证行为不变（测试覆盖率不能下降）。

---

### `/gg:review` — 代码审查（本地 + GitHub PR）

**适用场景：** 提交前的自审、让 AI 做语言专项深度审查、对 GitHub PR 发布正式 review。

**本地模式**（默认）：静态分析 → 语言专项 agent（`go-reviewer` / `python-reviewer`）→ 错误处理审计 → 安全审查 → 测试覆盖评估。

**PR 模式**（传入 `--pr <数字|URL>`）：从 GitHub 拉取 diff → 7 维度检查 → 运行验证 → 生成 review artifact（`.claude/reviews/`）→ 发布 APPROVE / REQUEST CHANGES / BLOCK 判决和 inline 评论。

| 常用参数 | 作用 |
|---------|------|
| `--pr 42` | PR 审查模式 |
| `--strict` | 开启双重审核门控（高风险变更） |
| `--security-only` | 仅跑安全审查 |

---

### `/gg:ship` — 发布前质量门控

**适用场景：** 准备合并 PR 或打 release tag 时，需要一键完成所有质量检查。

按序执行：构建验证 → 代码审查 → 安全扫描 → 测试覆盖 → （高风险时）双重审核 → 文档同步 → Git 提交/PR 描述生成 → （可选）部署前检查。任一 CRITICAL 或 HIGH 问题都会阻断流程。

| 常用参数 | 作用 |
|---------|------|
| `--pr 42` | 对指定 PR 走全流程 |
| `--strict` | 强制开启双重审核 |
| `--deploy` | 额外执行部署前检查清单 |

---

## 二、领域专项命令

### `/gg:db` — 数据库全流程

**适用场景：** 设计新 schema、写迁移脚本、排查慢查询、评审数据层变更。

覆盖 PostgreSQL / MySQL / Redis 三种数据库，包含零停机迁移规则（增列先于删列、禁止单步重命名）、`EXPLAIN ANALYZE` 查询优化、安全（RLS、权限隔离）检查。

---

### `/gg:ml` — ML / PyTorch 工作流

**适用场景：** PyTorch 模型开发、训练崩溃排查、CUDA 错误、ML 代码审查和测试编写。

| 参数 | 作用 |
|------|------|
| `--fix` | 修复训练崩溃、CUDA OOM、tensor shape 错误 |
| `--test` | 为 ML pipeline 编写测试（shape / overfit / 可复现性） |
| `--review` | 审查模型架构和训练代码 |

---

### `/gg:diagnose` — 性能与错误诊断

**适用场景：** 接口变慢、内存增长、goroutine 泄漏、静默失败、运行时 panic、AI agent 行为异常。

| 参数 | 作用 |
|------|------|
| `--perf` | 性能瓶颈分析（pprof / cProfile / EXPLAIN） |
| `--errors` | 追踪静默失败和吞掉的错误 |
| `--build` | 委托 `/gg:build-fix` 处理构建错误 |
| `--agent` | 诊断 AI agent 循环卡死或输出异常 |

---

### `/gg:security-scan` — Agent 安全扫描

**适用场景：** 审计 Claude Code 配置安全性——agent 权限、hook 脚本、MCP server 风险、prompt 注入防护。

> ⚠️ 这里扫描的是**AI agent 基础设施本身**的安全，不是源码安全。源码安全请用 `/gg:review --security-only`。

---

### `/gg:update-docs` — 文档同步

**适用场景：** 实现完成后，将 `package.json` 脚本、`.env.example`、路由定义等源文件的变更同步到技术文档（CONTRIBUTING.md、RUNBOOK.md、ENV 说明）。

---

## 三、知识库（RAG）命令

### `/gg:build-rag` — 构建 RAG 知识库

**适用场景：** 为大型代码库首次建立持久化知识库，或季度性重建以消除积累的偏差。

扫描全量代码，生成 `.rag/` 目录（L0 全局概览 → L1 子系统 → L2 模块 → L3 核心业务链路 → API 合约 → ADR 索引 → GraphRAG 图）。每篇 Markdown 须带 YAML frontmatter；`_manifest.json` 须为标准 `documents[]` 注册表。

| 参数 | 作用 |
|------|------|
| `--large` | 大仓分阶段 + 人工确认边界 |
| `--validate` | **完整**校验：manifest schema、frontmatter、图谱格式、Santa 内容审计；须输出审计报告，不能只做死链检查 |
| `--plan-only` | 仅探测与成本，不写文档 |

> 首次运行后，日常增量更新请用 `/gg:rag-sync`。

---

### `/gg:rag-sync` — 增量同步知识库

**适用场景：** 每次完成功能、修复或重构后，保持 `.rag/` 知识库与最新代码同步。

基于 `git diff --name-status` 与 `_manifest.json documents[].source_paths` 精准识别受影响的已有 RAG 文档，只更新业务变更相关内容，并维护 frontmatter、manifest 与 graph 元数据。超过 40% 文档受影响、新子系统或边界变化时，会建议改跑 `/gg:build-rag --system <name>` 或全量构建。

---

### `/gg:docs-observe` — 静态文档事实审计

**适用场景：** 从业务文档提取原子 Claim，并用固定 commit 的代码、配置、IDL、Schema 和测试建立可复现的静态 Evidence/Verdict。不会声称线上版本、实际生效配置、实验覆盖或真实流量。

### `/gg:docs-synthesize` — 证据化知识合成

**适用场景：** 根据 Domain Profile 和 Knowledge Blueprint，将已验证 Claim/Evidence/Verdict/Mapping 编译为知识草稿、Topology、Impact Index、Retrieval Card 和 Gap。只写 Synthesis Bundle，不发布正式知识。

### `/gg:docs-publish` — 审批后知识发布

**适用场景：** 根据 Publication Policy 验证 Bundle hash、审批角色、change_id、目标范围和 base hash，并以确定性文件操作发布知识与 Agent Context Pack。支持计划、应用、状态校验和安全回滚，不在发布阶段生成内容。

### `/gg:docs-maintain` — 文档事实持续维护

**适用场景：** 按 Claim、文档、领域、Git 变更或全量范围重验已有事实链。每次先执行 capability preflight；缺少运行 Adapter 时显式降级。

### `/gg:docs-index` 与 `/gg:docs-approve`

`docs-index` 负责可删除 SQLite 索引的重建、校验和查询。Codex 不依赖
原生 Slash Prompt；`/gg:docs-approve` 文本由命令路由器转到
`$docs-approve` Skill，后者默认只审查候选补丁，仅应用明确授权的条目，
并在应用后重新验证 Claim、Verdict 和 Finding。

---

## 四、Agent 基础设施命令

### `/gg:orchestrate` — 顺序 Agent 链编排

**适用场景：** 需要将多个 agent 串联成流水线，每个 agent 的输出作为下一个的上下文输入。

```
/gg:orchestrate custom "planner,tdd-guide,go-reviewer,security-reviewer" "实现 JWT refresh token 轮换..."
```

可用 agent 见文件底部「Agent 目录」一节。配合 `plan-orchestrate` skill 可以从计划文档自动生成编排命令。

---

### `/gg:agent-health` — Agent 系统健康检查

**适用场景：** 怀疑 agent 配置有问题、Context 开销过大、MCP server 有安全风险、自动化循环卡死时。

输出一份评分报告，覆盖：Harness 配置质量、Context 预算、安全等级、工作区插件清单、循环健康状态、评估框架覆盖率。

---

### `/gg:harness-audit` — Harness 确定性审计

**适用场景：** 需要一个可重现、脚本驱动的评分报告（CI 场景、版本对比）。

运行 `scripts/harness-audit.js`，输出 7 个固定维度的 0–10 分：工具覆盖、Context 效率、质量门控、记忆持久化、评估覆盖、安全护栏、成本效率。

---

### `/gg:task-trace` — 任务追踪事件查看

**适用场景：** 复盘一次 agent 会话的行为，查看工具调用顺序、文件操作、失败节点。

```
/gg:task-trace summary --format markdown          # 会话级汇总
/gg:task-trace timeline --session <id>            # 单会话时间线
```

数据存储在 `~/.claude/metrics/gg-task-trace.jsonl`，与 `continuous-learning-v2` 独立。

---

### `/gg:gg-guide` — GG 插件导航

**适用场景：** 不知道该用哪个命令、想了解某个 skill/agent/hook 的作用、需要推荐工作流链路。

```
/gg:gg-guide commands          # 命令速查
/gg:gg-guide chain             # 推荐工作流链路
/gg:gg-guide find: <关键词>    # 搜索 skill/agent/命令
/gg:gg-guide <功能名称>        # 查询特定功能
```

---

## 五、可观测性与健康检查

### `/gg:observability-ready` — 可观测性就绪门控

**适用场景：** 发布前、启动自治循环前、或首次在新机器安装后，快速确认 GG 的可观测面（task-trace、harness-audit、eval-harness、hook runtime）是否完整就绪。

```
/gg:observability-ready               # 文本格式报告（12 分满分）
/gg:observability-ready --format json # JSON 格式，适合自动化
/gg:observability-ready --root <path> # 检查指定 plugin root
```

输出 `ready: yes/no` + 分类得分 + 最多 3 个修复建议（`top_actions`）。

**收益：** 在 `ship` 或 `promote` 之前运行，可以确认 trace 覆盖和 eval 门控已到位。

---

### `/gg:doctor` — 插件安装健康检查

**适用场景：** 命令行为异常、升级 GG 后、或部分安装后，诊断 plugin root 中的缺失或损坏文件。

```
/gg:doctor                                    # 检查所有组件
/gg:doctor --component hooks-runtime          # 只检查 hooks-runtime
/gg:doctor --component commands-core          # 只检查 commands-core
/gg:doctor --format json                      # JSON 格式
```

按组件输出 `ok / warning / error` 状态。`error` 代表必需文件缺失；`warning` 代表可选模块（如 skills-observability）未安装。

退出码：有 warning 或 error 时为 1，全部 ok 时为 0。

---

## 六、工作流检查点

### `/gg:checkpoint` — 工作流检查点

**适用场景：** 在关键里程碑（功能核心完成、重构结束、提 PR 前）创建可回溯的快照；对比前后状态变化。

```
/gg:checkpoint create "feature-start"   # 创建检查点
/gg:checkpoint verify "feature-start"   # 与检查点对比当前状态
/gg:checkpoint list                     # 查看所有检查点
```

---

## 六、持续学习命令

这组命令构成一套完整的「经验积累与复用」体系，基于 `continuous-learning-v2`。

### `/gg:learn` — 提取可复用模式

**适用场景：** 解决了一个有价值的非平凡问题后，将解法固化为可复用的 skill。

带有质量门控（Save / Improve then Save / Absorb into 现有 skill / Drop），自动判断保存位置（Global 跨项目 vs Project 项目专属），写文件前需要你确认。

---

### `/gg:instinct-status` — 查看已学习模式

按领域分组展示当前项目和全局的 instinct，附带置信度进度条和观测次数。

---

### `/gg:evolve` — 演化 Instinct 为结构化组件

将聚类的 instinct 分析后，建议或生成对应的命令（Command）、技能（Skill）或 Agent。加 `--generate` 参数直接输出文件。

---

### `/gg:promote` — 晋升 Instinct 到全局范围

将在当前项目中积累的高置信度 instinct 晋升为全局 instinct，使其在所有项目中生效。

---

### `/gg:projects` — 查看项目 Instinct 统计

列出所有已知项目的 instinct 数量、观测事件数和最后活跃时间。

---

### `/gg:instinct-export` / `/gg:instinct-import` — 导入导出 Instinct

用于团队共享最佳实践：导出为 YAML 文件 → 分发给团队成员 → 通过 import 合并（按置信度决定是否覆盖）。

---

## 推荐工作流链路速查

| 场景 | 命令链路 |
|------|---------|
| 启动新功能 | `/gg:explore` → `/gg:feature` → `/gg:tdd` → `/gg:review` → `/gg:ship` |
| 快速规划后实现 | `/gg:plan` → `/gg:tdd` → `/gg:review` |
| 数据库功能 | `/gg:db` → `/gg:tdd` → `/gg:review` |
| 修复线上问题 | `/gg:diagnose` → `/gg:tdd`（补回归测试）→ `/gg:review` |
| PR 发布审查 | `/gg:review --pr <编号>` |
| 高风险变更发布 | `/gg:review --strict` → `/gg:ship --strict` |
| 代码腐化治理 | `/gg:refactor` → `/gg:review` |
| 记录本次收获 | `/gg:learn` → `/gg:checkpoint create <名称>` |
|| 确认可观测性就绪 | `/gg:observability-ready` → `/gg:ship` |
|| 诊断安装异常 | `/gg:doctor` → 按 top_actions 修复 → `/gg:doctor` |

---

## Agent 目录（可用于 `/gg:orchestrate`）

| Agent | 职责 |
|-------|------|
| `planner` | 需求重述、风险分解、步骤规划 |
| `architect` | 服务架构、系统设计、重构提案 |
| `code-architect` | 功能架构蓝图（文件树、接口、构建顺序） |
| `code-explorer` | 代码库分析、执行路径追踪、架构层映射 |
| `tdd-guide` | 编写测试 → 实现 → 80%+ 覆盖率 |
| `code-reviewer` | 通用代码审查 |
| `go-reviewer` | Go 专项审查（惯用法、并发、错误包装） |
| `python-reviewer` | Python 专项审查（类型提示、Pythonic 写法） |
| `code-simplifier` | 复杂度消减、可读性改善（行为保持） |
| `silent-failure-hunter` | 检测吞掉的错误、缺失传播、错误兜底值 |
| `security-reviewer` | 安全审计（OWASP、secret 泄漏、注入） |
| `performance-optimizer` | 性能分析、延迟优化、内存/goroutine 泄漏 |
| `refactor-cleaner` | 死代码、重复辅助函数、import 清理 |
| `pr-test-analyzer` | PR 测试覆盖质量与行为完整性评估 |
| `doc-updater` | 文档、codemap、README 更新 |
| `docs-lookup` | 第三方库文档查询（Context7，需按 `mcp-configs/mcp-servers.json` 手动启用） |
| `e2e-runner` | 端到端测试编排 |
| `database-reviewer` | PostgreSQL schema、迁移、查询性能 |
| `build-error-resolver` | 通用多语言构建错误修复 |
| `go-build-resolver` | Go 构建 / vet / golangci-lint 错误修复 |
| `pytorch-build-resolver` | CUDA / tensor / 训练运行时错误修复 |
| `harness-optimizer` | 本地 agent harness 配置优化 |
| `loop-operator` | 长期运行的自治循环干预 |
