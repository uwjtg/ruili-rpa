# 下一个对话开场白

> 在新对话开头复制粘贴下面整段即可无缝接力。

```
继续锐流 RPA 开发（M4 浏览器自动化线已收尾，下一步建议：真站端到端冒烟，或进入 M5 新方向）。请先读：
1) docs\锐流RPA-V3-接力开发模式说明.md
2) docs\锐流RPA-V3-开发计划书.md
3) docs\handoff\INDEX.md
4) docs\handoff\37-M4-8_9-XLSX与修饰键.md（最新）
5) docs\handoff\36-M4-7-翻页入抓.md
6) docs\锐流RPA-开发交接文档.md（§5 编辑器交互清单、§7 边界）

当前基线：
- M3 切片 1-18 全部收尾；M4 切片 1-9 全部完成（抓取向导V1/聚类加固+基准/CDP点选拾取/录制器V1/V2/V3/翻页入抓/XLSX导出/修饰键）。
- 验证全绿：pytest 84/84、vitest 25 文件 159 用例、typecheck 0、build renderer 870.58 kB、license 无新增传染（xlsx@0.18.5 Apache-2.0）。
- M4 浏览器线完整：
  · 抓取向导：WebSession.eval + INSPECT/SCRAPE 自函数字符串 + ScrapeWizard 三步；listSelector 三分支（tag.cls / [class*=stem] / 父>tag）+ nth-of-type；10 形态基准 10/10；翻页 nextSelector+maxPages 循环抓；CSV(UTF-8 BOM)+XLSX 双导出。
  · CDP 点选拾取：pick-script.ts 三段；页面紫色高亮 mousemove 跟踪、mousedown capture、Esc 取消；WebSession.startPagePick + IPC web-pick:start。
  · 录制器：click（webClick）/ input（webInput 500ms 去抖）/ scroll（webScroll 300ms 去抖）/ key（webPressKey，NAV 白名单 + 修饰键组合 "Control+c"）；导航后 framenavigated 自动重注入；录制浮层红色 badge。
- web 指令清单（11 条）：webOpenBrowser/webOpenUrl/webClick/webInput/webScroll/webPressKey/webExtractText/webWaitFor/webScrapeList/webCloseBrowser。
- Git 基线：M4-1 (b7afe29)、M4-2 (5c5a607)、M4-3 (d6feeb9)、M4-4 (a58fe77)、M4-5 (15c73df)、M4-6 (8237cd4)、M4-7 (1355904)、M4-8 (7afec0b)、M4-9 (6b67b49)。
- sidecar 协议未变。流程 AST：FlowDoc{version,name,vars,steps,recordThresholds?}。
- DB %APPDATA%\ruili-rpa\ruili.db。
- 冒烟留存：.runtime/smoke_record.py、smoke_replay.py、smoke_bring_foreground.py、gui_smoke_record.py、smoke_fallback.py、smoke_pick_chain.py、diag_record_keys.py、probe_taskbar.py。

下一步建议：
1. （手动，最重要）真站端到端冒烟：开 Edge→电商搜索结果页→向导识别→填 .next→maxPages=3→跑→检查 XLSX；再测登录页录制（输账号+Enter+Ctrl 修饰键）。
2. iframe 支持（抓取/录制跨 iframe）。
3. M5 新方向（按计划书）：桌面+网页混合流程、调度、变量高级用法。

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
- 改带默认参数的方法签名后同步测试 fake（WebSession 加方法后 fakeSession 必须同步加 mock；新增指令后同步注册断言）；改 FlowVar/变量结构后同步 exact-dict 测试。
- PowerShell git 提交信息勿含 ${} 字面；PowerShell here-string 里写 JS 模板串/${}/反引号会被吞，含模板串的代码改用字符串拼接（'a' + X + 'b'），改文件优先用 .runtime/_p*.py 临时脚本做字符串 replace。
- 跨目录相对 import 数层数：EditorView 在 src/renderer/src/views/，shared 是 ../../../shared；其子目录 editor/ 下要再深一层。
- 页面脚本字符串里正则要双反斜杠（模板串转义）：\s 写 \\s，\. 写 \\.。
- Playwright page.evaluate 接受 new Function 结果时要 cast as unknown as () => void。
- lint 有基线告警（EditorView.tsx:134 setState-in-effect、env.d.ts:13 FlowSummary 未用等），非本轮引入，修复前先确认。

完成后按 §4 模板落盘 docs/handoff/38-XXX.md、更新 INDEX.md 与本文件，并生成下一对话开场白。
```
