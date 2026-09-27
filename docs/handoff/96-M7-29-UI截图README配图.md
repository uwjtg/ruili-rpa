# M7 · 切片 29：UI 截图走查（README 配图）

> 接力开发交接文档 · V3 原型
>
> - 切片：M7-29（选项 A UI 截图 / GIF 走查）
> - 依赖切片：[95-M7-28-拆分CONTRIBUTING.md](./95-M7-28-拆分CONTRIBUTING.md)
> - 状态：**已完成**（typecheck 0 / vitest 405 / pytest 88 不变）
> - 落盘日期：2026-09-27

---

## 1. 本阶段目标与完成情况

给公开仓库 README 配真实界面截图。没有走桌面 GUI 截图，而是复用主进程内置的 smoke 截图能力（`src/main/index.ts` 的 `RUILI_SMOKE=1` + `RUILI_SMOKE_ROUTE`，`webContents.capturePage()` 直出渲染层，干净无任务栏/桌面干扰）：

- `npm run build` 后，逐路由起 electron 自动截图并自退：
  - `/`（工作台）→ 统计指标卡 + 应用累计运行时长折线图 + 企业概览/成员动态；
  - `/editor`（流程编辑器）→ 四区：左侧指令库、紫色步骤区（4 步演示流程）、右侧参数/变量/元素/设置/AI 页签、底部日志；
  - `/market`（模板市场）→ 50 个官方模板卡片墙 + 分类 chips + 搜索。
- 截图归档到 `docs/screenshots/`：`home.png` / `editor.png` / `market.png`（1360×860，55–105 KB）。
- README 顶部新增「界面预览」小节，三张图并排（HTML `<img width=270>` 居中）。

triggers 路由的 smoke electron 进程卡在 sidecar 调度连接上未自退，已强杀；三张核心图已够 README，未追。

## 2. 产出物

| 文件 | 改动 |
|---|---|
| `docs/screenshots/home.png` | 新增，工作台截图 |
| `docs/screenshots/editor.png` | 新增，流程编辑器截图 |
| `docs/screenshots/market.png` | 新增，模板市场截图 |
| `README.md` | 顶部加「界面预览」三图并排段 |

无代码改动（截图复用既有 smoke 钩子，未改源码）。

## 3. 测试结果原文

纯文档 + 图片，跑三绿门禁确认无回归：

- `npm run typecheck`：0 错。
- `npm test`（vitest）：39 文件 / **405 passed**。
- `npm run test:sidecar`（pytest）：**88 passed**。

## 4. 自检清单

- [x] 截图来自真实构建产物（`npm run build` 后 loadFile），非设计稿/杜撰。
- [x] README 图片路径 `docs/screenshots/*.png` 相对引用，GitHub 渲染可见。
- [x] 三绿门禁跑过，基线不变。
- [x] 未改源码、未碰 RunWireEvent、无密钥入库。
- [x] 交接文档 7 段写满，INDEX.md 加行。

## 5. 遗留问题

1. 只截了工作台/编辑器/市场 3 张；触发器/机器人/应用/学院未截（triggers smoke 卡住）。需要可后续补。
2. 未做 GIF 录屏（README 静态图够用；录屏需另起）。
3. 根目录 `smoke.png` 是 smoke 钩子产物（仓库此前误收录为跟踪文件，当前工作区为删除态），本次未提交它，截图统一走 `docs/screenshots/`。

## 6. 对下一阶段的输入

- README 配图 V1 完成；下一批可选：
  - C) 收尾项：邮件密码走 safeStorage、教程视图占位内容、代码签名、WPS/Office COM、装机版自动更新端到端；
  - 或补 triggers/robots/apps 截图与 GIF。

## 7. 待用户拍板

1. 下一批走 C（收尾项，挑一两件）还是继续补截图/GIF？
2. 仓库已 public 但 LICENSE 仍 UNLICENSED，是否补开源许可证？（沿切片 95 挂账）
