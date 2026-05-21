# 大仓 Stage 1: Preflight Discovery

适用：子系统 > 5 个，或文件数 > 500，或无物理包管理隔离的单体巨石仓。

**产出**：`.rag/_plan.json`（结构化计划 + 成本投影）、`.rag/_discovery.md`（人类可读探测报告）、`.rag/_state.json`（断点追踪器初始化）。

完成后进入 → `flows/large-stage2-acceptance.md`

---

## 1a. 多维度边界识别

### 物理边界（Monorepo）

扫描各目录的独立包管理文件：`go.mod`、`package.json`、`pyproject.toml` 等。每个独立包管理文件 = 一个物理子系统边界。

### 逻辑边界（Monolith，无物理隔离）

1. 扫描顶级功能目录：`/services/`、`/domains/`、`/features/`、`/modules/`、`/apps/` 等
2. 扫描顶层路由注册器（Router/Controller）中的接口前缀（`/api/orders/`、`/api/payments/` 等），按前缀聚合推荐逻辑子系统
3. 识别 `internal/`、`pkg/` 等共享层 → 标记为公共依赖，**不作为独立子系统**

---

## 1b. Token 预算与成本投影

1. 静态估算所有业务源文件总 Token 量（平均行数 × 4 tokens/行；**排除** `vendor/`、`*_test.go`、`*.pb.go`、`node_modules/`）
2. 推算 LLM 实际消耗（`total_token_projection`）：通常为源码 Token 量的 30–50%（读取摘要 + 生成文档的输入输出之和）；L3 链路深度分析比例更高（约 60–80%）。在 `per_model_estimate` 中分模型列出。
3. `l3_candidates` 筛选标准（满足任一即纳入）：跨 ≥ 3 模块的调用链 / 含分布式锁或事务的关键路径 / 性能敏感热路径 / 已知故障链路（查 `git log --oneline | grep -iE 'hotfix|fix:|incident'`）。每个子系统候选 **0–4 条**；纯工具层（`internal/`、`pkg/`）或无满足条件链路的子系统允许为空数组，Stage 3 将跳过其 L3 分析。
4. 在 `_plan.json` 中输出成本预算预测表（字段定义见 `schemas/plan.md`）：

```json
{
  "cost_projection": {
    "total_subsystems": 8,
    "total_source_tokens": 280000,
    "estimated_llm_calls": 45,
    "total_token_projection": 120000,
    "total_cost_projection_usd": 1.80,
    "per_model_estimate": {
      "gemini-3.5-flash": {
        "usage": "L1/L2 批量生成",
        "estimated_input_tokens": 280000,
        "estimated_output_tokens": 45000,
        "estimated_cost_usd": 0.12
      },
      "claude-4.6-sonnet": {
        "usage": "L3 链路深度分析",
        "estimated_input_tokens": 80000,
        "estimated_output_tokens": 20000,
        "estimated_cost_usd": 1.68
      }
    }
  }
}
```

---

## 1c. 断点机制初始化

创建 `.rag/_state.json`，**子系统键名必须与 `_plan.json` 的 `subsystems` 键完全一致**（`--resume` 需跨文件匹配）：

```json
{
  "schema_version": "1",
  "build_started_at": "2026-05-20T10:00:00Z",
  "build_mode": "large",
  "subsystems": {
    "backend/shared-lib": { "status": "pending", "commit_sha": null, "planned_files": [] },
    "backend/gatesvr":    { "status": "pending", "commit_sha": null, "planned_files": [] },
    "gamesystem":         { "status": "pending", "commit_sha": null, "planned_files": [] }
  }
}
```

> 键名直接复制自 `_plan.json` 的 `subsystems` 键（如 `"backend/gatesvr"`、`"gamesystem"`），不得自行改写为横线格式（如 `"gate-svr"`）。

**`status` 取值说明：**

| 值 | 含义 | 何时写入 |
|----|------|---------|
| `pending` | 尚未开始 | 初始化时 |
| `in_progress` | 正在构建中（含预估文件列表） | Stage 3 开始构建该子系统前立即写入 |
| `completed` | 构建并自检通过 | Stage 3 子系统内自检通过后写入 |

`commit_sha`：**该子系统构建完成时的 HEAD commit SHA**（`git rev-parse HEAD`）；若命令失败，写入当前 ISO 时间戳并警告。

**扫描执行方式**：调用 `workspace-surface-audit` skill（`/gg` 内置能力），使用其目录树、技术栈和微服务入口静态扫描能力；若 skill 不可用，则直接用 Glob + Read 按以下顺序扫描：目录树结构 → 包管理文件 → 路由注册文件 → README/docs。
