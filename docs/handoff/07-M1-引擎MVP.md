# M1 引擎 MVP 交接文档（2026-09-24）

> 上游：《接力开发模式说明》《计划书 V1.1》《handoff/06-M0-收尾核对报告》
> 范围：计划书 §7 M1「引擎 MVP」——「打开网页→抓取→写 Excel」完整流程在设计器内真实运行、日志实时流式；补资源生命周期（运行结束自动关浏览器/存 Excel）。

## 1. 本阶段目标与完成情况

**目标**：在 M0 已有的 AST 解释器 + 全量指令注册 + RunManager + IPC run:event + EditorView 最小运行面板基础上，把 M1 验收链路（真实浏览器→抓取→写 Excel）在设计器内跑通，并补上 M0 挂账的"资源未与运行生命周期绑定"问题。

**完成情况**：M1 验收标准全部达成。

- **资源生命周期（核心缺口）**：`RunManager` 在每次 `start()` 时绑定一个 `RunDisposer`；无论流程 `completed / error / cancelled`，`interpreter.run()` 的 `finally` 里统一 `disposeWeb()` + `disposeExcel()`——自动关闭运行中的浏览器、释放打开着的 Excel 工作簿，并各推一条 `info` 日志"运行结束：已关闭浏览器 / 已释放 Excel 工作簿"。无资源时不发日志。disposer 可注入，单测不依赖真实浏览器。
- **整体超时**：`start(flow, { timeoutMs })` 新增可选参数；到期推 `warn` 日志并协作式 `interpreter.stop()`。主进程 M1 端到端流程默认给 60s 保险。
- **新指令（直接服务"抓取→写 Excel"场景）**：
  - `webWaitFor`：等待选择器可见（Playwright `locator.waitFor({state:'visible'})`，可配超时）。
  - `excelWriteRow`：一次写一行（JSON 数组参数，数字串自动转 number），支撑循环抓取后批量落表。
- **M1 端到端流程常量** `M1_E2E_FLOW`（12 步）：打开浏览器 → 打开离线 data:URL 测试页（点击后 400ms 异步渲染 `#result`）→ 输入搜索词 → 点击 → `webWaitFor #result` → 提取标题 → 新建 Excel → 写表头 → `excelWriteRow` 写一行 → 保存 `.runtime/m1-e2e.xlsx` → 汇总日志。
- **设计器内可运行**：主进程 IPC `run:start-m1`、preload `ruili.run.startM1E2E()`、EditorView 新增蓝色按钮「运行 M1 端到端（真实浏览器→Excel）」，与原有绿色「运行演示流程（mock）」并列，日志面板复用同一套 `run:event` 流式渲染。
- **真实 POC 验证**：`npm run poc:m1` 实跑——12 步全绿、xlsx 落盘 6478 字节、跑完后 `getWebSession().isRunning()===false`、`getExcelSession().isOpen()===false`。

**未完成 / 留后续**：
- 指令总数 24 条（8 demo + 7 web + 6 excel + 3 sidecar），距计划书"原型 36 条"还有 12 条差距——属 M5「指令扩充 + AI」范围，本阶段不凑数。
- 单步调试 / 变量监视 / 步骤级重试——M2 编辑器真实化。
- sidecar 资源生命周期（运行中崩溃重连、flow-end 自动停 sidecar）——M4 机器人模式统一处理。
- 真实站点选择器稳定性（回退链）——M3。
- 完整拖拽编辑器 / 参数面板 schema 化 / LLM 设置 UI——M2。

## 2. 产出物清单（文件路径 + 关键接口签名）

| 路径 | 说明 / 关键接口 |
|---|---|
| `src/engine/run/runManager.ts` | `RunManager(emit, registry?, disposer?)`；`start(flow, opts?: { timeoutMs? })`；新增 `interface RunDisposer { disposeWeb(): Promise<boolean>; disposeExcel(): Promise<boolean> }`；`class DefaultRunDisposer` 默认驱动模块级 web/excel 单例；私有 `disposeResources()` 在 run finally 调用 |
| `src/engine/web/session.ts` | `WebSession` 接口新增 `waitFor(selector, timeoutMs): Promise<void>`；`RealWebSession` 用 `locator.first().waitFor({state:'visible', timeout})` 实现 |
| `src/engine/web/commands.ts` | 注册 `webWaitFor`（params: selector / timeoutMs 默认 5000） |
| `src/engine/excel/workbook.ts` | `ExcelSession` 接口新增 `writeRow(sheet, row, values: unknown[]): void`；`RealExcelSession` 从 col=1 顺序写入并 `commit()` |
| `src/engine/excel/commands.ts` | 注册 `excelWriteRow`（params: sheet / row / values=JSON 数组字符串，支持 `${变量}` 插值） |
| `src/engine/core/m1-flow.ts` | 导出 `M1_E2E_FLOW: FlowDoc`、`M1_E2E_OUTFILE` |
| `src/engine/index.ts` | barrel 追加 `RunDisposer` / `StartOptions` / `M1_E2E_FLOW` / `M1_E2E_OUTFILE` |
| `src/main/index.ts` | IPC `run:start-m1`（带 60s 超时）；import `M1_E2E_FLOW` |
| `src/preload/index.ts` | `ruili.run.startM1E2E()` |
| `src/renderer/src/env.d.ts` | `run.startM1E2E` 类型 |
| `src/renderer/src/views/EditorView.tsx` | 第二个运行按钮 + 空状态文案更新 |
| `scripts/poc-m1-e2e.ts` | `npm run poc:m1`：真实跑 M1_E2E_FLOW，断言 status=completed / xlsx 落盘 / 浏览器已关 / Excel 已释 |
| `src/engine/run/runManager.test.ts` | 新增 3 例：disposer 被调用 / 无资源不发日志 / 超时推 warn |
| `src/engine/web/commands.test.ts` | fakeSession 加 `waitFor`；注册数 6→7；新增 webWaitFor 用例 |
| `src/engine/excel/commands.test.ts` | fakeSession 加 `writeRow`；注册数 5→6；新增 excelWriteRow 正常 + 非法 JSON 抛错 2 例 |

**公共文件改动声明（§3 协议第 2 条）**：
- `package.json`：scripts 新增 `poc:m1`（`vite-node scripts/poc-m1-e2e.ts`）；**零新增 npm 依赖**（沿用 playwright-core / exceljs / React 全家桶）。
- `src/main/index.ts`、`src/preload/index.ts`、`src/renderer/src/env.d.ts`、`src/renderer/src/views/EditorView.tsx`、`src/engine/index.ts`。
- **未改** `src/shared/*`（ast / cmd-schema / events / run-protocol 契约全部不变）；`RunWireEvent` 形状未动，向后兼容。

## 3. 测试结果原文

```
$ npm test
 RUN  v3.2.7
 ✓ src/engine/run/runManager.test.ts (6 tests) 385ms
 ✓ src/engine/web/commands.test.ts (5 tests)
 ✓ src/engine/excel/commands.test.ts (5 tests)
 ✓ ...（其余 12 文件沿用）
 Test Files  15 passed (15)
      Tests  61 passed (61)
 Duration  ~3.5s
```

```
$ npm run typecheck   # tsconfig.node + tsconfig.web 均 0 error
$ npm run build
  out/main/index.js  45.50 kB
  out/preload/index.js  1.45 kB
  out/renderer/assets/index-*.js  756.26 kB
  out/renderer/assets/index-*.css  15.52 kB
$ npm run license:check   # 仅 jszip (MIT OR GPL-3.0-or-later)，选 MIT；0 禁用命中
$ python -m pytest sidecar/tests -q   # 4 passed
```

`npm run poc:m1` 真实端到端：

```
[13:11:47] ▶ 流程开始: M1 端到端：打开网页→抓取→写Excel
[13:11:47]   → s1 (webOpenBrowser)
[13:11:47]     [success] 浏览器已启动
[13:11:47]   → s2 (webOpenUrl)
[13:11:47]     [success] 页面加载完成，标题：（无）
[13:11:47]   → s3 (webInput)
[13:11:47]     [success] 已在 #q 输入文本
[13:11:47]   → s4 (webClick)
[13:11:47]     [success] 已点击 #btn
[13:11:47]   → s5 (webWaitFor)
[13:11:47]     [success] 元素 #result 已出现
[13:11:47]   → s6 (webExtractText)
[13:11:47]     [success] 提取文本（15 字）→ title
[13:11:47]   → s7 (excelCreate)
[13:11:47]   → s8 (excelWriteCell)
[13:11:47]   → s9 (excelWriteCell)
[13:11:47]   → s10 (excelWriteRow)
[13:11:47]     [success] 已写入 Sheet1!第2行（2 列）
[13:11:47]   → s11 (excelSave)
[13:11:47]     [success] 已保存 ...\.runtime\m1-e2e.xlsx
[13:11:47]   → s12 (logMessage)
[13:11:47]     [success] ✅ M1 端到端完成：标题=结果标题: 锐流 RPA 价格，已写 ...m1-e2e.xlsx
[13:11:47] ⏹ 流程结束: status=completed, steps=12, 1840ms
[13:11:47]     [info] 运行结束：已关闭浏览器
[13:11:47]     [info] 运行结束：已释放 Excel 工作簿
[13:11:47] ✅ 产物已落盘: ...m1-e2e.xlsx（6478 字节）
[13:11:47]    资源状态 → 浏览器 isRunning=false；Excel isOpen=false
[13:11:47] ✅ M1 端到端 POC 通过
```

## 4. 自检清单（对照《接力开发模式说明》§5 统一 DoD）

- [x] 产出物落盘约定路径（`src/engine/run|web|excel|core`、`src/main`、`src/preload`、`src/renderer/views`、`scripts/`）
- [x] `npm test` 全绿（61/61，附原文）；`pytest sidecar/tests` 4/4 绿；typecheck 0 错；build 通过；license:check 0 禁用
- [x] 新增逻辑带单测：RunManager 资源清理 2 例 + 超时 1 例；webWaitFor 1 例；excelWriteRow 正常 + 非法 JSON 2 例；浏览器/Excel 在单测中仍走 stub，不在 CI 真起
- [x] 未引入禁用依赖：本阶段**零新增 npm 依赖**；无 EPPlus5+/PyMuPDF/Emgu.CV/n8n/GPL·AGPL 进主程序
- [x] 无硬编码密钥、令牌；POC 用离线 data:URL 与 `.runtime/` 临时文件
- [x] 未反编译、未引用影刀任何二进制或资源
- [x] 交接文档 7 段写满并落盘

## 5. 遗留问题（含影响与建议）

1. **指令总数 24 vs 计划书"原型 36 条"**：M1 不追求凑数，新增的 2 条（webWaitFor / excelWriteRow）直接服务验收链路；其余 12 条高频指令（邮件/数据库/Word/PDF/消息通知/图像等）按计划书 §7 属 M5 范围。影响：M2/M3 编辑器里指令库会比 M0 原型少，UI 不饱满但不阻塞。
2. **超时是协作式的**：`timeoutMs` 到期调 `interpreter.stop()`，但正在跑的原子指令（如 `delay`、慢网络 `goto`）要到下一个检查点才退出；不会强制杀浏览器进程。影响：极端情况下超时后浏览器可能要等当前网络操作完成才被 disposer 关闭。建议：M4 机器人模式再加"强制杀进程"兜底。
3. **sidecar 未纳入 RunDisposer**：Python sidecar 是模块级 `SidecarClient`，当前由 `sidecarStop` 指令显式控制；流程 error/cancelled 时若用户没写 sidecarStop，Python 进程可能残留。影响：M1 端到端流程不启动 sidecar，无实际影响；M4 机器人模式前补上 `disposeSidecar()`。
4. **EditorView 仍只有两个内置流程按钮**：不能在 UI 里自由编辑/运行用户自造流程。这是 M2「完整拖拽编辑器 + 参数面板 + 保存/加载」范围。
5. **真实 GUI 冒烟未人工跑**：`poc:m1` 已在 Node 侧证明引擎+资源清理链路；Electron 窗口里点蓝色按钮的端到端肉眼验证留作用户 ★3 验收。
6. **Git 基线仍缺**（沿用 M0）：本机 Git for Windows 异常未修复，M1 代码同样未提交。不阻塞开发。

## 6. 对下一阶段（M2 · 编辑器真实化）的输入要求

- **RunManager 签名已定型，向后兼容**：
  - `start(flow, opts?: { timeoutMs? })`——M2 编辑器运行自造流程时可传超时，也可不传（默认不限制）。
  - `RunDisposer` 接口可注入；M2 不建议改这个抽象，直接用默认实现即可。
  - `RunWireEvent` 形状**不要动**（EditorView 已依赖 log/step/flow-end 渲染）；如需新字段（如变量快照、步骤耗时），加可选字段。
- **EditorView 运行按钮已就绪**：绿色跑 mock DEMO_FLOW，蓝色跑 M1_E2E_FLOW；M2 接真实流程编辑时，用已有的 `ruili.run.start(flow: FlowDoc)` IPC 即可，无需新增通道。
- **新指令已注册进 `buildEngineRegistry()`**：M2 指令库 UI 从 `registry.list()` 拿元数据时，webWaitFor / excelWriteRow 会自动出现，无需额外接线。
- **M2 重点**：完整拖拽编辑器（指令库 / 参数面板 schema 化 / 变量面板 / 元素库 / 撤销重做 / 保存加载 SQLite）+ LLM 设置 UI（baseURL/key/model 表单，apiKey 用 safeStorage/DPAPI）。
- **资源语义**：M2 编辑器里跑流程时，资源清理由 RunManager 统一兜底，编辑器不需要自己关浏览器/Excel。

## 7. 待用户拍板的决策

- **M1 验收链路是否需要在真实 GUI 里再人工冒烟一次**（`npm run dev` → 编辑器 → 点蓝色「运行 M1 端到端」）？推荐：**是**，这是计划书 ★3 之前的一次快速肉眼验证，预计 1 分钟；Node 侧 poc:m1 已全绿，GUI 冒烟主要确认按钮接线与日志面板滚动。
- **是否继续 M2（编辑器真实化）**？按计划书 §7 关键路径：引擎(M1) → 编辑器真实化(M2) → 拾取(M3)。推荐下一对话直接开 M2。
- 无新增技术决策；计划书 §11 六项决策沿用；Git 基线问题沿用建议（修复后一次性提交）。
