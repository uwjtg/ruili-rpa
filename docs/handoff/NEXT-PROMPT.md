# 下一个对话开场白

> 在新对话开头复制粘贴下面整段即可无缝接力。

```
继续锐流 RPA M4 开发（下一步建议：浏览器录制器 CDP 点选拾取，或抓取向导真站冒烟/翻页入抓，按优先级自选）。请先读：
1) docs\锐流RPA-V3-接力开发模式说明.md
2) docs\锐流RPA-V3-开发计划书.md
3) docs\handoff\INDEX.md
4) docs\handoff\31-M4-2-聚类加固与离线基准.md（最新）
5) docs\handoff\30-M4-1-数据抓取向导V1.md
6) docs\锐流RPA-开发交接文档.md（§5 编辑器交互清单、§7 边界）

当前基线：
- M3 切片 1-18 全部收尾；M4 切片 1（抓取向导 V1）+ 切片 2（聚类加固+离线基准）完成。
- 验证全绿：pytest 84/84、vitest 24 文件 154 用例、typecheck 0、build renderer 864.06 kB、license 无新增传染。
- M4-1 抓取向导：WebSession 增 eval(fnBody,arg)（new Function 包装 + page.evaluate，不受 CSP 影响）；新指令 webScrapeList（listSelector/fieldsJson/resultVar/csvPath/maxItems，结果写变量 + 可选 UTF-8 BOM CSV）；页面内脚本 INSPECT_FN_BODY/SCRAPE_FN_BODY 为自函数字符串，生产注入页面、单测用 linkedom 跑同一份；主进程 scrape.ts + IPC scrape:inspect + preload ruili.scrape.inspect；编辑器工具栏「抓取」按钮开 ScrapeWizard 三步对话框（URL/示例选择器→识别预览→字段勾选命名→generateScrapeFlow 产出 webOpenBrowser→webOpenUrl→webScrapeList→logMessage 追加流程）。
- M4-2 聚类加固：normClass 剥离尾部 hash（[-_][a-zA-Z0-9]{6,}$）；listSelector 三分支（常规 tag.cls / hash 类 tag[class*=stem] / 纯 tag 组 父>tag）；relPath 加 :nth-of-type 消歧；benchmark.test.ts 10 形态离线基准 10/10 通过。
- Git 基线：M4-1 (b7afe29)、M4-2 (5c5a607)。
- sidecar 协议未变：/pick/start|stop、/desktop/click_element(+retries)、/desktop/type_text、/desktop/scroll、/desktop/locate_element(+trace)、/desktop/press_key、/desktop/window_pid、/desktop/config、/record/start(+target_pid,+thresholds)|stop。
- 流程 AST：FlowDoc{version,name,vars:FlowVar[],steps:StepNode[],recordThresholds?}；FlowVar{name,type,value,required?,description?}。
- DB %APPDATA%\ruili-rpa\ruili.db；元素去重 key=windowHandle|automationId|name|controlType。
- 冒烟留存：.runtime/smoke_record.py、smoke_replay.py、smoke_bring_foreground.py、gui_smoke_record.py、smoke_fallback.py、smoke_pick_chain.py、diag_record_keys.py、probe_taskbar.py。

下一步建议（M4 方向，按优先级）：
1. （M4）浏览器录制器（CDP）：页面内点击拾取 + 高亮 + 选择器生成（复用 WebSession.eval 注入通道）；示例选择器不再靠手填。
2. （M4）抓取向导真站冒烟 + 翻页抓取 / iframe 支持 / XLSX 导出。
注：抓取向导真浏览器端到端仍未冒烟（页面脚本仅 linkedom 离线测试），下一切片若做 CDP 拾取可顺带真站验证。

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
- 改带默认参数的方法签名后同步测试 fake（WebSession 加 eval 后 fakeSession 必须同步加 eval mock）；改 element_to_dict 全字段后同步 exact-dict 断言；改 FlowVar/变量结构后同步 exact-dict 测试。
- PowerShell git 提交信息勿含 ${} 字面（会被当变量解析）。
- 本 session Edit/Write 对源码偶发报「未读取」，改文件优先写临时脚本做字符串 replace（TS/Python 同此）；同一轮内先 Read 过的文件可直接 Edit。
- PowerShell here-string 里写 JS 模板串/反引号会被吞，插入含模板串的代码块改用字符串拼接。
- 跨目录相对 import 数层数：EditorView 在 src/renderer/src/views/，shared 是 ../../../shared；其子目录 editor/ 下要再深一层 ../../../../shared。
- 页面脚本字符串里正则要双反斜杠（模板串转义）：\s 写 \\s，\. 写 \\.。
- lint 有基线告警（EditorView.tsx:134 setState-in-effect、env.d.ts:13 FlowSummary 未用等），非本轮引入，修复前先确认。

完成后按 §4 模板落盘 docs/handoff/32-M4-3-XXX.md、更新 INDEX.md 与本文件，并生成下一对话开场白。
```
