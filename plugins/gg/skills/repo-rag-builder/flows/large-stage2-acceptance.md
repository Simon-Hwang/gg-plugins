# 大仓 Stage 2: Acceptance Gate

**必须在用户明确确认后，才允许进入 Stage 3。** 此阶段是防止盲目消耗 Token 的最后防线，不允许跳过。

完成后进入 → `flows/large-stage3-build.md`

---

## 2a. 边界歧义检测（council 触发条件）

在展示确认计划前，计算边界重叠度：

```
For each candidate subsystem boundary:
  overlap_ratio = files that could belong to multiple subsystems / total files in boundary
  Flag as AMBIGUOUS if:
    - overlap_ratio > 30% for any boundary pair, OR
    - any directory satisfies classification criteria of ≥ 2 different subsystems

If AMBIGUOUS_COUNT >= 2:
  → 触发 council（见下方）
Else:
  → 直接进入 2b
```

### council 触发流程

以 3 个并行 subagent 分别扮演 **Skeptic / Pragmatist / Critic** 角色，输入为：
- 模糊边界清单及证据（目录列表、路由前缀、文件共用关系）
- 仓库技术栈和团队规模（从 README / git log 估算）
- 决策问题：「以下 N 个目录应如何划归子系统边界，以最大化后续 RAG 检索精度？」

三个 subagent 完成后，**由主 agent 读取三份输出并综合**：取共识部分作为推荐方案，将分歧点标注在确认页面中供用户决策。主 agent 负责最终整合，不再启动第四个 subagent。整合结果纳入 2b 确认页面。

---

## 2b. 构建计划确认

向用户展示以下确认页面，**等待明确的 y 确认**：

```
📋 构建计划确认
─────────────────────────────────────────────
发现的子系统（逻辑边界）:
  1. order-service    → server/order/, server/domain/order/
  2. payment-service  → server/payment/
  3. user-service     → server/user/, server/auth/
  [公共层] shared-lib → internal/, pkg/

[如触发过 council，此处追加]
⚖️  边界决策摘要:
  Skeptic:    auth 模块独立性存疑，建议归入 user-service
  Pragmatist: 独立更利于后续局部重建
  Critic:     共享 JWT 工具会导致 source_paths 重叠
  → 推荐方案: auth 保持独立，shared JWT 归入 shared-lib

链路分析候选 (L3):
  - 订单创建链路 (CreateOrder → PaymentGateway → Fulfillment)
  - 用户认证链路 (Login → JWT → Session)

成本预算预测:
  总源码 Token: ~280,000
  预估费用:     ~$1.92 (gemini-3.5-flash L1/L2 + claude-4.6-sonnet L3)

确认后将开始批量构建。是否继续？[y/N]
─────────────────────────────────────────────
```

**如果用户调整了边界**：更新 `_plan.json` 并重新展示。
**如果用户取消**：终止，提示：
> "已保留 `.rag/_plan.json`（含子系统边界和成本投影）。如需调整边界，可直接编辑 `_plan.json` 的 `subsystems` 字段，然后重新运行 `--large`（若 `_plan.json` 已存在将跳过 Stage 1 直接进入 Stage 2 确认）。"

> **说明**：Stage 2 取消时所有子系统均为 `pending`，此时 `--resume` 与重新运行 `--large` 效果完全相同。真正有价值的是保留 `_plan.json` 以避免重复执行 Stage 1 探测（成本为零但耗时）。
