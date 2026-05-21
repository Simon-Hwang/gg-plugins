# 小仓全自动流（8 Phases）

适用条件：子系统 ≤ 5 个 **且** 总源文件数 < 500。整个流程**不需要中间交互**，一次性跑完。

**硬约束**：生成 L0–ADR 任一 Markdown 前 Read `flows/document-format-requirements.md`；每份文档必须有 YAML frontmatter + 对应 `documents[]` 条目。

---

## Phase 1: 仓库探测与分类 (Discovery)

1. **结构扫描**：Glob + 文件读取，扫描目录树、技术栈、入口文件、配置文件。
2. **子系统识别**：以独立包管理文件（`package.json`、`pyproject.toml`、`go.mod`）、独立构建配置、明显目录隔离为边界。
   - 排除工具包：包管理文件所在目录代码行数 < 200 的视为工具包，不计入子系统数。
   - 统计业务子系统数量 **N**。
3. **源码文件计数**（仅计业务文件）：
   - Glob `**/*.{go,py,ts,js,java,rs}`
   - **排除**：`**/vendor/**`、`**/node_modules/**`、`**/*_test.go`、`**/*.pb.go`、`**/*.gen.go`、`**/__pycache__/**`
   - 统计业务源码文件总数 **M**。
4. **⛔ 大仓门控（硬停止）**：
   - 若 **N > 5 或 M ≥ 500**，**立即停止**，不继续后续 Phase，输出：
     > "该仓库规模超出小仓阈值（业务子系统约 N 个 / 业务源文件约 M 个）。请重新使用 `--large` 参数启动分阶段构建，或先运行 `--plan-only` 做零成本预检。"
   - 小仓确认（N ≤ 5 且 M < 500）后，继续以下步骤。
5. **API 端点发现**：扫描路由注册代码（Go `mux.HandleFunc`、Gin/Echo 路由、gRPC proto 文件等），建立端点清单。
6. **模块路线决策**：
   - **style-analyzer**（L1/L2）：interface/abstract/base/config/schema 密集 → 提取"规则"和"怎么写才对"
   - **code-analyzer**（L3）：handler/service/flow/pipeline/orchestrator 密集 → 提取"具体怎么跑"和"边界在哪"
   - 不明显时默认 style 路线
7. **轻量探测摘要**（展示后**直接继续**构建，无法暂停等待）：

   ```
   📊 仓库探测结果（如边界有误，请立即中断对话并重新描述）
   ─────────────────────────────────────────
   业务子系统 (N=2):
     1. backend/     → Go, ~180 业务文件
     2. scripts/     → Python, ~40 业务文件
   识别到的 API 端点: 12 个
   L3 候选链路: CreateOrder, UserLogin
   ─────────────────────────────────────────
   ```

   > LLM Agent 无"暂停等待"机制，展示摘要后将**立即**进入 Phase 2。若边界识别有误，用户需在看到摘要后立即中断对话，重新描述正确边界后重新调用。

8. **知识图谱初始化**：创建 repo/system 节点，后续 Phase 逐步补充边。

## Phase 2: L0 仓库全景

**产出**：`L0-overview.md`（**含 YAML frontmatter**，`type: overview`，`level: L0`）

- 项目定位（一句话）
- 技术栈总览
- 子系统拓扑图（Mermaid，标出依赖方向）
- 目录结构速览（带职责注解）
- 快速导航（指向 L1 各文档的链接）

## Phase 3–5: 图谱写入策略（防并行竞争）

Phase 3/4/5 均有并行执行，**`_graph.json` 是共享状态，禁止各 subagent 直接写入文件**：

- 每个 subagent（L1/L2/API）在**内存/草稿**中积累图谱变更（节点 + 边列表）
- **Phase 3、4、5 全部完成后**，由主 agent 做**一次**统一串行合并（`nodes` 去重 by `id`，`edges` 去重 by `source+target+type`），写入 `_graph.json` 中间状态
- Phase 8 在此基础上做最终校验、补充孤立边、写出最终文件

## `_manifest.json` 写入策略（小仓）

小仓的 `_manifest.json` 在**收尾步骤统一写出**，构建期间各 Phase 只维护**内存草稿**：

- Phase 3/4/5/6/7 每写完一篇文档，在内存草稿中追加对应 `documents[]` 条目（含 `id`、`path`、`source_paths`、`graph_node_id` 等）
- **不得**在 Phase 执行中途写出 `_manifest.json` 文件（写出时机仅在收尾）

---

## Phase 3: L1 系统级文档（style-analyzer 路线）

对每个子系统并行执行（用 Task 工具）：

1. **探索骨架**：核心接口、基类、路由注册、依赖注入、配置加载
2. **提取规则**：分层职责边界 / 核心设计哲学（附代码片段）/ 标准开发工作流（保姆级步骤）/ 强制红线 DOs/DON'Ts / 公共工具备忘录
3. **写入** `L1-systems/<system>.md`（frontmatter 必填，见 `document-format-requirements.md`）
4. 在**内存草稿**中追加对应 `documents[]` 条目（含非空 `source_paths`）；不写出 `_manifest.json` 文件
5. 图谱草稿：补充 module/class 节点，添加 `contains` / `depends_on` 边（**不写 `_graph.json` 文件**）

## Phase 4: L2 模块级文档（并行）

**L2 粒度规则**：每个 L2 文档对应一个可独立理解/测试的功能包或功能包组合。

- 单个子系统 L2 文档数**上限 12 个**；超出时按功能相似性聚合
- 判断标准：该包是否有独立的对外接口或单独的职责边界？有 → 独立 L2；无 → 合并到最相近的 L2
- 少于 3 个文件的纯工具包（`utils/`、`helpers/`）可合并到调用方的 L2 文档中

对每个核心模块（**每篇带 frontmatter**，写完后在**内存草稿**中追加 `documents[]` 条目）：
1. 职责概述 + 在子系统中的角色
2. 对外接口（暴露的 API/函数/类）
3. 内部结构（关键文件分工）
4. 扩展点（加功能的切入点）
5. 依赖关系（上游、下游）
6. 代表性代码片段

## Phase 5: API 契约提取（可与 Phase 4 并行）

1. **路由扫描**：遍历 Phase 1 发现的所有路由注册点，提取 Method / Path / 请求参数 / 响应结构 / Auth / 中间件链
2. **输出格式**：优先 OpenAPI 3.0 JSON（`api-contracts/<system>.openapi.json`）；无显式类型标注时回退 Markdown 契约表
3. **gRPC/内部 RPC**：proto 文件或内部 RPC 定义一并提取
4. 图谱：补充 `api` 节点，添加 `handles` 边

## Phase 6: L3 核心链路文档（code-analyzer 路线）

筛选 3-8 条最核心业务流程（最耗时，优先核心链路）。**L3 候选筛选标准**（满足任一即纳入）：

- 跨越 ≥ 3 个模块的调用链（横向影响面广）
- 含分布式锁、事务、幂等控制的关键路径（正确性风险高）
- 性能敏感的热路径（含超时/重试/队列/并发参数）
- 已知出过线上故障的链路（历史风险高；通过 `git log --oneline --all | grep -iE 'hotfix|fix:|incident|rollback'` 追溯涉及的调用入口）

不满足以上任一条件的业务流程，生成 L2 文档即可，无需强行凑成 L3。

1. **全链路追踪**：从入口到落盘的完整调用链（Mermaid 时序图）
2. **量化指标**：硬编码参数（超时、重试、队列大小、并发数）
3. **可靠性分析**：并发控制、异常恢复、数据一致性
4. **边界与风险**：极端场景下的系统行为
5. 图谱：补充 `function` 节点，添加 `calls` 边

## Phase 7: ADR 架构决策记录（两级检索体系）

**来源**：`docs/`、`trd/`、README 设计段落、Git commit message 重大变更、代码注释。

**注释筛选标准**：`TODO/HACK/FIXME/NOTE` 通常是技术债标记，**不算** ADR 来源。只有注释内容涉及以下之一才算：
- 系统边界或接口选型（"为什么用 gRPC 而非 REST"）
- 一致性/幂等性权衡（"这里选择最终一致是因为…"）
- 重大约束或不可变设计（"不能改为异步，因为…"）

代码中存在但无显式文档的决策，推断后标注 `[推断]`。

**第一级 `ADR-Summary.md`**（< 2000 tokens）：

```markdown
| ID | 标题 | 状态 | 关键字 | 一句话摘要 | 全文路径 |
|----|------|------|--------|-----------|----------|
| 001 | ... | Accepted | keyword1, keyword2 | 摘要 | ADR/001-xxx.md |
```

**第二级**：每条 ADR 标准格式存放于 `ADR/NNN-<decision>.md`，包含：上下文 / 决策 / 理由 / 后果 / 关联代码。

图谱：补充 `adr` 节点，添加 `decided_by` 边。

## Phase 8: GraphRAG 校验与补全

1. 检查孤立节点（无任何边连接）
2. 补充遗漏的 `imports` / `extends` 边
3. 生成最终 `_graph.json`（格式见 `schemas/graph.md`）

> **精简原则**：只纳入「改它需要知道影响了谁」的关键节点，不追求穷举。模块内私有辅助函数不进图谱。

## 优雅降级与剪枝 (Graceful Degradation)

RAG 架构不应为了追求格式完整而对小型或简单仓库强制堆砌多余文件。支持以下降级策略：
- **无 API 契约**：若项目中没有暴露公网 HTTP API 或定义 gRPC/protobuf，可跳过 Phase 5，`api-contracts/` 目录为空不应判错。
- **无显式 ADR 决策**：若项目中未扫描出重大设计决策或没有架构记录，允许仅生成 `ADR/ADR-Summary.md`（内容标记为“未发现明确技术决策”），而不需要强行推断出虚假的 NNN-*.md 决策文件。
- **简易核心链路**：若项目业务逻辑非常直白（如增删改查工具库），无需强行凑满 3-8 条 L3 链路，生成 1-2 条甚至在全景图解释清楚后跳过 L3 亦为合格。

## 收尾

```bash
git rev-parse HEAD  # 写入 last_synced_commit
# fallback：若命令失败（非 git 仓库或无 commit），写入当前 ISO 8601 时间戳并警告：
# "无法获取 git commit SHA，last_synced_commit 将使用时间戳。增量维护（/gg:rag-sync）将退化为全量对比。"
```

1. 生成 `_index.md`（导航索引，可无 frontmatter）
2. 写出 **标准** `_manifest.json`：`documents[]` 数组覆盖磁盘上每一份 L0–ADR/API(md) 文档；`total_documents` 与数组长度一致（格式见 `schemas/manifest.md`）
3. 运行 `flows/large-stage4-validation.md` 的 **4a–4f**（小仓也须通过 manifest/frontmatter/schema 门禁；再执行 4g Santa）
4. 告知用户产出位置，提示后续用 `/gg:rag-sync` 增量维护

**禁止** 仅用按层级分组的路径对象替代 `documents[]`；**禁止** 在未通过 Stage 4 前声称「构建完成」。
