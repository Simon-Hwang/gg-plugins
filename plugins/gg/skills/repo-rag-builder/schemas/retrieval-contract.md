# RAG 检索消费端契约

本文件定义检索器（LLM 编程助手、向量索引器、工具链）如何消费 `.rag/` 目录的各类产物。  
**构建 RAG 时也必须遵守本契约**：文档格式要为检索器的加载策略服务，而非只为阅读舒适度服务。

---

## 1. 产物分层与角色

| 产物 | 角色 | Token 量级 |
|------|------|-----------|
| `_manifest.json documents[]` | **路由注册表**：检索的第一道过滤器，永远先加载 | 全量小（< 5k tokens） |
| Markdown frontmatter | **路由卡片**：判断"是否值得读正文"的元数据 | 每份 < 300 tokens |
| Markdown 正文 | **知识载体**：命中后才按需加载 | 每份 1000–3000 tokens |
| `_graph.json` | **邻接扩展器**：命中文档后追加上下文邻居 | 按需局部加载 |

---

## 2. 标准加载顺序

```
Step 1 [必须] 加载 _manifest.json
  └─ 用 domain / intent / symbols / level 对 documents[] 做快速过滤
  └─ 得到候选文档列表（通常 3–10 篇）

Step 2 [按需] 加载候选文档的 frontmatter
  └─ 若 manifest 中的 summary / intent 已足够判断相关性，可跳过此步
  └─ 对 token_estimate > 预算阈值的文档，先读 frontmatter 再决定是否加载正文

Step 3 [按需] 加载命中文档的正文
  └─ 按相关度降序加载，直至达到上下文 token 预算上限
  └─ L3 链路文档优先全量加载；L2 模块文档可只读首屏

Step 4 [可选] 图谱邻接扩展
  └─ 从正文 frontmatter 的 graph_node_id 出发
  └─ 在 _graph.json 中查找 1 跳邻居节点
  └─ 若邻居有 doc_ref，按需追加对应文档的 frontmatter 或正文
  └─ 禁止无限递归扩展：最多扩展 2 跳
```

---

## 3. 各字段的检索用途

### `_manifest.json documents[]` 字段

| 字段 | 检索用途 |
|------|---------|
| `domain` | 业务域过滤（如 `order`、`payment`）；匹配用户问题的业务上下文 |
| `intent` | 自然语言意图匹配；与用户 query 做语义相似度比较 |
| `symbols` | 精确符号查找（函数名、类名、RPC 方法）；优先于语义匹配 |
| `level` | 按需求类型路由：架构理解 → L1；模块定位 → L2；链路追踪 → L3；接口参数 → API |
| `token_estimate` | 预判加载代价；超出预算阈值时降级为只读 frontmatter |
| `confidence` | `low` 置信度文档不应作为唯一依据；需与代码原文交叉验证 |
| `review_status` | `needs-human-review` 的文档须在回答中声明"未经人工审核" |

### `_graph.json` 字段

| 字段 | 检索用途 |
|------|---------|
| `doc_ref` | 从图谱节点跳转到对应 RAG 文档（用于邻接扩展） |
| `type` | 节点类型过滤（`module` / `api` / `adr` / `function`） |
| `cross_repo` | 标记跨仓库依赖；邻接扩展时需要注意文档可能不在当前 `.rag/` 目录 |

---

## 4. Token 预算策略

| 上下文窗口 | 推荐策略 |
|-----------|---------|
| < 32k tokens | 最多加载 3 篇正文；优先 L3 > API > L2 |
| 32k–128k tokens | 最多加载 8 篇正文 + 1 跳图谱扩展 |
| > 128k tokens | 可加载全部候选正文；仍优先相关度排序 |

**永远先加载 `_manifest.json`（路由注册表）**，不得跳过直接猜测文档路径。

---

## 5. ID 稳定性要求（构建约束）

以下规则保证检索器的索引不会因仓库变更而产生重复条目或断链：

| 操作 | 要求 |
|------|------|
| 文档重命名 | `id` 字段保持不变；仅更新 `path` 字段；旧 `path` 写入 `_manifest.json` 的 `aliases[]`（如有） |
| 模块删除 | 从 `documents[]` 中移除对应条目；在 `_graph.json` 中同步删除节点和相关边；不保留 tombstone |
| `graph_node_id` | 与 `id` 保持一致，构建后不得变更；变更等同于重建该节点的所有邻接关系 |
| 增量同步 | `/gg:rag-sync` 以 `last_synced_commit` 为 diff 基点；ID 稳定才能做真正的增量 |

---

## 6. 安全与隐私过滤（构建约束）

构建 RAG 时，以下内容**禁止**写入任何 `.rag/` 文档：

- 硬编码密钥、token、密码、私有凭据（即使是示例值）
- 生产数据库连接串、内部 IP 段、VPN 配置
- 私有 CA 证书内容、签名密钥
- 含真实用户 PII 的日志片段或数据样例

如源码中存在上述内容（如配置文件示例），在 `source_paths` 中引用路径即可，**不得将内容复制到正文**。

---

## 7. 语言/框架支持级别

| 支持级别 | 语言/框架 | 说明 |
|---------|----------|------|
| **主支持** | Go、Python | 完整 L0→L3 + API + ADR + GraphRAG |
| **降级支持** | TypeScript/JavaScript、Java、Rust | L0 + L1 + L2 + API；L3 需人工补充调用链；symbols 提取精度较低 |
| **部分支持** | 前端（React/Vue）、Infra（Terraform/K8s）、Data Pipeline | L1 + L2（架构规范）；跳过 L3；API 只提取公开端点 |
| **不支持/需人工** | 汇编、DSL、低代码平台 | 不应直接运行 RAG builder；需人工手写文档后导入 |
