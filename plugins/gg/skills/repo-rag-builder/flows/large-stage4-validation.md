# 大仓 Stage 4: RAG Validation & Integrity

**三层校验与硬性工程门栏**（前两层为**硬失败**，脚本未通过或有残留错误不得进入 4g，不得报告「全通过」）：

1. **4a–4f 结构与 schema 自动化工程校验**（使用专用脚本硬门栏，支持一键自愈补全）
2. **4g 内容准确性**（santa-method 抽样审计）

此阶段也是 `--validate` 参数 of 的独立入口（必须跑完 **自动化工程校验** 与 **4g 审计** 才能给出最终结论）。

完成后进入 → `flows/large-stage5-merge.md`（仅当工程校验完全通过，且 4g 审计完成并输出 Santa 报告）

---

## 🛠️ 4a-4f 硬性工程校验门栏 (Auto-Validation & Healing)

为了防止模型疲劳导致 YAML frontmatter 和注册表元数据在生成时缩水、格式漂移或出现路径死链，**必须强制首先执行物理工程脚本进行确定性校验**：

### 1. 结构与 Schema 硬校验
在控制台执行：
```bash
node plugins/gg/scripts/validate-rag.js <project-path>
```

### 2. 元数据一键补全与智能自愈 (Auto-healing Hydration)
如果上述校验失败或存在字段缺失，可利用启发式语义关联和正文分词算法进行一键自动补全和键名归一化（无需低效重新生成）：
```bash
node plugins/gg/scripts/validate-rag.js <project-path> --fix
```

### 🎯 准入网关红线 (Hard Gate)
* **硬性失败（FAIL）**：脚本必须返回 `exit code 0`。若脚本在修复模式后仍有残留错误或路径不匹配（例如 `Exit Code 1`），视为 **FAIL**。
* **严禁越过**：任何情况下，**禁止**越过脚本校验而直接进行 4g 语义审计，也**禁止**在脚本失败时声称「符合预期/全通过」。

---

## 4a. `_manifest.json` 规范合规（硬失败）

Read `schemas/manifest.md` 与 `flows/document-format-requirements.md`。

```
Assert: _manifest.json 存在
Assert: 顶层含 repo, generated_at, last_synced_commit, total_documents, hierarchy, documents[], graph_stats
Assert: documents 是数组（非仅按 L0/L1/... 分组的路径对象）
For each entry in documents[]:
  Assert: 含 id, path, level, title, summary, tags, domain, intent, symbols,
          graph_node_id, token_estimate, source_paths (非空数组), confidence, review_status,
          generated_from_commit, last_verified_commit
  Assert: ".rag/" + path 文件存在于磁盘
  Assert: domain 是非空短数组（建议 2-6 个）
  Assert: intent 是非空短数组（建议 2-5 条）
  Assert: symbols 是数组
Assert: total_documents == len(documents[])
Assert: hierarchy 中列出的每个 id 在 documents[] 中存在
If any fail → FAIL: "Manifest schema: <detail>"
```

**API 契约判据**：
- 若 `_plan.json` 存在：任意子系统 `api_expected: true` → `api-contracts/` 必须非空，否则 **FAIL: missing api-contracts**
- 若无 `_plan.json`（小仓）：Phase 1 发现了 HTTP/gRPC 端点但 `api-contracts/` 为空 → **FAIL: missing api-contracts**
- 若计划/探测均未发现端点，`api-contracts/` 为空属正常降级，不判 FAIL

---

## 4b. Markdown YAML frontmatter（硬失败）

```
For each file in .rag/**/*.md:
  Skip: _index.md, _discovery.md
  Assert: 文件以 "---" 开头的 YAML frontmatter 块
  Assert: 含 id, level, type, title, summary, tags, domain, intent, source_paths,
          symbols, graph_node_id, token_estimate, confidence, updated
  Assert: level 与路径前缀一致（L2-modules/ → L2）
  Assert: graph_node_id 存在于 _graph.json.nodes[].id
  Assert: id 在 _manifest.json documents[].id 中存在，且 path 指向当前文件
  Assert: frontmatter.source_paths 非空，且是 documents[].source_paths 的子集
  Assert: domain 是非空短数组（建议 2-6 个）
  Assert: intent 是非空短数组（建议 2-5 条）
  Assert: symbols 是数组，且不包含大段说明文字
  Assert: summary 是短摘要，不得替代正文
  If L1/L2/L3/API(md): Assert 含 analyzer
  If L3: Assert 含 parent（父级 L1 文档 id）
  If L3: Assert 含 dependencies（非空数组，至少含 L0-overview）
If any fail → FAIL: "Missing/invalid frontmatter: <path>"
```

---

## 4c. 源码存在性校验

```
For each document in _manifest.json documents[]:
  For each path in document.source_paths:
    Assert: path exists in repository filesystem
  If missing → FAIL: "Dead source_path: <path> in <doc-id>"
```

---

## 4d. API 契约可追溯性校验

```
If api-contracts/ 目录存在:
  For each API contract file:
    For each endpoint (OpenAPI paths or md 表格行):
      Assert: handler_path exists in repository
      Assert: handler_path contains recognizable route/proto registration
  If not found → FAIL: "Untraceable API: <method> <path>"
Else:
  // 是否需要 API 契约已由 4a 判定，此处无需重复
```

---

## 4e. GraphRAG 图谱规范（硬失败）

Read `schemas/graph.md`。

```
node_ids = Set(node.id for node in _graph.json.nodes)

For each edge in edges:
  Assert: 使用 source 与 target 字段（禁止仅用 from/to）
  Assert: edge.source in node_ids
  Assert: edge.target in node_ids
  If fails → FAIL: "Graph edge: <source> → <target>"

For each node where node.doc_ref is not null:
  Assert: ".rag/" + node.doc_ref exists on disk
  If not → FAIL: "Dead doc_ref: <node.id>"

Assert: graph_stats 与 nodes/edges 实际计数一致
```

---

## 4f. 可自动修复项与重跑

仅以下项允许自动修复后**重跑 4a–4e**（不跳过 4b）：

- 删除含孤立 source/target 的边（图谱剪枝）
- 将 `doc_ref` 指向不存在文件的节点的 `doc_ref` 置为 `null`
- 将 `from`/`to` 边迁移为 `source`/`target`

**禁止** 自动删除 frontmatter 要求或降级 manifest 为标准 schema 以外的形状。

修复后重新运行 4a–4e；全部通过后进入 4g。

---

## 4g. 内容准确性抽样审计（santa-method）

4a–4f 只能发现死链与格式问题，无法发现「内容写错了」。必须调用 `santa-method` skill（`/gg` 内置能力）并按下列策略执行；若 skill 不可用，按本节 Reviewer B/C prompt 直接执行双视角审计。

### 采样策略

| 文档类型 | 采样比例 | 理由 |
|----------|----------|------|
| L2-modules | 随机 `max(15%, 5篇)` | 防止大仓（60+ 篇）因 15% 采样绝对数量不足而漏过系统性错误 |
| L3-chains | **全量** | 链路错误影响最高 |
| api-contracts | **全量**（若存在） | AI 编码直接依赖 |
| L1-systems | 跳过 | 规范内容，ground-truth 弱 |
| ADR | 跳过 | 推断性内容，已由 `[推断]` 标注 |

### Reviewer Rubric

两个 Reviewer 使用**不同审计视角**，增强独立性（同模型同 prompt 无法提供真正的双重验证）。

> **命名说明**：本 skill 的审计角色从 B 开始编号（无 A），与 `santa-method` skill 内部的角色体系对齐（santa-method 使用 B/C 分配正向/反向审计视角；A 保留为发布者/调用方角色）。

**Reviewer B — 正向验证（逐条核实）**

```text
你是一个 RAG 文档审计员（正向验证视角）。逐条验证文档中的每个技术断言是否与源码一致。

## 审计对象
{doc_content}

## 对应源码（从 source_paths 提取的关键片段）
{source_code_snippets}

## 评审标准（逐项 PASS / FAIL）
1. 代码路径准确性：文件路径、函数名、类名是否在源码中真实存在？
2. 调用关系准确性（L3 专项）：时序图/调用链是否与真实代码顺序一致？
3. 参数/字段准确性（API 专项）：字段名、类型、必填性是否与真实结构体一致？
4. 内部一致性：各章节描述是否自相矛盾？

返回 JSON:
{"verdict":"PASS"|"FAIL","checks":[{"criterion":"...","result":"PASS|FAIL","detail":"..."}],"critical_issues":["..."]}
```

**Reviewer C — 幻觉猎手（专找不存在的实体）**

```text
你是一个 RAG 文档审计员（幻觉检测视角）。假设文档可能存在幻觉，你的任务是找出文档中提到的但在源码中根本不存在的实体。

## 审计对象
{doc_content}

## 对应源码（从 source_paths 提取的关键片段）
{source_code_snippets}

## 检查项
1. 列出文档中所有模块名、接口名、函数名、配置键、表名
2. 逐一在源码片段中核对：存在 / 不存在 / 无法确认（源码片段不足）
3. 对"不存在"的实体，判断是否是幻觉（vs. 源码片段截断导致的假阴性）

返回 JSON:
{"verdict":"PASS"|"FAIL","hallucinated_entities":["..."],"uncertain_entities":["..."],"critical_issues":["..."]}
```

### `source_code_snippets` 采样策略

提取代码片段时遵循以下优先级，总量控制在 **2000 tokens 以内**：

1. **symbols 优先**：从 frontmatter `symbols` 字段中每个符号，在 `source_paths` 文件中提取其函数/方法/类定义体（上下各 3 行），每个符号最多 20 行
2. **入口函数次之**：若 symbols 不足，追加入口文件（`main.go` / `routes.py` 等）前 50 行
3. **截断声明**：若提取内容超过 2000 tokens，截断并在 prompt 中注明："以下源码片段为采样，若实体无法确认请返回 uncertain_entities"

### 执行流程

```
1. 按采样策略选出待审计文档列表
2. 对每份文档：
   a. 读取文档内容（含 frontmatter）
   b. 按上方采样策略从 source_paths 提取代码片段（≤ 2000 tokens）
   c. 并行启动 Reviewer B（正向验证）和 Reviewer C（幻觉猎手）
   d. 收集两份 JSON verdict
   e. 判定规则：
      - B PASS 且 C PASS 且 C.uncertain_entities.length ≤ 5 → review_status = "reviewed"
      - B PASS 且 C PASS 但 C.uncertain_entities.length > 5 → review_status = "needs-human-review"（源码片段不足以确认 N 个实体，在 Santa Report 中列出）
      - 任一 FAIL → 收集 critical_issues；可选修复后重审（最多 3 轮）
   f. 3 轮未收敛 → review_status = "needs-human-review"
3. 必须输出 Santa Audit Report（见下）；无此报告不得声称 validate 完成
4. 将通过审计的文档写入 last_verified_commit = git rev-parse HEAD
```

### 抽样审计报告格式（必填）

```
Santa Audit Report
─────────────────────────────────────────
Sampled:  L2×N / L3×N / API×N  (total T docs)
Passed:   X / T
Fixed:    Y / T  (optional)
Deferred: Z / T  (needs-human-review: <paths>)

Structural (4a-4f): PASS | FAIL
  Manifest schema: ...
  Frontmatter: ...
  Graph schema: ...

Critical Issues Found:
  ❌ <path>: <issue>
─────────────────────────────────────────
```

### `--validate` 结论规则

| 条件 | 结论 |
|------|------|
| 4a–4f 任一 FAIL | **FAIL**（列出全部项） |
| 4a–4f PASS 且 4g 全 PASS | **PASS**（附 Santa 报告） |
| 4a–4f PASS 且 4g 有 deferred | **PARTIAL**（结构通过，内容需人工复核） |

**禁止** 在缺少 Santa Audit Report、或未执行 4b frontmatter 检查时输出「符合预期 / 全通过」。

---

## `needs-human-review` 闭环操作路径

当 4g 输出 `"review_status": "needs-human-review"` 时，闭环流程如下：

1. **查看待复核列表**：Santa Audit Report 中列有 `uncertain_entities` 和 `critical_issues`（若有）
2. **人工确认**：对照源码确认各实体是否真实存在；不确认则可能是幻觉
3. **修改文档**：直接编辑对应 `.rag/` 文档，删除/修正幻觉内容
4. **重新验证**：运行 `/gg:build-rag --validate`，触发新一轮 4g 审计
5. **状态更新**：若新一轮 4g 通过，文档状态自动升级为 `"review_status": "reviewed"`

> **工具**：人工确认阶段可用 `/gg:build-rag --validate` 反复迭代，无需全量重建。若需批量处理多个 `needs-human-review` 文档，建议先全部修改，再运行一次 `--validate`。
