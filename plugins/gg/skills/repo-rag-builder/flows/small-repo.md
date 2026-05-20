# 小仓全自动流（8 Phases）

适用条件：子系统 ≤ 5 个 **且** 总源文件数 < 500。整个流程**不需要中间交互**，一次性跑完。

---

## Phase 1: 仓库探测与分类 (Discovery)

1. **结构扫描**：Glob + 文件读取，扫描目录树、技术栈、入口文件、配置文件。
2. **子系统识别**：以独立包管理文件（`package.json`、`pyproject.toml`、`go.mod`）、独立构建配置、明显目录隔离为边界。
3. **API 端点发现**：扫描路由注册代码（Go `mux.HandleFunc`、Gin/Echo 路由、gRPC proto 文件等），建立端点清单。
4. **模块路线决策**：
   - **style-analyzer**（L1/L2）：interface/abstract/base/config/schema 密集 → 提取"规则"和"怎么写才对"
   - **code-analyzer**（L3）：handler/service/flow/pipeline/orchestrator 密集 → 提取"具体怎么跑"和"边界在哪"
   - 不明显时默认 style 路线
5. **知识图谱初始化**：创建 repo/system 节点，后续 Phase 逐步补充边。

## Phase 2: L0 仓库全景

**产出**：`L0-overview.md`

- 项目定位（一句话）
- 技术栈总览
- 子系统拓扑图（Mermaid，标出依赖方向）
- 目录结构速览（带职责注解）
- 快速导航（指向 L1 各文档的链接）

## Phase 3: L1 系统级文档（style-analyzer 路线）

对每个子系统并行执行（用 Task 工具）：

1. **探索骨架**：核心接口、基类、路由注册、依赖注入、配置加载
2. **提取规则**：分层职责边界 / 核心设计哲学（附代码片段）/ 标准开发工作流（保姆级步骤）/ 强制红线 DOs/DON'Ts / 公共工具备忘录
3. **写入** `L1-systems/<system>.md`
4. 图谱：补充 module/class 节点，添加 `contains` / `depends_on` 边

## Phase 4: L2 模块级文档（并行）

对每个核心模块：
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

筛选 3-8 条最核心业务流程（最耗时，优先核心链路）：

1. **全链路追踪**：从入口到落盘的完整调用链（Mermaid 时序图）
2. **量化指标**：硬编码参数（超时、重试、队列大小、并发数）
3. **可靠性分析**：并发控制、异常恢复、数据一致性
4. **边界与风险**：极端场景下的系统行为
5. 图谱：补充 `function` 节点，添加 `calls` 边

## Phase 7: ADR 架构决策记录（两级检索体系）

**来源**：`docs/`、`trd/`、代码注释（TODO/HACK/FIXME/NOTE）、Git commit message 重大变更、README 设计段落。代码中存在但无显式文档的决策，推断后标注 `[推断]`。

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

## 收尾

```bash
git rev-parse HEAD  # 写入 last_synced_commit
```

生成 `_index.md` + `_manifest.json`（格式见 `schemas/manifest.md`）。告知用户产出位置，提示后续用 `/gg:rag-sync` 增量维护。
