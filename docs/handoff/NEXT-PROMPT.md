# 下一个对话开场白

> 在新对话开头复制粘贴下面整段即可无缝接力。

```
继续锐流 RPA M3 后续开发（M3 剩余可选项 / 或 M4 数据抓取向导，按 §6 建议自选）开发。请先读：
1) docs\锐流RPA-V3-接力开发模式说明.md
2) docs\锐流RPA-V3-开发计划书.md
3) docs\handoff\INDEX.md
4) docs\handoff\29-M3 - 切片 18 - 置前短延时开关.md（最新）
5) docs\handoff\28-M3 - 切片 17 - 流程级录制阈值覆盖.md
6) docs\handoff\27-M3 - 切片 16 - 控件路径点击统一置前.md
7) docs\handoff\26-M3 - 切片 15 - 点击 boundingBox 参数化.md
8) docs\handoff\25-M3 - 切片 14 - 变量弹窗增强.md
9) docs\锐流RPA-开发交接文档.md（§5 编辑器交互清单、§7 边界）

当前基线：
- M3 切片 1-18 全部完成并落盘；M3 计划内 + 全部可选项已清空，M3 正式收尾。
- 验证全绿：pytest 84/84、vitest 21 文件 130 用例、typecheck 0、build renderer 848.67 kB、license 无新增禁用。
- 录→存→跑闭环：.runtime/smoke_replay.py 记事本回读 'line one\r\nline two' PASS。
- 切片 13/16 置前：click_element 控件+坐标兜底点击前统一 _bring_foreground(hwnd)（SW_RESTORE + AttachThreadInput）；locate 各返回带 window_handle；smoke_bring_foreground.py 真实记事本置前 PASS。
- 切片 14 变量弹窗：FlowVar 增 required/description；missingRequiredOverrides 纯函数；弹窗必填拦截+说明+localStorage 上次值记忆（ruili.runOverrides.flow.<id>/name.<name>）。
- 切片 15 点击参数化：record-params.ts parameterizeClickBox 抽 boundingBox.x/y 为 clickX/clickY 变量，有抽取时 target 转插值 JSON 字符串（runner 先 interpolate 再 parse；sidecar _valid_box int() 规整数字字符串）。
- 切片 12 阈值持久化：settings 表 + 「设置」页签；RecordController.start 以 DB 为 base 合并。
- 切片 9/11 录制参数化：inputN / scrollDelta/scrollX/scrollY 变量（均带 description）。
- sidecar 协议：/pick/start|stop、/desktop/click_element(+retries)、/desktop/type_text、/desktop/scroll、/desktop/locate_element(+trace)、/desktop/press_key、/desktop/window_pid、/record/start(+target_pid,+thresholds)|stop。
- 流程 AST：FlowDoc{version,name,vars:FlowVar[],steps:StepNode[]}；FlowVar{name,type,value,required?,description?}。
- DB %APPDATA%\ruili-rpa\ruili.db；元素去重 key=windowHandle|automationId|name|controlType。
- Git 基线：切片15 (ccbf117)、切片16 (8ee1df4)、切片17 (dc14c88)、切片18 (3fb91b9)。
- 冒烟留存：.runtime/smoke_record.py、smoke_replay.py、smoke_bring_foreground.py、gui_smoke_record.py、smoke_fallback.py、smoke_pick_chain.py、diag_record_keys.py、probe_taskbar.py。

下一步建议（M3 已全部收尾，仅 M4 方向，按优先级）：
1. （M4）数据抓取向导 V1：表格识别/字段映射/导出（计划书 M3 范围「数据抓取」）。
2. （M4）浏览器录制器（CDP）与 10 站基准用例集。
注：M3 切片 1-18 全部完成；M3 计划内实质项与全部可选项均已清空，下一阶段建议直接开 M4。

关键约束：
- 环境 Windows 桌面，PowerShell（不用 Bash），node 22.23.2，Electron 44，npm 镜像 npmmirror；better-sqlite3 v13 NAPI 免 rebuild；RunWireEvent 形状从未改动。
- 项目根：C:\Users\Administrator\Desktop\1\ruili-rpa
- sidecar Python：C:\Users\Administrator\AppData\Local\Doubao\User Data\sandbox_runtime\bases\c98c5042338ed152c6f10ecd8591889f\python\python.exe（已装 uiautomation）；主进程用 python spawn（已在 PATH）。

勿重试方向（切片 1-16 沉淀，均为已验证死路）：
- computer_use_tool GUI 操作（PIP 初始化失败）；overlay 穿透在 root.update() 后设置；钩子装 tk mainloop 线程；遮罩全透明透传（判断拾取/录制用 picker.is_picking()）。
- GUI 自动点击必须 SetForegroundWindow 置前 + GetWindowRect 实时相对坐标；冒烟进程必须 SetProcessDpiAwareness(2)。
- 录制聚合的 key 过滤与 click/scroll 元素解析必须用「事件发生时」捕获的前台PID/签名；钩子线程做 UIA 必须先 CoInitializeEx；独立侧起 sidecar 首个 HTTP UIA 调用已由 ensure_com_thread 处理。
- 停止录制后等 autosave（dirty 后 3s）再查 DB。
- Shift 不能算快捷键修饰键；仅 Control/Alt/Win 触发 pressKey 合并。
- 改带默认参数的方法签名后同步测试 fake；改 element_to_dict 全字段后同步 exact-dict 断言；改 FlowVar/变量结构后同步 exact-dict 测试（含 description 字段）。
- PowerShell git 提交信息勿含 ${} 字面（会被当变量解析）。
- 本 session Edit/Write 对源码偶发报「未读取」，改文件优先写 .runtime/_p*.py 临时脚本做字符串 replace 再删除（TS/Python 同此）；同一轮内先 Read 过的文件可直接 Edit。
- lint 有基线告警（EditorView.tsx:134 setState-in-effect、env.d.ts:13 FlowSummary 未用等），非本轮引入，修复前先确认。

完成后按 §4 模板落盘 docs/handoff/30-M4-1-XXX.md、更新 INDEX.md 与本文件，并生成下一对话开场白。
```
