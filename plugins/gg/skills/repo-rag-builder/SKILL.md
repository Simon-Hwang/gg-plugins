---
name: repo-rag-builder
description: 为 Go/Python 后端仓库构建多层级 RAG 知识库，产出 .rag/ 目录（L0→L3 分层文档、OpenAPI 契约、ADR 两级检索体系、GraphRAG 知识图谱）。当用户提出"为仓库建立 RAG"、"构建代码知识库"、"建立项目知识图谱"、"让 AI 理解我的代码"时触发，或由 /gg:build-rag 命令显式调用。_manifest.json 中的 last_synced_commit 字段是后续 /gg:rag-sync 增量维护的 git 锚点。
---

# Repo RAG Builder

为 LLM 编程助手构建**分层文档 + API 契约 + 知识图谱**三位一体的代码仓库知识库，产出 `.rag/` 目录。

核心原则：**按需加载，分而治之。** 本文件是路由器，执行细节在子文件中。

---

## 第一步：模式路由

根据调用参数选择执行路径，**立即 Read 对应子文件并按其指令执行**：

| 参数 | 执行路径 | 加载文件 |
|------|---------|---------|
| *(无参数)* | 自动探测：子系统 ≤ 5 且文件数 < 500 → 小仓；否则提示加 `--large` | `flows/small-repo.md` |
| `--large` | 大仓分阶段流（Stage 1→5，含人工确认网关） | 依次加载 `flows/large-stage1~5.md` |
| `--plan-only` | 仅执行 Stage 1（探测 + 成本投影），不写文档 | `flows/large-stage1-discovery.md` |
| `--system <name>` | Stage 3 单子系统定向构建（跳过其他子系统） | `flows/large-stage3-build.md` |
| `--validate` | 仅执行 Stage 4（结构 + 内容双层校验），不重建 | `flows/large-stage4-validation.md` |
| `--resume` | 读取 `_state.json`，从断点继续大仓构建 | `flows/large-stage3-build.md` |

---

## 文档层级体系

| 层级 | 名称 | 核心问题 | 分析路线 |
|------|------|----------|----------|
| **L0** | 仓库全景 | "这个仓库是干什么的？" | 自动生成 |
| **L1** | 系统/服务级 | "这个子系统的架构和编码规范？" | style-analyzer |
| **L2** | 模块级 | "这个模块的职责、接口和扩展点？" | 混合（偏 style） |
| **L3** | 核心链路级 | "这条业务流具体怎么跑的？" | code-analyzer |
| **API** | API 契约 | "这个接口入参出参是什么？" | 自动提取 |
| **ADR** | 架构决策记录 | "之前为什么这么做？" | 提取 + 补全 |

---

## 分析路线选择信号

**style-analyzer**（L1/L2）：interface/abstract/base 类占比高 / 清晰分层架构 / 大量配置规约文件 / 代码模式高度重复 → 产出规则、范式、DOs/DON'Ts

**code-analyzer**（L3）：复杂业务状态机 / 并发控制分布式锁 / 跨服务长调用链 / 数据一致性幂等性 → 产出调用链路图、量化参数、异常场景

不明显时默认 style 路线。

---

## 输出目录结构

```
.rag/
├── _index.md              # 总索引
├── _manifest.json         # 全局元数据（格式见 schemas/manifest.md）
├── _graph.json            # GraphRAG 知识图谱（格式见 schemas/graph.md）
├── _plan.json             # (--large/--plan-only) 子系统计划 + Token 成本预测
├── _discovery.md          # (--large/--plan-only) 人类可读探测报告
├── _state.json            # (--large) 断点续传状态
├── L0-overview.md
├── L1-systems/<system>.md
├── L2-modules/<system>-<module>.md
├── L3-chains/<chain>.md
├── api-contracts/<system>.openapi.json | <system>-api.md
└── ADR/ADR-Summary.md + NNN-<decision>.md
```

---

## 格式规范

需要查阅 JSON 格式或字段定义时，Read 对应 schema 文件：

- `_manifest.json` 格式 → `schemas/manifest.md`
- `_graph.json` 格式 → `schemas/graph.md`

---

## 质量标准

1. **自包含性**：单独取出一份文档，LLM 能否独立理解？
2. **代码锚定**：关键论述附带真实代码片段和文件路径。
3. **粒度一致**：同层级文档详细程度大致一致。
4. **检索友好**：frontmatter 的 tags / summary 匹配自然语言问题。
5. **Token 安全**：单份文档 1000-3000 tokens；ADR-Summary.md < 2000 tokens；超长文档拆分。

---

## 多仓库场景

| 仓库类型 | 构建范围 |
|----------|---------|
| 主仓库（最大/最复杂） | 完整 L0→L3 + API + ADR + GraphRAG |
| 前端卫星仓 | L1 + L2 |
| 文档仓 | 融入 ADR |
| 独立服务 | 视复杂度，至少 L1 + API |

跨仓依赖在 `_graph.json` 边上标注 `"cross_repo": true`。

---

## 注意事项

- **分析器职责分离**：L1 聚焦"怎么写才对"，L3 聚焦"具体怎么跑"；交叉内容按用户需求归属，另一边简短引用+链接。
- **ADR 推断谨慎**：`[推断]` 标注不是确定事实，供用户确认。
- **大仓成本控制**：Stage 2 确认网关不允许跳过；`--plan-only` 是零成本的预审工具。
- **并行加速**：L1 各子系统、L2 各模块、API 契约提取彼此独立，尽量并行执行。
