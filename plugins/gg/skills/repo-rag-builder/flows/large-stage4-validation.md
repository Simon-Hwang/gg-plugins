# 大仓 Stage 4: RAG Validation & Integrity

两层校验：**4a-4d 结构完整性**（静态确定性检查）→ 全部通过后 → **4e 内容准确性**（santa-method 抽样审计）。

此阶段也是 `--validate` 参数的独立入口（直接从 4a 开始执行）。

完成后进入 → `flows/large-stage5-merge.md`

---

## 4a. 源码存在性校验

```
For each document in _manifest.json:
  For each path in document.source_paths:
    Assert: path exists in repository filesystem
  If missing → Log: "Dead source_path: <path> in <doc-id>"
```

## 4b. API 契约可追溯性校验

```
For each API contract in api-contracts/:
  For each endpoint:
    Assert: endpoint.handler_path exists in repository
    Assert: handler_path contains a recognizable route registration
  If not found → Log: "Untraceable API: <method> <path>"
```

## 4c. GraphRAG 图谱双向完整性校验

```
node_ids = Set(node.id for node in _graph.json.nodes)

For each edge in edges:
  Assert: edge.source in node_ids   # 无孤立源头
  Assert: edge.target in node_ids   # 无指向虚无的目标
  If fails → Log: "Orphaned edge: <source> → <target> (type: <type>)"

For each node where node.doc_ref is not null:
  Assert: ".rag/" + node.doc_ref exists on disk
  If not → Log: "Dead doc_ref: <node.id> → .rag/<node.doc_ref>"
```

## 4d. 结构校验失败处理

- 汇总报告，按类型分组
- **自动降级修复**：
  - 删除含孤立 source 或 target 的边（图谱剪枝）
  - 将 `doc_ref` 指向不存在文件的节点的 `doc_ref` 置为 `null`
- 修复后重新运行 4a-4c，全部通过后进入 4e

---

## 4e. 内容准确性抽样审计（santa-method）

4a-4d 只能发现死链，无法发现「内容写错了」（幻觉式错误：不存在的函数调用、错误字段类型）。`santa-method` 解决这层。

### 采样策略

| 文档类型 | 采样比例 | 理由 |
|----------|----------|------|
| L2-modules | 随机 15% | 条数多，15% 覆盖 >90% 系统性问题 |
| L3-chains | **全量** | 条数少（3-8 篇），链路错误影响最高 |
| api-contracts | **全量** | AI 编码直接依赖，幻觉代价最高 |
| L1-systems | 跳过 | 规范内容，无法被代码 ground-truth 强校验 |
| ADR | 跳过 | 推断性内容，已由 `[推断]` 标注 |

### Reviewer Rubric

```text
你是一个独立 RAG 文档审计员。找出文档与实际代码之间的差异，不是给文档打分。

## 审计对象
{doc_content}

## 对应源码（从 source_paths 提取的关键片段）
{source_code_snippets}

## 评审标准（逐项 PASS / FAIL）
1. 代码路径准确性：文件路径、函数名、类名是否在源码中真实存在？
2. 调用关系准确性（L3 专项）：时序图/调用链是否与真实代码顺序一致？
3. 参数/字段准确性（API 专项）：字段名、类型、必填性是否与真实结构体一致？
4. 无幻觉实体：是否引用了不存在于代码库中的模块名、接口名、配置项？
5. 内部一致性：各章节描述是否自相矛盾？

返回 JSON:
{"verdict":"PASS"|"FAIL","checks":[{"criterion":"...","result":"PASS|FAIL","detail":"..."}],"critical_issues":["..."]}
```

### 执行流程

```
1. 按采样策略选出待审计文档列表
2. 对每份文档：
   a. 读取文档内容
   b. 从 source_paths 提取关键代码片段（函数签名、路由定义、结构体字段）
   c. 并行启动 Reviewer B 和 Reviewer C（互不共享上下文）
   d. 收集两份 JSON verdict
   e. B 和 C 均 PASS → review_status = "reviewed"
   f. 任一 FAIL → 收集 critical_issues，重新生成该文档，重跑双审
   g. 最多 3 轮；3 轮未收敛 → review_status = "needs-human-review"，继续不阻塞
3. 输出审计报告
```

### 抽样审计报告格式

```
Santa Audit Report
─────────────────────────────────────────
Sampled:  L2×3 / L3×5 / API×2  (total 10 docs)
Passed:   8 / 10
Fixed:    1 / 10  (1 轮收敛)
Deferred: 1 / 10  (needs-human-review: L3-payment-flow.md)

Critical Issues Found:
  ❌ L3-order-flow.md: CreateOrder 链路描述了不存在的 inventory.Reserve() 调用
  ⚠️  api-contracts/order.openapi.json: OrderItem.quantity 类型应为 int32，文档写为 string
─────────────────────────────────────────
```
