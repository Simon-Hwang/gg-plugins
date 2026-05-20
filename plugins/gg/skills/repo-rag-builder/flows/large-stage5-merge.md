# 大仓 Stage 5: Final Merge

所有子系统构建完成、Stage 4 校验全部通过后执行。

---

## 执行步骤

1. 生成全局 `_index.md`（包含所有子系统文档的导航索引）
2. 合并各子系统的局部图谱，生成最终全局 `_graph.json`
3. 更新 `_manifest.json`：
   ```bash
   last_synced_commit=$(git rev-parse HEAD)
   ```
   同步更新 `graph_stats.total_nodes` / `total_edges`
4. 将 `_state.json` 中所有子系统标记为 `completed`（可选：归档或删除 `_state.json`）

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
