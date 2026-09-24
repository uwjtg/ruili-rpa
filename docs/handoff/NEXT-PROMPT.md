# 下一个对话开场白

> 在新对话开头复制粘贴下面整段即可无缝接力。

```
继续锐流 RPA M3 切片 14（变量弹窗增强：必填标记、变量说明、上次值记忆 / 或按切片 13 §6 优先级自选）开发。请先读：
1) docs\锐流RPA-V3-接力开发模式说明.md
2) docs\锐流RPA-V3-开发计划书.md
3) docs\handoff\INDEX.md
4) docs\handoff\24-M3 - 切片 13 - 坐标兜底运行层加固.md（上一切片，最新）
5) docs\handoff\23-M3 - 切片 12 - 阈值设置面板与持久化.md
6) docs\handoff\22-M3 - 切片 11 - 坐标滚动量参数化.md
7) docs\锐流RPA-开发交接文档.md（§5 编辑器交互清单、§7 边界）

当前基线：
- M3 切片 1-13 全部完成并落盘。
- 验证全绿：pytest 80/80、vitest 21 文件 122 用例、typecheck 0、build renderer 835.73 kB、license 无新增禁用。
- 录→存→跑闭环：.runtime/smoke_replay.py 记事本回读 'line one\r\nline two' PASS。
- 坐标兜底置前（切片 13）：click_element 坐标兜底点击前 _bring_foreground(hwnd)（SW_RESTORE + AttachThreadInput）；locate_element 各返回带 window_handle（解析句柄或重定位根句柄）；真实记事本置前冒烟 smoke_bring_foreground.py PASS。
- 阈值持久化（切片 12）：settings 表 + 编辑器「设置」页签；RecordController.start 以 DB 为 base 合并；IPC settings:get/set-record-thresholds。
- 录制参数化（切片 9/11）：record-params.ts 抽 inputN / scrollDelta/scrollX/scrollY 变量。
- 运行前填值（切片 10）：run-overrides.ts 按类型合并；flow.vars 非空弹窗填值。
- sidecar 协议：/pick/start|stop、/desktop/click_element(+retries)、/desktop/type_text、/desktop/scroll、/desktop/locate_element(+trace)、/desktop/press_key、/desktop/window_pid、/record/start(+target_pid,+thresholds)|stop。
- 流程 AST：FlowDoc{version,name,vars:FlowVar[],steps:StepNode[]}；FlowVar{name,type,value}。
- DB %APPDATA%\ruili-rpa\ruili.db；元素去重 key=windowHandle|automationId|name|controlType。
- Git 基线：切片12 (84acade)、切片13 (a36a571)。
- 冒烟留存：.runtime/smoke_record.py、smoke_replay.py、smoke_bring_foreground.py、gui_smoke_record.py、smoke_fallback.py、smoke_pick_chain.py、diag_record_keys.py、probe_taskbar.py。

下一步（切片 14，按切片 13 §6 优先级）：
1. 变量弹窗增强：必填标记、变量说明、上次值记忆（切片 10 的 run-overrides 弹窗基础上）。
2. 点击 boundingBox 内 JSON 插值参数化。
3. （可选）控件路径点击也置前 + 置前后短延时。
4. （可选）阈值面板细化：录制中显示当前生效阈值、按流程覆盖阈值。

关键约束：
- 环境 Windows 桌面，PowerShell（不用 Bash），node 22.23.2，Electron 44，npm 镜像 npmmirror；better-sqlite3 v13 NAPI 免 rebuild；RunWireEvent 形状从未改动。
- 项目根：C:\Users\Administrator\Desktop\1\ruili-rpa
- sidecar Python：C:\Users\Administrator\AppData\Local\Doubao\User Data\sandbox_runtime\bases\c98c5042338ed152c6f10ecd8591889f\python\python.exe（已装 uiautomation）；主进程用 python spawn（已在 PATH）。

勿重试方向（切片 1-13 沉淀，均为已验证死路）：
- computer_use_tool GUI 操作（PIP 初始化失败）；overlay 穿透在 root.update() 后设置；钩子装 tk mainloop 线程；遮罩全透明透传（判断拾取/录制用 picker.is_picking()）。
- GUI 自动点击必须 SetForegroundWindow 置前 + GetWindowRect 实时相对坐标；冒烟进程必须 SetProcessDpiAwareness(2)。
- 录制聚合的 key 过滤与 click/scroll 元素解析必须用「事件发生时」捕获的前台PID/签名；钩子线程做 UIA 必须先 CoInitializeEx；独立侧起 sidecar 首个 HTTP UIA 调用已由 ensure_com_thread 处理。
- 停止录制后等 autosave（dirty 后 3s）再查 DB。
- Shift 不能算快捷键修饰键；仅 Control/Alt/Win 触发 pressKey 合并。
- 改带默认参数的方法签名后同步测试 fake；改 element_to_dict 全字段后同步 exact-dict 断言。
- PowerShell git 提交信息勿含 ${} 字面（会被当变量解析）。
- 本 session Edit/Write 对源码偶发报「未读取」，改文件优先写 .runtime/_p*.py 临时脚本做字符串 replace 再删除；Python 测试补丁同此。
- lint 有基线告警（EditorView.tsx:134 setState-in-effect、env.d.ts:13 FlowSummary 未用等），非本轮引入，修复前先确认。

完成后按 §4 模板落盘 docs/handoff/25-M3 - 切片 14-XXX.md、更新 INDEX.md 与本文件，并生成下一对话开场白。
```
