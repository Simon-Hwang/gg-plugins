# 大仓 Stage 3: Subsystem Batch Build

按确认后的子系统列表构建。**共享层（`internal/`、`pkg/`、`shared-lib` 等）必须最先构建**，业务服务子系统依赖共享层文档后再并行。

**开始前 Read** `flows/document-format-requirements.md`。

完成后进入 → `flows/large-stage4-validation.md`

---

## 构建顺序（拓扑排序）

```
第一批 [串行]：共享层子系统（internal/, pkg/, shared-lib 等标记为公共依赖的目录）
第二批 [可并行]：业务服务子系统（所有 dependencies 中的共享层均已构建完成）
```

业务子系统的 L2 `dependencies` 字段若需引用共享层文档 id，共享层必须已在 `_manifest.json` 草稿中注册。

---

## `_graph.json` 写入策略（防并行竞争）

`_graph.json` 是共享状态，**禁止多个子系统 agent 同时写入**，否则会产生竞争条件：

- **每个子系统在内存/草稿中积累图谱变更**（节点列表 + 边列表）
- **子系统构建完成后**，由主 agent 串行合并进 `_graph.json`（`nodes` 去重 by `id`，`edges` 去重 by `source+target+type`）
- Stage 4 入口前做一次最终合并写出

---

## L2 粒度规则

每个 L2 文档对应一个可独立理解/测试的功能包或功能包组合：

- 单个子系统 L2 文档数**上限 12 个**；超出时按功能相似性聚合
- 少于 3 个源文件的纯工具包（`utils/`、`helpers/`）合并到调用方 L2 文档中
- 判断标准：该包是否有独立的对外接口或单独的职责边界？有 → 独立 L2；无 → 合并

---

## 每个子系统的执行序列

1. **读取 `_state.json`**：
   - 若该子系统 `status == "completed"` → **跳过**
   - 否则：
     a. 先推算本子系统将产出的文件路径列表（L1/L2/L3/API 文件名可从 _plan.json 的 l3_candidates 和目录结构推断）
     b. **将文件列表和 `in_progress` 状态一起写入 `_state.json`**（用于 --resume 精确清理）

```json
{
  "subsystems": {
    "order-service": {
      "status": "in_progress",
      "planned_files": [
        "L1-systems/order-service.md",
        "L2-modules/order-service-core.md",
        "L2-modules/order-service-domain.md",
        "L3-chains/order-create-chain.md",
        "api-contracts/order-service.openapi.json"
      ]
    }
  }
}
```

2. **执行完整分析**（每份 Markdown **必须先写 YAML frontmatter**，再写正文）：
   - L1 系统级文档（style-analyzer，参照小仓 Phase 3）
   - L2 模块级文档（并行，遵循上方粒度规则）
   - API 契约提取（可与 L2 并行，参照小仓 Phase 5）
   - L3 核心链路文档（code-analyzer，**仅限**核心链路所在子系统，参照小仓 Phase 6）
   - **每写完一篇**：追加 `documents[]` 草稿条目；在**本子系统图谱草稿**中追加节点与边（不写 `_graph.json` 文件）

3. **子系统内自检**（未通过不得标 completed）：
   - 该子系统产出的每篇 `.md` 以 `---` 开头且含必填 frontmatter 字段
   - 每篇在 `documents[]` 草稿中有对应条目且 `source_paths` 非空

4. **立即更新 `_state.json`**（自检通过后），并**用实际产出的文件列表覆盖 `planned_files`**（解决预测不完整的问题）：

```json
{
  "subsystems": {
    "order-service": {
      "status": "completed",
      "planned_files": [
        "L1-systems/order-service.md",
        "L2-modules/order-service-core.md",
        "L2-modules/order-service-domain.md",
        "L2-modules/order-service-events.md",
        "L3-chains/order-create-chain.md",
        "api-contracts/order-service.openapi.json"
      ],
      "commit_sha": "abc1234",
      "completed_at": "2026-05-20T10:45:00Z"
    }
  }
}
```

> `planned_files` 在 `in_progress` 阶段是**预测列表**（可能不完整）；在 `completed` 后被**实际产出列表**覆盖。`--resume` 的清理逻辑优先使用 `planned_files`，因此 `completed` 子系统的 `planned_files` 始终准确。

> `commit_sha` 含义：**该子系统构建完成时的 HEAD commit SHA**（`git rev-parse HEAD`）。与 `_manifest.json` 的 `last_synced_commit`（全局锚点，在 Stage 5 收尾时写入）不同——多子系统分批构建时，各子系统的 `commit_sha` 可能不同，这是正常的。

---

## `--resume` 断点恢复逻辑

```
读取 _state.json
跳过所有 status == "completed" 的子系统
对 status == "in_progress" 的子系统：
  → 读取 planned_files 列表，逐一删除已生成的文件
  → 若 planned_files 不存在（旧版兼容），则删除路径前缀匹配子系统名的所有 .md 文件
  → 从头重建（幂等）
对 status == "pending" 的子系统：正常构建
```

`in_progress` 子系统从头重建，不留残留文档。已完成子系统的 Token 不重复消耗。

---

## 代码上下文检索策略

每个子系统构建前，调用 `iterative-retrieval` skill（`/gg` 内置能力），使用其 progressive retrieval 模式确保 subagent 拿到正确代码上下文；若 skill 不可用，按以下顺序手动分批读取。优先读取顺序：

1. 路由注册文件（`router.go` / `routes.py` / `*.proto`）— 建立 API 端点清单
2. 主入口和 DI 配置（`main.go` / `app.py` / `wire.go`）— 理解模块组装方式
3. 核心 interface/abstract/base 文件 — L1 style-analyzer 的主要输入
4. 被最多文件 import 的 3–5 个包 — 依赖关系骨架

避免一次性读入整个子系统全部源文件；按需分批读取，每批不超过 5 个文件。

## 并行构建编排

多子系统并行时，调用 `plan-orchestrate` skill（`/gg` 内置能力），使用其 agent 链编排能力管理并发吞吐量；若 skill 不可用，手动按拓扑顺序串行构建（共享层 → 业务服务）。
