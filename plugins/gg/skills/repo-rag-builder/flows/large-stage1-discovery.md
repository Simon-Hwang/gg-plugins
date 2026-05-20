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

1. 静态估算所有候选源文件总 Token 量（平均行数 × 4 tokens/行）
2. 根据子系统数量与调用深度，预测 LLM 交互轮次
3. 在 `_plan.json` 中输出成本预算预测表：

```json
{
  "cost_projection": {
    "total_source_tokens": 280000,
    "estimated_llm_calls": 45,
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
        "estimated_cost_usd": 1.80
      }
    },
    "total_estimated_cost_usd": 1.92
  }
}
```

---

## 1c. 断点机制初始化

创建 `.rag/_state.json`，初始化各子系统状态为 `pending`：

```json
{
  "build_started_at": "2026-05-20T10:00:00Z",
  "build_mode": "large",
  "subsystems": {
    "order-service":   { "status": "pending", "commit_sha": null },
    "payment-service": { "status": "pending", "commit_sha": null },
    "user-service":    { "status": "pending", "commit_sha": null }
  }
}
```

**复用能力**：`workspace-surface-audit` 负责目录树、技术栈和微服务入口的静态扫描。
