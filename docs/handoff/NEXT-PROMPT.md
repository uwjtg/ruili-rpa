# 下一个对话开场白

> 在新对话开头复制粘贴下面整段即可无缝接力。

```
继续锐流 RPA M4 开发（下一步建议：浏览器录制器 CDP 完整版——录制点击/输入/滚动为指令序列；或抓取向导真站端到端冒烟+翻页入抓，按优先级自选）。请先读：
1) docs\锐流RPA-V3-接力开发模式说明.md
2) docs\锐流RPA-V3-开发计划书.md
3) docs\handoff\INDEX.md
4) docs\handoff\32-M4-3-浏览器CDP点选拾取.md（最新）
5) docs\handoff\31-M4-2-聚类加固与离线基准.md
6) docs\handoff\30-M4-1-数据抓取向导V1.md
7) docs\锐流RPA-开发交接文档.md（§5 编辑器交互清单、§7 边界）

当前基线：
- M3 切片 1-18 全部收尾；M4 切片 1（抓取向导 V1）+ 切片 2（聚类加固+离线基准）+ 切片 3（CDP 点选拾取）完成。
- 验证全绿：pytest 84/84、vitest 25 文件 159 用例、typecheck 0、build renderer 865.28 kB、license 无新增传染。
- M4-1 抓取向导：WebSession 增 eval(fnBody,arg)（new Function 包装 + page.evaluate，不受 CSP 影响）；新指令 webScrapeList；页面脚本 INSPECT/SCRAPE 自函数字符串；主进程 scrape.ts + IPC scrape:inspect + preload；ScrapeWizard 三步对话框。
- M4-2 聚类加固：normClass 剥离尾部 hash；listSelector 三分支（tag.cls / tag[class*=stem] / 父>tag）；relPath 加 :nth-of-type；benchmark 10 形态 10/10。
- M4-3 点选拾取：pick-script.ts 三段字符串（CSS_PATH_FN/PICK_START_FN/PICK_READ_FN）；页面注入紫色高亮框 mousemove 跟踪 elementFromPoint，mousedown capture 阶段 preventDefault+stopPropagation，Esc 取消；WebSession.startPagePick = new Function 注入三段 + waitForFunction(__ruiliPickDone) + 读 __ruiliPickResult；主进程 web-pick.ts + IPC web-pick:start + preload ruili.webPick.start；ScrapeWizard 「在页面中点选」按钮回填 sampleSel。
- Git 基线：M4-1 (b7afe29)、M4-2 (5c5a607)、M4-3 (d6feeb9)。
- sidecar 协议未变：/pick/start|stop、/desktop/click_element(+retries)、/desktop/type_text、/desktop/scroll、/desktop/locate_element(+trace)、/desktop/press_key、/desktop/window_pid、/desktop/config、/record/start(+target_pid,+thresholds)|stop。
- 流程 AST：FlowDoc{version,name,vars:FlowVar[],steps:StepNode[],recordThresholds?}；FlowVar{name,type,value,required?,description?}。
- DB %APPDATA%\ruili-rpa\ruili.db；元素去重 key=windowHandle|automationId|name|controlType。
- 冒烟留存：.runtime/smoke_record.py、smoke_replay.py、smoke_bring_foreground.py、gui_smoke_record.py、smoke_fallback.py、smoke_pick_chain.py、diag_record_keys.py、probe_taskbar.py。

下一步建议（M4 方向，按优先级）：
1. （M4）浏览器录制器 CDP 完整版：录制页面内点击/输入/滚动为 webClick/webFill/webScroll 指令序列（不只拾取单个元素）。
2. （M4）抓取向导真站端到端冒烟（用户手动）+ 拾取后自动识别 + 翻页抓取 / iframe 支持 / XLSX 导出。
注：抓取向导+点选拾取真浏览器端到端仍未冒烟（页面脚本仅 linkedom 离线测试），下一切片若做 CDP 录制可顺带真站验证。

关键约束：
- 环境 Windows 桌面，PowerShell（不用 Bash），node 22.23.2，Electron 44，npm 镜像 npmmirror；better-sqlite3 v13 NAPI 免 rebuild；RunWireEvent 形状从未改动。
- 项目根：C:\Users\Administrator\Desktop\1\ruili-rpa
- sidecar Python：C:\Users\Administrator\AppData\Local\Doubao\User Data\sandbox_runtime\bases\c98c5042338ed152c6f10ecd8591889f\python\python.exe（已装 uiautomation）；主进程用 python spawn（已在 PATH）。

勿重试方向（切片 1-18 + M4 沉淀，均为已验证死路）：
- computer_use_tool GUI 操作（PIP 初始化失败）；overlay 穿透在 root.update() 后设置；钩子装 tk mainloop 线程；遮罩全透明透传（判断拾取/录制用 picker.is_picking()）。
- GUI 自动点击必须 SetForegroundWindow 置前 + GetWindowRect 实时相对坐标；冒烟进程必须 SetProcessDpiAwareness(2)。
- 录制聚合的 key 过滤与 click/scroll 元素解析必须用「事件发生时」捕获的前台PID/签名；钩子线程做 UIA 必须先 CoInitializeEx；独立侧起 sidecar 首个 HTTP UIA 调用已由 ensure_com_thread 处理。
- 停止录制后等 autosave（dirty 后 3s）再查 DB。
- Shift 不能算快捷键修饰键；仅 Control/Alt/Win 触发 pressKey 合并。
- 改带默认参数的方法签名后同步测试 fake（WebSession 加方法后 fakeSession 必须同步加 mock）；改 element_to_dict 全字段后同步 exact-dict 断言；改 FlowVar/变量结构后同步 exact-dict 测试。
- PowerShell git 提交信息勿含 ${} 字面（会被当变量解析）。
- 本 session Edit/Write 对源码偶发报「未读取」，改文件优先写临时脚本做字符串 replace（TS/Python 同此）；同一轮内先 Read 过的文件可直接 Edit。
- PowerShell here-string 里写 JS 模板串/反引号会被吞，插入含模板串的代码块改用字符串拼接。
- 跨目录相对 import 数层数：EditorView 在 src/renderer/src/views/，shared 是 ../../../shared；其子目录 editor/ 下要再深一层。
- 页面脚本字符串里正则要双反斜杠（模板串转义）：\s 写 \\s，\. 写 \\.。
- lint 有基线告警（EditorView.tsx:134 setState-in-effect、env.d.ts:13 FlowSummary 未用等），非本轮引入，修复前先确认。
- Playwright page.evaluate 接受 new Function 结果时要 cast as unknown as () => void，否则 TS 报 Function 不可赋给 PageFunction。

完成后按 §4 模板落盘 docs/handoff/33-M4-4-XXX.md、更新 INDEX.md 与本文件，并生成下一对话开场白。
```
