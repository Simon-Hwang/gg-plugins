# _plan.json 格式规范

## 顶层结构

`_plan.json` 是在 **Stage 1 (Preflight Discovery)** 中生成的预检计划文件，存储了整个仓库的逻辑子系统划分、Token 预算估计和成本 projection。它也是人类接受网关（Stage 2）进行人工确认、以及后续进行断点续传（`--resume`）和单系统独立构建（`--system <name>`）的核心依据。

```json
{
  "repo": "soulsvr",
  "generated_at": "2026-05-20T10:00:00Z",
  "subsystems": {
    "backend/gatesvr": {
      "name": "Gateway Server",
      "source_paths": [
        "backend/gatesvr/",
        "internal/pkg/gate/"
      ],
      "token_projection": 15000,
      "cost_projection_usd": 0.25,
      "api_expected": true,
      "l3_candidates": [
        "player-session"
      ]
    },
    "gamesystem": {
      "name": "Game Logic System",
      "source_paths": [
        "gamesystem/"
      ],
      "token_projection": 35000,
      "cost_projection_usd": 0.52,
      "api_expected": false,
      "l3_candidates": [
        "matchmaking-flow",
        "room-lifecycle",
        "team-formation"
      ]
    }
  },
  "cost_projection": {
    "total_subsystems": 10,
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

## 字段详细定义

### 1. 顶层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `repo` | string | 仓库名称 |
| `generated_at` | string | 计划生成时间 (ISO 8601 格式) |
| `subsystems` | object | 键值对，Key 为子系统物理路径/标识符，Value 为子系统配置对象 |
| `cost_projection` | object | 汇总后的总估计成本 |

---

### 2. subsystems[key] 子系统条目

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 子系统的展示名称 |
| `source_paths` | string[] | 该子系统包含的完整、可追溯的物理源码目录或文件列表 |
| `token_projection` | number | 该子系统构建 L1-L3 文档所需的 LLM 估计消耗 Token 数量 |
| `cost_projection_usd` | number | 按当前模型的 Token 价格折算后的美元估算价格 |
| `api_expected` | boolean | 是否期望该子系统能够提取出 API 契约（如提供 HTTP/gRPC） |
| `l3_candidates` | string[] | 推荐在 Phase 6 / Stage 3 中分析的该子系统下的核心业务链路 ID 列表 |

---

### 3. cost_projection 估算汇总

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `total_subsystems` | number | 是 | 逻辑切分出的子系统总数 |
| `total_source_tokens` | number | 是 | 源码静态估算 Token 量（所有候选源文件行数 × 4，仅供参考） |
| `estimated_llm_calls` | number | 是 | 预计 LLM 交互轮次（按子系统数量与调用深度估算） |
| `total_token_projection` | number | 是 | 构建 RAG 文档消耗的预估 LLM 总 Token（输入 + 输出之和） |
| `total_cost_projection_usd` | number | 是 | 预估总美元消耗（各模型分项之和）；Stage 2 确认网关以此为决策依据 |
| `per_model_estimate` | object | 推荐 | 各模型分项消耗，键为模型名 |

**`per_model_estimate[model]` 子字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `usage` | string | 该模型用途（如 `"L1/L2 批量生成"`） |
| `estimated_input_tokens` | number | 预估输入 Token 数 |
| `estimated_output_tokens` | number | 预估输出 Token 数 |
| `estimated_cost_usd` | number | 该模型分项美元估算 |

> `total_source_tokens`（源码静态量）与 `total_token_projection`（LLM 实际消耗）是两个不同概念，两者都必须记录。
>
> `per_model_estimate` 的键名为**构建时实际使用的模型标识符**，不固定。示例中的 `gemini-3.5-flash`、`claude-4.6-sonnet` 仅作格式参考，构建时按当前所用模型动态填入。
