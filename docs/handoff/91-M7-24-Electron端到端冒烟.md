# M7 · 切片 24：Electron 端到端冒烟

> 接力开发交接文档 · V3 原型
>
> - 切片：M7-24（Electron 主进程端到端冒烟）
> - 依赖切片：[90-M7-23-桌面高级真机冒烟.md](./90-M7-23-桌面高级真机冒烟.md)
> - 状态：**已完成并验证**（build OK / electron 起 15s 不崩 / stderr 空）
> - 落盘日期：2026-09-26

---

## 1. 本阶段目标与完成情况

按用户要求做端到端冒烟：`electron-vite build` → 直接起 `electron.exe .` → 观察主进程是否正常启动、窗口创建、无致命错误。

**结果**：
- `npm run build` 成功（main 785ms / preload 27ms / renderer 1.77s，renderer 970.46 kB）
- 起 electron.exe（pid 9856），15 秒后仍存活（4 个进程：main + renderer + GPU + utility）
- stdout 仅一行 updater 提示（开发环境 electron-updater 不挂载，跳过检查更新——预期行为）
- stderr 空，无未捕获异常
- sidecar 子进程未拉起（预期：sidecar 懒启动，首次 pick/record 才起）
- 测试后干净 kill，临时日志已删

## 2. 产出物

无代码改动（纯冒烟）。

## 3. 测试结果原文

```
$ npm run build
 ✓ built in 785ms / 27ms / 1.77s
 out/renderer/assets/index-*.js  970.46 kB

$ electron.exe .
 started pid: 9856
 alive after 15s: True
 stdout: [updater] 开发环境：electron-updater 不挂载（缺 app-update.yml）；跳过检查更新
 stderr: (空)
```

## 4. 自检清单

- [x] build 全绿；
- [x] electron 主进程起、窗口开、15s 不崩；
- [x] stderr 无未捕获异常；
- [x] 测试后进程全清（electron=0, python=0）；
- [x] 临时日志已删。

## 5. 遗留问题

1. 未做 renderer 端交互冒烟（点按钮、跑一个流程）——需要 GUI 自动化或人工。
2. 未触发 sidecar 懒启动链路（pick:start → ensureSidecar → Python 子进程）。
3. 未验证托盘图标/菜单/收托盘行为（切片 76 代码已 push 但未真机点过）。
4. 未验证新指令在 RunManager 里真能跑（注册了但没端到端执行过）。

## 6. 对下一阶段的输入

- Electron 主进程启动链路已闭环；下一步可做：IMAP 收邮件 / 用户文档 / 人工 GUI 走查。

## 7. 待用户拍板

1. 下一批：IMAP / 文档 / 人工 GUI 走查清单？
