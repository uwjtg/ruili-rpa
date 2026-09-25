# 下一个对话开场白

> 在新对话开头复制粘贴下面整段即可无缝接力。

```
继续锐流 RPA 开发（M4 浏览器线全部真站验证完；M5 调度已起步）。请先读：
1) docs\锐流RPA-V3-接力开发模式说明.md
2) docs\锐流RPA-V3-开发计划书.md
3) docs\handoff\INDEX.md
4) docs\handoff\44-M5-5-文件监听触发器.md（最新）
5) docs\handoff\43-M5-4-热键触发器.md
6) docs\锐流RPA-开发交接文档.md（§5 编辑器交互清单、§7 边界）

当前基线：
- M3 切片 1-18 收尾；M4 切片 1-11 完成（抓取向导/CDP拾取/录制器V1-V3/翻页/XLSX/修饰键/真站冒烟/iframe）；M5 切片 1-5 完成（调度 + 互斥补跑 + RobotsView + 热键 + 文件监听）。
- 验证全绿：pytest 84/84、vitest 26 文件 168 用例、typecheck 0、build renderer 889.17 kB、license 无新传染（croner@9.1.0 MIT）。
- 真站冒烟全过（系统 Chrome channel:'chrome'）：
  · node .runtime/smoke_web_live.mjs → 7/7
  · npx vite-node .runtime/smoke_recorder_live.mts → 10/10（录制器 click/fill/scroll/Tab/Enter/Control+C/跨导航重注入）
  · npx vite-node .runtime/smoke_recorder_headed.mts → 3/3（有头 badge 截图 .runtime/smoke-headed-badge.png）
  · npx vite-node .runtime/smoke_iframe_live.mts → 3/3（跨 frame getText/click/scrape）
  · npx vite-node .runtime/smoke_tasks_db.mts → 8/8（tasks CRUD）
  · 调度器单测 7/7（含互斥跳过、grace 内补跑、超 grace 不补跑）
  · npx vite-node .runtime/smoke_runs_history.mts → 11/11（run 历史聚合+明细）
  · npx vite-node .runtime/smoke_hotkey_task.mts → 5/5（热键任务 CRUD）
  · npx vite-node .runtime/smoke_filewatch.mts → 2/2（fs.watch 新文件触发+去重）
- web 指令清单（12 条）：webOpenBrowser/webOpenUrl/webClick/webInput/webScroll/webPressKey/webExtractText/webWaitFor/webScrapeList/webCloseBrowser；其中 click/input/extract/wait/scrape 均加可选 frame 参数（跨 iframe，传 iframe CSS 选择器）。
- 调度：tasks 表（trigger_type=cron|interval，croner）+ TaskScheduler（src/main/scheduler.ts，不依赖 Electron）+ IPC tasks:list/create/toggle/delete + TriggersView 真实列表/新建/启停。fire 直接 runManager.start(flow)。whenReady 启动、退出 stop。
- sidecar 协议未变。流程 AST：FlowDoc{version,name,vars,steps,recordThresholds?}。
- DB %APPDATA%\ruili-rpa\ruili.db（新增 tasks 表）。
- 冒烟留存：.runtime/smoke_web_live.mjs、smoke_recorder_live.mts、smoke_recorder_headed.mts、smoke_iframe_live.mts(+iframe-parent.html)、smoke_tasks_db.mts、及历史桌面侧 .py 脚本。

下一步建议：
1. 桌面+网页混合流程端到端演示（M3 桌面指令 × M4 网页指令串一条流程）。
2. 文件路径注入触发变量（triggerFile 传给流程，处理下载的那个文件）。
3. AI 魔法指令（function-calling 生成流程）接入。
4. RobotsView 加「清空历史」与按流程筛选。
5. 热键/文件监听创建时查重。

关键约束：
- 环境 Windows 桌面，PowerShell（不用 Bash），node 22.23.2，Electron 44，npm 镜像 npmmirror；better-sqlite3 v13 NAPI 免 rebuild；RunWireEvent 形状从未改动。
- 项目根：C:\Users\Administrator\Desktop\1\ruili-rpa
- sidecar Python：C:\Users\Administrator\AppData\Local\Doubao\User Data\sandbox_runtime\bases\c98c5042338ed152c6f10ecd8591889f\python\python.exe（已装 uiautomation）；主进程用 python spawn（已在 PATH）。
- 真站冒烟用 channel:'chrome'；跑 TS 脚本用 vite-node（不要读 .ts 原文做正则替换）。
- env.d.ts 手写镜像 window.ruili：preload 加 API 后必须同步 env.d.ts（否则 renderer typecheck 报 Property 不存在）。

勿重试方向（切片 1-18 + M4 沉淀，均为已验证死路）：
- computer_use_tool GUI 操作（PIP 初始化失败）；overlay 穿透在 root.update() 后设置；钩子装 tk mainloop 线程；遮罩全透明透传。
- GUI 自动点击必须 SetForegroundWindow 置前 + GetWindowRect 实时相对坐标；冒烟进程必须 SetProcessDpiAwareness(2)。
- 录制聚合的 key 过滤与 click/scroll 元素解析必须用「事件发生时」前台PID/签名；钩子线程做 UIA 必须先 CoInitializeEx。
- 停止录制后等 autosave（dirty 后 3s）再查 DB。
- Shift 不能算快捷键修饰键；仅 Control/Alt/Win 触发 pressKey 合并。
- 改带默认参数的方法签名后同步测试 fake（WebSession 加参数后 fakeSession 是 vi.fn 天然多参，但 toHaveBeenCalledWith 旧断言要补尾参 undefined）；新增指令后同步注册断言；改 FlowVar/变量结构后同步 exact-dict 测试。
- PowerShell git 提交信息勿含 ${} 字面；含模板串的代码改文件优先用 .runtime/_p*.py 或 PowerShell 替换；Edit 工具因外部追加失锁时用 PowerShell 读写。
- 跨目录相对 import 数层数：EditorView 在 src/renderer/src/views/，shared 是 ../../../shared。
- 页面脚本字符串里正则要双反斜杠。
- 从 .ts 源读模板函数字符串做冒烟：${...} 是 TS 编译期替换的，正解是 vite-node 直接 import 编译后常量，不要写正则替换。
- Playwright page.evaluate 接受 new Function 结果时要 cast as unknown as () => void。
- iframe 跨 frame 元素定位用 page.frameLocator(frameSel).locator(sel)；在 frame 里跑函数用 handle.contentFrame()（waitForSelector 拿到 iframe 元素句柄后）。
- 调度 interval 已 floor 到 1000ms（unref 不阻塞退出）；单测 interval 用 1000ms 等 2300ms 才能抓 2 次。
- lint 有基线告警（EditorView.tsx:134、env.d.ts:13 等），非本轮引入。

完成后按 §4 模板落盘 docs/handoff/41-XXX.md、更新 INDEX.md 与本文件，并生成下一对话开场白。
```
