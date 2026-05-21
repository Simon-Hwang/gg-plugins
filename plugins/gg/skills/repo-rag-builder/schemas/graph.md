# _graph.json 格式规范

## 节点类型 (Node Types)

| 类型 | 说明 | 何时创建 |
|------|------|---------|
| `repo` | 仓库 | Phase 1 / Stage 1 |
| `system` | 子系统 | Phase 1 / Stage 1 |
| `module` | 模块 | Phase 3/4 |
| `file` | 关键源文件 | 全流程扫描 |
| `class` | 核心类/结构体 | Phase 3/4 |
| `function` | 关键函数 | Phase 6 / Stage 3 |
| `api` | API 端点 | Phase 5 / Stage 3 |
| `adr` | 架构决策 | Phase 7 / Stage 3 |
| `config` | 配置项（如全局配置文件、环境变量定义）；**仅当**配置项被多个模块直接依赖且改动影响面广时才创建，不强制 | Phase 1 / Stage 1（可选） |

> **精简原则**：只纳入「改它需要知道影响了谁」的关键节点。模块内私有辅助函数不进图谱；暴露给其他模块的接口函数必须在。

## 边类型 (Edge Types)

| 类型 | 含义 | 示例 |
|------|------|------|
| `contains` | 包含关系 | repo → system → module → file |
| `depends_on` | 依赖关系 | module A depends_on module B |
| `calls` | 调用关系 | function A calls function B |
| `implements` | 实现关系 | class X implements interface Y |
| `handles` | 处理关系 | function Z handles API endpoint /foo |
| `decided_by` | 决策关联 | module M decided_by ADR-001 |
| `imports` | 导入关系 | file A imports file B |
| `extends` | 继承关系 | class Child extends class Parent |

> **校验**：`flows/large-stage4-validation.md` **4e** 要求边使用 `source`/`target`；使用 `from`/`to` 判 **FAIL**。

## 文件格式

```json
{
  "nodes": [
    {
      "id": "server-agents",
      "type": "module",
      "label": "agents 模块",
      "path": "server/aegis/agents/",
      "tags": ["python", "agent", "battle"],
      "doc_ref": "L2-modules/server-agents.md"
    },
    {
      "id": "api-post-battles",
      "type": "api",
      "label": "POST /api/battles",
      "path": "server/aegis/api/routes/battles.py",
      "method": "POST",
      "doc_ref": "api-contracts/server.openapi.json#/paths/~1api~1battles/post"
    }
  ],
  "edges": [
    {
      "source": "api-post-battles",
      "target": "server-agents",
      "type": "calls",
      "label": "触发 Battle 执行"
    },
    {
      "source": "server-agents",
      "target": "adr-001",
      "type": "decided_by",
      "label": "Agent 输出格式由 ADR-001 决定"
    }
  ]
}
```

## 跨仓引用（多仓库场景）

跨仓边在 edge 上标注：

```json
{
  "source": "main-repo-module-a",
  "target": "satellite-repo-module-b",
  "type": "depends_on",
  "cross_repo": true,
  "label": "调用卫星服务 B 的 gRPC 接口"
}
```

## 图谱逐步积累策略

知识图谱不是一次性构建的，在整个流程中逐步积累：

| 阶段 | 操作 |
|------|------|
| Phase 1 / Stage 1 | 创建 `repo` / `system` 节点 |
| Phase 3/4 / Stage 3 L1/L2 | 补充 `module` / `class` 节点，添加 `contains` / `depends_on` 边 |
| Phase 5 / Stage 3 API | 补充 `api` 节点，添加 `handles` 边 |
| Phase 6 / Stage 3 L3 | 补充 `function` 节点，添加 `calls` 边 |
| Phase 7 / Stage 3 ADR | 补充 `adr` 节点，添加 `decided_by` 边 |
| Phase 8 / Stage 4 | 校验与补全：孤立节点检查、补充 `imports` / `extends` 边、生成最终文件 |
