# 下一个对话开场白

> 在新对话开头复制粘贴下面整段即可无缝接力。

```
继续锐流 RPA M2→M3 开发。请先读：
1) docs\锐流RPA-V3-接力开发模式说明.md
2) docs\锐流RPA-V3-开发计划书.md（V1.1）
3) docs\handoff\INDEX.md
4) docs\handoff\11-M2-切片4-AI面板与单步调试.md（上一切片，最新）
5) docs\handoff\10-M2-切片3-自动保存与拖拽排序.md
6) docs\handoff\09-M2-切片2-持久化与标签页.md
7) docs\锐流RPA-开发交接文档.md（§5 编辑器交互清单）

当前基线：
- M2 切片 1-4 全部完成并落盘（编辑器四区真实化 / SQLite 持久化+多标签 / 3s 自动保存+日志落库+拖拽 / AI 面板+单步 step-over+标签重命名）。
- 验证全绿：typecheck 0 错、17 文件 74 测试、build 809kB、license 无新增禁用。
- 主进程 IPC 已齐：run:start(startM1E2E/resume/stop/step) / registry:list / llm:list-providers / llm:set-provider / llm:generate-flow / flow:save/list/load/delete。
- 数据库 %APPDATA%\ruili-rpa\ruili.db（apps/flows/logs 三表，WAL），已种 2 条种子流程。

下一步（M3 切片 1：桌面元素拾取 POC）：
- 按计划书 §5.1 选型（Python UIA 子进程桥 / Windows UIAutomation），主进程起 Python sidecar，暴露 pick:start / pick:stop / pick:result。
- 实现"拾取模式"：用户点按钮 → 全屏透明遮罩 + 鼠标移动高亮控件边框 → 点击后回传 {windowHandle, automationId, name, controlType, boundingBox}。
- 生成一条 pickElement 指令（进 cmd-schema + registry），拾取结果写参数。
- 编辑器工具栏加"拾取"按钮；拾取到的元素直接 append 一条 step 到当前流程。
- 完成后按 §4 模板落盘 docs/handoff/12-M3-切片1-桌面拾取POC.md 并更新 INDEX。

关键约束：
- better-sqlite3 v13 NAPI 免 rebuild；RunWireEvent 形状从未改动。
- 环境：Windows 桌面，PowerShell（不用 Bash），node 22.23.2，Electron 44，npm 镜像 npmmirror。
- 项目根：C:\Users\Administrator\Desktop\1\ruili-rpa
```
