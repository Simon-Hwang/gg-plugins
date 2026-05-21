# 大仓 Stage 5: Final Merge

**前置条件**：Stage 4 的 **4a–4f 已为 PASS**（4g Santa 已执行并输出报告；允许部分 `needs-human-review`）。

---

## 执行步骤

1. 生成全局 `_index.md`（导航索引；可无 frontmatter）
2. 在 `_manifest.json` 中更新最终的 Git commit anchor：
   ```bash
   last_synced_commit=$(git rev-parse HEAD)
   # fallback：若命令失败（非 git 仓库或无 commit），写入当前 ISO 8601 时间戳
   # 并在报告中警告："无法获取 git commit SHA，/gg:rag-sync 增量维护将退化为全量对比"
   ```
   并将 `last_verified_commit` 设定为此值。
3. 将 `_state.json` 中所有子系统标记为 `completed`（可选：归档或删除 `_state.json`）

**禁止** 在 Stage 4 未通过 4a–4f 自动化校验时进行合并或向用户报告构建成功。

## 完成报告

```
RAG Knowledge Base Built (Large Repo)
─────────────────────────────────────────
Repository:    <repo-name>
Commit anchor: <git-sha>
Subsystems:    N (all completed)
Documents:     N total (L0:1 L1:N L2:N L3:N API:N ADR:N)
Graph:         N nodes, N edges
Santa Audit:   N/N passed (N deferred to human review)
Output:        .rag/
─────────────────────────────────────────
Next: use /gg:rag-sync after code changes to keep the knowledge base current.
```
