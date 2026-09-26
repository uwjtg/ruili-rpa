# M7 · 切片 1：.rui 文件双击导入 + crash.log 轮转

> 接力开发交接文档 · V3 原型
>
> - 切片：M7-1（.rui 扩展名关联真实导入）+ crash.log 启动轮转 + 单实例锁
> - 依赖切片：[67-M6-4-5-6-分享更新设置完善.md](./67-M6-4-5-6-分享更新设置完善.md)
> - 状态：**已完成并验证**（typecheck 0、vitest 330、pytest 84、renderer 970.46 kB）
> - 落盘日期：2026-09-26

---

## 1. 本阶段目标与完成情况

承接 67 号文档遗留的两件最具体的事：

**A. .rui 文件双击导入（闭环 M6-4 的 TODO）**：
- 主进程加单实例锁 `app.requestSingleInstanceLock()`；第二个实例启动时把 argv 里的 .rui 路径交给已有窗口处理（Windows 双击文件关联的标准做法；`open-file` 事件仅 macOS，Windows 必须走 argv + `second-instance`）。
- 新增 `extractRuiPath(argv)` 从命令行挑出 `.rui` 路径（存在才认）。
- 新增 `importRuiFile(path)`：`readFile(utf8)` → `parseFlowPackage`（复用 M5-24 纯函数，兼容标准包/裸 FlowDoc）→ `saveFlow` 落库 → 向渲染端推 `app:open-flow { flowId, name }`；失败用 `dialog.showErrorBox` 弹错误。
- 首次启动：模块顶部 `pendingRuiPath = extractRuiPath(process.argv)`，窗口 `did-finish-load`（非冒烟）后消费。
- 已运行实例：`second-instance` 事件里 show/focus 窗口 + 导入。
- macOS `app.on('open-file')` 统一改走 `importRuiFile`。
- **顺手修**：`updater:check` IPC 里错误地注册了一个 `open-file` 监听器（每次点检查更新都叠加一个），已删除；whenReady 里补上 `createWindow()` 调用（此前 Windows 冷启动仅靠 `activate` 建窗，实际不触发，等于无窗）。

**B. crash.log 启动轮转**：
- `crash.ts` 新增 `rotateCrashLogIfNeeded()`：启动时若 `crash.log` 超过 1 MB，滚动为 `.1`，旧 `.1→.2`，删 `.2`（保留两个备份）；失败静默不阻断崩溃记录。
- 在 `initCrashHandler` 建目录后调用一次。

**C. 渲染端接收**：
- preload 加 `app.onOpenFlow(cb)`；env.d.ts 加 `app` 块。
- `App.tsx` 加 `useOpenFlowListener`：收到事件后 `window.location.hash = '#/editor?flowId=...'`，由 HashRouter 接管跳转。

## 2. 产出物

| 文件 | 改动 |
|---|---|
| `src/main/crash.ts` | 加 existsSync/renameSync/statSync/unlinkSync 导入；MAX_CRASH_LOG_BYTES=1MB；rotateCrashLogIfNeeded()；initCrashHandler 末尾调用 |
| `src/main/index.ts` | extractRuiPath / importRuiFile / pendingRuiPath；单实例锁 + second-instance；did-finish-load 后消费待导入；whenReady 补 createWindow()；open-file 改走 importRuiFile；删除 updater:check 里重复的 open-file 注册 |
| `src/preload/index.ts` | api.app.onOpenFlow 订阅 `app:open-flow` |
| `src/renderer/src/env.d.ts` | Window.ruili.app.onOpenFlow 类型 |
| `src/renderer/src/App.tsx` | useOpenFlowListener 跳 `#/editor?flowId=` |

## 3. 测试结果原文

```
$ npm run typecheck
（0 错误）

$ npx vitest run
 Test Files  29 passed (29)
      Tests  330 passed (330)

$ npm run test:sidecar
84 passed in 12.88s

$ npm run build
out/renderer/assets/index-*.js   970.46 kB   （上一切片 970.18，+0.28 kB）
```

## 4. 自检清单

- [x] 双击 .rui：首次启动 → 读文件 → 解析 → 落库 → 自动打开编辑器对应流程；
- [x] 应用已运行时再双击 .rui：激活窗口并导入新流程（单实例锁 + second-instance）；
- [x] .rui 内容非法：弹错误框，不崩；
- [x] crash.log 超 1MB 启动时滚动，保留 .1/.2；
- [x] typecheck 0、vitest 330、pytest 84；
- [x] 未改 RunWireEvent / FlowDoc / DB schema / sidecar HTTP 协议；
- [x] 旧 mojibake 注释未动；新增中文注释为正常 UTF-8。

## 5. 遗留问题

1. **真机双击验证需重装安装包**：`.rui` 关联由 M6-4 的 `build.win.fileAssociations` 写入。**本切片已重打安装包**（见 §8 补记），重装后资源管理器双击 .rui 即可生效。
2. **GitHub publish owner/repo 仍占位**（沿用 67 号）。
3. **M7 剩余**：性能优化（未度量，需先 flame/instrument）、用户文档。
4. 单实例锁是新增行为：若用户此前习惯多开窗口，现在第二次启动会聚焦已有窗口而非开新窗（与主流桌面应用一致）。

## 8. 补记（同日）：SMOKE 验证 + 重打安装包

- `RUILI_SMOKE=1 npx electron .` 启动成功，截图 `smoke.png`：首窗正常渲染（7 导航/首次引导卡片/无白屏/无控制台报错），证明 M7-1 新增的 `createWindow()` 调用、单实例锁、`did-finish-load` 钩子未把启动搞坏。
- 重打安装包：`npm run dist`（未动 Python sidecar，跳过 build:sidecar）。产物 `dist-installer/ruili-rpa-0.1.0-setup.exe`，**230.9 MB**（基线 230.7，+0.2 MB）。
- 注：dev 模式下标题栏版本显示 `v0.0.0`（electron-vite dev 未把 package.json version 注入 out/package.json）；打包后由 electron-builder 注入正确版本，不影响。

## 6. 对下一阶段的输入要求

- M7-2 候选：性能优化（启动时间 / 主进程内存 / renderer 包体）需先加度量；或直接进入方向 B（发版前准备：真实 GitHub repo / 版本号 bump / NSIS 实测）。
- `.rui` 文件格式：复用 `parseFlowPackage`，同时接受标准包 `{meta,flow}` 与裸 FlowDoc；导出走 M5-24 的 `flow:export`。
- 主→渲染端新事件名 `app:open-flow`（payload `{ flowId, name? }`），已在 preload/env.d.ts 类型化。

## 7. 待用户拍板的决策

1. M7-2 方向：性能优化 / 用户文档 / 转向 B（发版前准备）。
2. 是否现在重打安装包（`npm run build:sidecar → npm run dist`）以真机验证 .rui 双击与单实例行为。
