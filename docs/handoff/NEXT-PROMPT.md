# 下一个对话开场白

> 在新对话开头复制粘贴下面整段即可无缝接力。

```
继续锐流 RPA M4 开发（下一步建议：真站端到端冒烟+录制器 V2 补滚动/按键/导航；或抓取向导翻页入抓，按优先级自选）。请先读：
1) docs\锐流RPA-V3-接力开发模式说明.md
2) docs\锐流RPA-V3-开发计划书.md
3) docs\handoff\INDEX.md
4) docs\handoff\33-M4-4-浏览器录制器V1.md（最新）
5) docs\handoff\32-M4-3-浏览器CDP点选拾取.md
6) docs\handoff\31-M4-2-聚类加固与离线基准.md
7) docs\锐流RPA-开发交接文档.md（§5 编辑器交互清单、§7 边界）

当前基线：
- M3 切片 1-18 全部收尾；M4 切片 1（抓取向导 V1）+2（聚类加固+基准）+3（CDP 点选拾取）+4（浏览器录制器 V1）完成。
- 验证全绿：pytest 84/84、vitest 25 文件 159 用例、typecheck 0、build renderer 867.60 kB、license 无新增传染。
- M4-1 抓取向导：WebSession.eval + webScrapeList + INSPECT/SCRAPE 自函数字符串 + ScrapeWizard 三步。
- M4-2 聚类加固：normClass 剥 hash + listSelector 三分支（tag.cls / [class*=stem] / 父>tag）+ nth-of-type + 10 形态基准。
- M4-3 点选拾取：pick-script.ts 三段（CSS_PATH_FN/PICK_START_FN/PICK_READ_FN）；页面紫色高亮 mousemove 跟踪、mousedown capture 阶段 preventDefault、Esc 取消；WebSession.startPagePick + IPC web-pick:start + 向导「点选」按钮。
- M4-4 录制器 V1：record-script.ts 两段（REC_START_FN/REC_STOP_FN）；mousedown 录左键点击（cssPathOf），input 500ms 去抖录文本框最终值；WebSession.startWebRecord/stopWebRecord + IPC web-record:start/stop + preload ruili.webRecord；工具栏「● 录网页」按钮，停止后事件转 webClick/webInput 追加流程。
- Git 基线：M4-1 (b7afe29)、M4-2 (5c5a607)、M4-3 (d6feeb9)、M4-4 (a58fe77)。
- sidecar 协议未变。流程 AST：FlowDoc{version,name,vars,steps,recordThresholds?}。
- DB %APPDATA%\ruili-rpa\ruili.db。
- 冒烟留存：.runtime/smoke_record.py、smoke_replay.py、smoke_bring_foreground.py、gui_smoke_record.py、smoke_fallback.py、smoke_pick_chain.py、diag_record_keys.py、probe_taskbar.py。

下一步建议（M4 方向，按优先级）：
1. （M4-5）录制器 V2：补滚动（wheel→webScroll）、键盘按键（Enter/Tab→webPressKey）、页面导航后自动重注入；录制中浮层提示。
2. （手动）真站端到端冒烟：开 Edge→登录页→录网页→输账号密码→点登录→停止→回放验证。
3. 抓取向导翻页入抓 / iframe 支持 / XLSX 导出。

关键约束：
- 环境 Windows 桌面，PowerShell（不用 Bash），node 22.23.2，Electron 44，npm 镜像 npmmirror；better-sqlite3 v13 NAPI 免 rebuild；RunWireEvent 形状从未改动。
- 项目根：C:\Users\Administrator\Desktop\1\ruili-rpa
- sidecar Python：C:\Users\Administrator\AppData\Local\Doubao\User Data\sandbox_runtime\bases\c98c5042338ed152c6f10ecd8591889f\python\python.exe（已装 uiautomation）；主进程用 python spawn（已在 PATH）。

勿重试方向（切片 1-18 + M4 沉淀，均为已验证死路）：
- computer_use_tool GUI 操作（PIP 初始化失败）；overlay 穿透在 root.update() 后设置；钩子装 tk mainloop 线程；遮罩全透明透传（判断拾取/录制用 picker.is_picking()）。
- GUI 自动点击必须 SetForegroundWindow 置前 + GetWindowRect 实时相对坐标；冒烟进程必须 SetProcessDpiAwareness(2)。
- 录制聚合的 key 过滤与 click/scroll 元素解析必须用「事件发生时」捕获的前台PID/签名；钩子线程做 UIA 必须先 CoInitializeEx。
- 停止录制后等 autosave（dirty 后 3s）再查 DB。
- Shift 不能算快捷键修饰键；仅 Control/Alt/Win 触发 pressKey 合并。
- 改带默认参数的方法签名后同步测试 fake（WebSession 加方法后 fakeSession 必须同步加 mock）；改 FlowVar/变量结构后同步 exact-dict 测试。
- PowerShell git 提交信息勿含 ${} 字面；PowerShell here-string 里写 JS 模板串/${}/反引号会被吞，含模板串的代码改用字符串拼接（'a' + X + 'b'），改文件优先用 .runtime/_p*.py 临时脚本做字符串 replace。
- 跨目录相对 import 数层数：EditorView 在 src/renderer/src/views/，shared 是 ../../../shared；其子目录 editor/ 下要再深一层。
- 页面脚本字符串里正则要双反斜杠（模板串转义）：\s 写 \\s，\. 写 \\.。
- Playwright page.evaluate 接受 new Function 结果时要 cast as unknown as () => void。
- lint 有基线告警（EditorView.tsx:134 setState-in-effect、env.d.ts:13 FlowSummary 未用等），非本轮引入，修复前先确认。

完成后按 §4 模板落盘 docs/handoff/34-M4-5-XXX.md、更新 INDEX.md 与本文件，并生成下一对话开场白。
```
