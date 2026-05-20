# 大仓 Stage 3: Subsystem Batch Build

按确认后的子系统列表逐个（可并行）构建。每完成一个子系统立即持久化进度。

完成后进入 → `flows/large-stage4-validation.md`

---

## 每个子系统的执行序列

1. **读取 `_state.json`**：若该子系统 `status == "completed"` → **跳过**（`--resume` 核心逻辑）
2. **执行完整分析**：
   - L1 系统级文档（style-analyzer，参照小仓 Phase 3）
   - L2 模块级文档（并行，参照小仓 Phase 4）
   - API 契约提取（可与 L2 并行，参照小仓 Phase 5）
   - L3 核心链路文档（code-analyzer，**仅限**核心链路所在子系统，参照小仓 Phase 6）
3. **立即更新 `_state.json`**：

```json
{
  "subsystems": {
    "order-service": {
      "status": "completed",
      "commit_sha": "abc1234",
      "completed_at": "2026-05-20T10:45:00Z"
    }
  }
}
```

---

## `--resume` 断点恢复逻辑

```
读取 _state.json
跳过所有 status == "completed" 的子系统
从第一个 status == "pending" 或 "in_progress" 处开始
```

不重复消耗已完成子系统的 Token。

---

## 复用能力

| 能力 | 用途 |
|------|------|
| `iterative-retrieval` | 每个子系统的核心接口、依赖项、路由高精度检索，确保 subagent 拿到正确的代码上下文 |
| `plan-orchestrate` | 将子系统构建任务转化为并行 agent 链，管理并发吞吐量 |
