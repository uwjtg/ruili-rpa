# M5 · 切片 26：electron-updater 接入（GitHub Releases）

> 接力开发交接文档 · 版本 V3 原型
>
> - 切片：M5-26 · 把 M5-22 留的空坑位换成真实 electron-updater 实现
> - 依赖切片：[62-M5-25-官方模板扩到50.md](./62-M5-25-官方模板扩到50.md)
> - 状态：**已完成并验证**（typecheck 0、vitest 330、pytest 84、renderer 962.04 kB）
> - 落盘日期：2026-09-25

---

## 1. 本阶段目标与完成情况

**目标**：按用户拍板方向 B，接入 electron-updater，更新源选 GitHub Releases（自用模式零运维）。

完成：
- 安装 `electron-updater@^6.8.9`（dependencies，打包后主进程运行时需要）；
- `package.json` build 段加 `publish`（provider: github，owner/repo 当前为占位 `ruili-rpa/ruili-rpa`）；
- `src/main/updater.ts` 从空占位重写为真实实现：
  - `initUpdater(getWindow)`：注册 autoUpdater 事件监听（checking / available / not-available / downloaded / error），dev 环境（`!app.isPackaged`）直接 return 不注册；
  - `checkForUpdates()`：生产环境调 `autoUpdater.checkForUpdates()`，dev 环境打印一行跳过日志；
  - `quitAndInstall()`：下载完成后重启安装；
  - `autoDownload = true`、`autoInstallOnAppQuit = true`；logger 静默（不灌 stdout）；
  - `update-downloaded` 事件弹 `dialog.showMessageBox`「立即重启 / 稍后」；
  - 所有状态通过 `webContents.send('updater:status', ...)` 推渲染端。
- `src/main/index.ts`：import 更新为 `{ checkForUpdates, initUpdater, quitAndInstall }`；`createWindow()` 后调 `initUpdater(() => mainWindow)`；新增 IPC `updater:check` / `updater:quit-and-install`。
- `src/preload/index.ts`：api 末尾加 `updater` 命名空间（`check` / `quitAndInstall` / `onStatus`）。
- `src/renderer/src/env.d.ts`：Window.ruili 接口同步加 `updater` 类型。

未做（留 M6）：renderer UI 入口（设置页「检查更新」按钮、更新进度 toast、有新版提示条）。本切片只打通主进程 + IPC + preload 通道。

## 2. 产出物清单

| 文件 | 改动 |
|---|---|
| `package.json` | dependencies 加 `electron-updater ^6.8.9`；build 段加 `publish: [{provider:"github", owner:"ruili-rpa", repo:"ruili-rpa"}]` |
| `src/main/updater.ts` | 重写：`initUpdater(getWindow)` / `checkForUpdates()` / `quitAndInstall()`；导出 `UpdaterStatus` 联合类型 |
| `src/main/index.ts` | 第 54 行 import 更新；whenReady 里 `initUpdater(() => mainWindow)` + `checkForUpdates()`；新增 `updater:check` / `updater:quit-and-install` 两个 IPC handler |
| `src/preload/index.ts` | api 对象末尾加 `updater: { check, quitAndInstall, onStatus }` |
| `src/renderer/src/env.d.ts` | Window.ruili 接口加 `updater` 类型声明 |

**关键接口**：
- 主进程导出：`initUpdater(getWindow: () => BrowserWindow | null): void`
- IPC channel：`updater:check`（invoke）、`updater:quit-and-install`（invoke）、`updater:status`（主→推 renderer）
- renderer 桥：`window.ruili.updater.check(): Promise<{ok:boolean}>`、`quitAndInstall()`、`onStatus(cb): () => void`

## 3. 测试结果原文

```
$ npm run typecheck
（0 错误）

$ npx vitest run
 Test Files  29 passed (29)
      Tests  330 passed (330)

$ npm run test:sidecar
84 passed in 12.91s

$ npm run build
out/preload/index.js      8.44 kB
out/renderer/assets/index-*.js   962.04 kB   （与 M5-25 持平，本切片未改 renderer 代码）
```

## 4. 自检清单

- [x] electron-updater 在 dependencies（不是 devDependencies，打包后主进程运行时加载）；
- [x] dev 环境 `!app.isPackaged` 守卫：不注册 autoUpdater、不调 checkForUpdates（缺 app-update.yml 不报错）；
- [x] package.json build.publish 配 github provider（owner/repo 占位，已标注待替换）；
- [x] 事件链完整：checking → available → 自动下载 → downloaded → dialog 提示重启；
- [x] 下载完成后 dialog 分支处理（有窗/无窗两种 dialog 调用签名）；
- [x] 错误事件吞掉并推 `updater:status: error`，不崩主进程；
- [x] 未改 RunWireEvent / FlowDoc / DB schema / sidecar HTTP 协议；
- [x] typecheck 0、vitest 330/330、pytest 84/84。

## 5. 遗留问题

1. **owner/repo 是占位**（`ruili-rpa/ruili-rpa`）。发版前必须改成真实 GitHub 仓库 owner/repo，否则 electron-updater 会 404。
2. **未做 renderer UI**：「检查更新」按钮、更新进度提示、有新版横幅都没接。preload API 已就绪，M6 体验打磨时在设置页加即可。
3. **未实际打包验证**：`npm run dist` 需要 `build:sidecar` + 230MB 包重建，本切片只跑了 `npm run build`（electron-vite 三端编译）。打包后 electron-builder 会自动生成 `app-update.yml` 到 resources，首次真机验证需要发一个旧版 → 升新版的 release 对。
4. **发版 token**：electron-builder 自动传 GitHub Release 需要环境变量 `GH_TOKEN`（repo 权限）。当前未配，首次发版时需设。
5. **国内访问 GitHub Releases 慢**：自用模式可接受；后续如需加速可换 generic provider 指向国内 CDN。
6. **代码签名未做**：未签名 exe 触发 SmartScreen，自用模式无妨；正式分发给他人前需买证书。

## 6. 对下一阶段的输入要求

- **发版流程**：改 `package.json` version → `npm run build:sidecar`（含联网装 rapidocr）→ `npm run dist` → 把 `dist-installer/` 下的 `.exe` + `.yml`（latest.yml）上传到 GitHub Release（tag = vX.Y.Z）。
- **renderer 接更新 UI**：订阅 `window.ruili.updater.onStatus((s) => ...)`，状态机：`checking`（转圈）→ `available`（提示有新版 vX）→ `downloaded`（弹窗已被主进程处理，这里可同步 UI 标记）→ `not-available`（已是最新）/ `error`（静默或提示检查网络）。
- **手动检查入口**：在设置页（EditorView 设置页签或 TopBar 菜单）加按钮，调 `window.ruili.updater.check()`。
- **下一候选**：M6 体验打磨（首次运行引导 / 崩溃上报 / renderer 更新 UI / 应用分享）。

## 7. 待用户拍板的决策

1. **GitHub 仓库 owner/repo**：当前占位 `ruili-rpa/ruili-rpa`，需提供真实仓库名（如 `your-name/ruili-rpa`）。
2. **M6 优先级**：自动更新主进程已通，下一步建议进 M6（首次运行引导 / 崩溃上报 / renderer 更新 UI / 应用分享），由用户拍板先做哪块。
