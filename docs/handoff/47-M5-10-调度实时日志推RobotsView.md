# M5 · 切片 10：调度运行实时日志推到 RobotsView

> 接力开发交接文档 · 版本 V3 原型
>
> - 切片：M5-10 · 调度/热键/文件监听触发的运行，日志实时流到 RobotsView；并修调度触发日志 flowId 归属
> - 依赖切片：[46-M5-7-9-triggerFile-RobotsView增强-查重](./46-M5-7-9-triggerFile-RobotsView增强-查重.md)
> - 状态：**已完成并验证**（冒烟 10/10；vitest 26 文件 168/168、pytest 84/84、typecheck 0、build renderer 893.05 kB）
> - 落盘日期：2026-09-25

---

## 1. 本阶段目标与完成情况

上一步遗留「调度运行中实时日志推到 RobotsView」。此前 RobotsView 只在挂载/手动刷新时查 `runs:history`（事后查 SQLite），调度到点触发的运行只能结束后才看到，且触发时主进程 `currentFlowId` 没被设成任务所属流程，日志会错记到设计器上次跑的流程名下。

本次完成两件事：

1. **flowId 归属修复**（`src/main/index.ts`）：`scheduler` / `hotkeys` / `fileWatcher` 三处 fire 回调补上第二参 `task`，在 `runManager.start(flow)` 前同步 `currentFlowId = task.flowId`。三种触发源的运行日志从此落到任务所属流程，不再沿用设计器残留。
2. **RobotsView 实时订阅**（`src/renderer/src/views/RobotsView.tsx`）：挂载时 `ruili.run.onEvent` 订阅 `run:event`：
   - `flow-start` → 列表顶部插入蓝色高亮「运行中」项（临时 `__live__`，自动展开）；
   - `log` → 流式追加到该实时项的日志区；
   - `flow-end` → 移除实时项并 `refresh()` 拉取已落库的历史项（含真实 runId/status/durationMs）。
   卸载时自动退订。设计器/调度/热键/文件任何触发源都能看到实时流。

未改 `RunWireEvent` 形状、未加 IPC、未动 preload/env.d.ts（`run.onEvent` 早已暴露）。

## 2. 产出物清单

- `src/main/index.ts`：三处 fire 回调签名 `(flow) =>` → `(flow, task) =>`，同步 `currentFlowId = task.flowId`（filewatch 原本就有 `extraVars` 第三参，把 `_task` 改名 `task` 并使用）。
- `src/renderer/src/views/RobotsView.tsx`：重写，新增 `live: LiveRun | null` 状态 + `liveRef` + `onEvent` 订阅 effect；抽出 `renderEntries()` 供历史项与实时项共用；空态判断改为 `!live && shown.length === 0`。
- `.runtime/smoke_live_logs.mts`：复刻主进程 broadcast 闭包（runLog 收集 → flow-end `appendRunLog`），模拟「设计器残留 flowId → 调度 fire 覆盖」两轮，断言归属正确与事件流顺序。

## 3. 测试结果原文

```
$ npx vite-node .runtime/smoke_live_logs.mts
PASS  保存流程A  — 7b56afb9-...
PASS  历史有 1 条运行
PASS  运行归属 flowId=A（不沿用设计器残留）
PASS  运行状态 completed
PASS  日志条数=2
PASS  日志明细含两条
PASS  warn 级别透传
PASS  事件流含 flow-start→log×2→flow-end
PASS  历史有 2 条运行
PASS  最新运行归属 flowId=B
=== M5-10 实时日志归属冒烟: 10/10 通过 ===

$ npx vitest run
 Test Files  26 passed (26)
      Tests  168 passed (168)

$ python -m pytest sidecar/tests -q
84 passed in 12.90s

$ npm run typecheck   # 0 错误
$ npm run build
out/main/index.js    118.91 kB
out/preload/index.js   6.67 kB
out/renderer/assets/index-*.js  893.05 kB  （基线 890.69 kB，+2.36 kB 为实时订阅代码）
```

## 4. 自检清单

- [x] 未改 `FlowDoc` / `RunWireEvent` 形状；
- [x] 未加新 IPC、未动 preload/env.d.ts（`run.onEvent` 既有）；
- [x] 未加新依赖（无 package.json 改动）；
- [x] 调度互斥仍由 `isRunning()` 保证，`currentFlowId` 同步赋值安全（同一时刻只跑一个）；
- [x] RobotsView 卸载时退订，不影响 EditorView 侧订阅；
- [x] 实时项 flow-end 后由 `refresh()` 从 SQLite 重建真实项，状态/durationMs 以落库为准。

## 5. 遗留问题

1. 实时项没有 flowId（`flow-start` 事件只带 flowName），按流程筛选下拉时实时项始终置顶显示——可接受，结束后即归位。
2. 窗口最小化/隐藏期间运行，事件照发、日志照落库；回到 RobotsView 时只能看到历史项（中间实时流已错过），符合预期。
3. 调度触发的运行若 flow 未保存（直接 fire 内存 flow），`task.flowId` 一定是已存流程 id，不会出现 null；设计器未保存流程手跑仍走 `run:start` 透传 flowId。

## 6. 对下一阶段的输入要求

下一步建议（按价值排序）：

1. **AI 魔法指令前端入口**：`AiPanel` 页签已接 `llm:generateFlow` IPC，主进程 `llmClient` 仍读环境变量（`RUILI_LLM_API_KEY` 等），UI 无 Provider/baseURL/model 配置入口；可做「设置」里的 LLM 配置页（baseURL/apiKey DPAPI 加密/model 下拉）+ AiPanel 顶栏 Provider 切换。
2. **热键真按键手测、文件监听递归/等文件写完**（M5-5 遗留）：`fs.watch` 未传 `recursive`；大文件落盘期间 `statSync` 可能读到不完整文件，可加「等 size 稳定 N ms」。
3. **AI 报错解释**：run:event 拿到 error 时，调一个便宜模型解释失败步骤并回显在日志面板。

## 7. 待用户拍板的决策

无（本次为纯工程补全，按推荐执行）。
