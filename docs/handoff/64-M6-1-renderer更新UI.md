# M6 · 切片 1：renderer 更新 UI（TopBar 版本胶囊接入 onStatus）

> 接力开发交接文档 · 版本 V3 原型
>
> - 切片：M6-1 · 把 M5-26 打通的 updater 通道接到 TopBar UI
> - 依赖切片：[63-M5-26-electron-updater接入.md](./63-M5-26-electron-updater接入.md)
> - 状态：**已完成并验证**（typecheck 0、vitest 330、pytest 84、renderer 963.58 kB）
> - 落盘日期：2026-09-25

---

## 1. 本阶段目标与完成情况

**目标**：M5-26 主进程 electron-updater 已通，但 renderer 没有任何 UI 反馈。本切片把 TopBar 左上角硬编码的版本胶囊 `V3 原型 · v0.1` 改成可点击的更新状态入口。

完成：
- `TopBar.tsx`：
  - import `useEffect` / `useState`；
  - 新增 `UpdState` 联合类型（idle/checking/available/downloaded/not-available/error）；
  - 组件内订阅 `window.ruili.updater.onStatus`，状态实时映射到版本胶囊文案与配色；
  - 点击胶囊调 `window.ruili.updater.check()` 手动检查；
  - `not-available` / `error` 瞬时状态 3 秒后自动回到 `idle`（显示当前版本号）。
- 状态文案与配色：
  - `idle`：`v0.1.0`，灰底灰字（默认）；
  - `checking`：`检查更新中…`，灰底灰字；
  - `available`：`有新版 vX.X`，蓝底蓝字（提示有更新）；
  - `downloaded`：`更新已就绪 vX.X`，绿底绿字（主进程已弹 dialog 提示重启）；
  - `not-available`：`已是最新`，绿底绿字，3s 后消失；
  - `error`：`更新检查失败`，红底红字，3s 后消失。

未做（留后续）：下载进度条（download-progress 事件未接）、有新版横幅弹窗、设置页独立「关于/更新」区块、版本号从主进程 `app.getVersion()` 动态获取（当前硬编码 v0.1.0）。

## 2. 产出物

| 文件 | 改动 |
|---|---|
| `src/renderer/src/components/TopBar.tsx` | span 版本胶囊 → button；加 `UpdState` / `UPD_LABEL` / `UPD_COLOR`；useEffect 订阅 `updater.onStatus`；onClick 调 `updater.check()` |

无主进程 / preload / DB / sidecar / IPC 改动（M5-26 已就绪）。

## 3. 测试结果原文

```
$ npm run typecheck
（0 错误）

$ npx vitest run
 Test Files  29 passed (29)
      Tests  330 passed (330)

$ npm run test:sidecar
84 passed in 12.90s

$ npm run build
out/renderer/assets/index-*.js   963.58 kB   （上一切片 962.04，+1.54 kB 为 TopBar 状态逻辑）
```

## 4. 自检清单

- [x] TopBar 版本胶囊可点击 → 触发手动检查更新；
- [x] onStatus 订阅在 useEffect cleanup 里 off()，不泄漏；
- [x] 瞬时状态（已是最新/错误）3 秒后自动恢复默认；
- [x] 有新版 / 已就绪状态保留直到下次启动或重启；
- [x] 未改 RunWireEvent / FlowDoc / IPC 协议 / DB / sidecar；
- [x] typecheck 0、vitest 330、pytest 84；
- [x] dev 环境下 updater 为 undefined（preload 仍暴露但主进程不推事件），可选链安全降级。

## 5. 遗留问题

1. **版本号硬编码** `v0.1.0`：未从主进程 `app.getVersion()` 取。后续可在 preload 加 `appVersion: app.getVersion()` 暴露，TopBar 读它。
2. **未接 download-progress**：下载过程无进度条提示（当前下载完成才弹 dialog，中间静默）。自用模式可接受。
3. **available 状态未弹提示条**：检测到有新版时只改胶囊颜色，未在画布顶部弹横幅。用户不点胶囊就不知道有新版。可在 M6 后续补。
4. **CSS 变量 fallback**：`--bg-success` / `--green` 用了内联 fallback 色值（#E7F8F0 / #1DBF73），未在 design tokens 里正式登记。
5. **未真机验证**：dev 环境下主进程不推 updater 事件，UI 状态只在打包后真机才能看到完整流转。

## 6. 对下一阶段的输入要求

- 若要补下载进度：主进程 `updater.ts` 加 `autoUpdater.on('download-progress', (p) => ...)` 推 `updater:status` 加 `progress` 字段；preload onStatus 类型加 `percent`；TopBar（或单独 toast）显示百分比。
- 若要补有新版横幅：在 AppShell 级组件订阅 onStatus，`available` 时在画布顶部渲染紫色横幅「发现新版本 vX，立即更新 / 稍后」。
- 版本号动态化：preload 加 `appVersion: app.getVersion()`，env.d.ts 加字段，TopBar 替换硬编码。
- 下一候选：M6-2 首次运行引导 / M6-3 崩溃上报 / M6-4 应用分享。

## 7. 待用户拍板的决策

1. M6 下一切片选哪个（首次引导 / 崩溃上报 / 应用分享 / 其他体验打磨）。
2. GitHub publish owner/repo 仍为占位（`ruili-rpa/ruili-rpa`），发版前需替换。
