# src/shared · UI 与引擎共用类型

本目录存放跨进程、跨模块共用的类型与常量，是全项目"唯一契约"所在：

| 文件（规划） | 内容 | 落地阶段 |
|---|---|---|
| `cmd-schema.ts` | 指令插件 schema（`CmdSchema` / `ParamField`） | 阶段 2（T3） |
| `ast.ts` | 流程 JSON AST 类型（`FlowDoc` / `Step`） | 阶段 2（T2） |
| `events.ts` | 引擎事件类型（run-start/step/log/vars…） | 阶段 4（T7） |

约定：**任何跨 `src/main` / `src/engine` / `src/renderer` 的类型必须先落在这里**，改动须在交接文档中显式声明。
