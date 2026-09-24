# 下一个对话开场白

> 在新对话开头复制粘贴下面整段即可无缝接力。

```
继续锐流 RPA M3 切片 12（阈值设置面板+持久化 / 或按切片 11 §6 优先级自选）开发。请先读：
1) docs\锐流RPA-V3-接力开发模式说明.md
2) docs\锐流RPA-V3-开发计划书.md
3) docs\handoff\INDEX.md
4) docs\handoff\22-M3 - 切片 11 - 坐标滚动量参数化.md（上一切片，最新）
5) docs\handoff\21-M3 - 切片 10 - 运行前变量填写对话框.md
6) docs\handoff\20-M3 - 切片 9 - 录制流程参数化.md
7) docs\锐流RPA-开发交接文档.md（§5 编辑器交互清单、§7 边界）

当前基线：
- M3 切片 1-11 全部完成并落盘。
- 验证全绿：pytest 75/75、vitest 20 文件 112 用例、typecheck 0、build renderer 829.06 kB、license 无新增禁用。
- 录→存→跑闭环：.runtime/smoke_replay.py 记事本回读 'line one\r\nline two' PASS。
- pressKey；click_element(retries=2)；圈定录制 target_pid；/desktop/window_pid；坐标兜底 windowBoundingBox 偏移；/record/start thresholds。
- 录制参数化（切片 9/11）：record-params.ts 把 typeText 文本抽成 inputN 字符串变量、scroll 的 delta/x/y 抽成 scrollDelta/scrollX/scrollY 数值变量；runner 对插值字段先 interpolate 再转数字。
- 运行前填值（切片 10）：run-overrides.ts 按类型合并；点运行时 flow.vars 非空弹窗填值后再跑。
- sidecar 协议：/pick/start|stop、/desktop/click_element(+retries)、/desktop/type_text、/desktop/scroll、/desktop/locate_element(+trace)、/desktop/press_key、/desktop/window_pid、/record/start(+target_pid,+thresholds)|stop。
- 流程 AST：FlowDoc{version,name,vars:FlowVar[],steps:StepNode[]}；FlowVar{name,type,value}。
- DB %APPDATA%\ruili-rpa\ruili.db；元素去重 key=windowHandle|automationId|name|controlType。
- Git 基线：切片10 (6b93674)、切片11 (本次提交)。
- 冒烟留存：.runtime/smoke_record.py、smoke_replay.py、gui_smoke_record.py、smoke_fallback.py、smoke_pick_chain.py、diag_record_keys.py、probe_taskbar.py。

下一步（切片 12，按切片 11 §6 优先级）：
1. 阈值设置面板 + 持久化：编辑器里调录制聚合阈值（click_debounce/typing_gap/scroll_gap）并落盘，录制时自动带上，免去每次传 thresholds。
2. 坐标兜底运行层加固：点击前 SetForegroundWindow 置前（避免被遮挡点空）。
3. 变量弹窗增强：必填标记、变量说明、上次值记忆。
4. 点击 boundingBox 内 JSON 插值参数化。

关键约束：
- 环境 Windows 桌面，PowerShell（不用 Bash），node 22.23.2，Electron 44，npm 镜像 npmmirror；better-sqlite3 v13 NAPI 免 rebuild；RunWireEvent 形状从未改动。
- 项目根：C:\Users\Administrator\Desktop\1\ruili-rpa
- sidecar Python：C:\Users\Administrator\AppData\Local\Doubao\User Data\sandbox_runtime\bases\c98c5042338ed152c6f10ecd8591889f\python\python.exe（已装 uiautomation）；主进程用 python spawn（已在 PATH）。

勿重试方向（切片 1-11 沉淀，均为已验证死路）：
- computer_use_tool GUI 操作（PIP 初始化失败）；overlay 穿透在 root.update() 后设置；钩子装 tk mainloop 线程；遮罩全透明透传（判断拾取/录制用 picker.is_picking()）。
- GUI 自动点击必须 SetForegroundWindow 置前 + GetWindowRect 实时相对坐标；冒烟进程必须 SetProcessDpiAwareness(2)。
- 录制聚合的 key 过滤与 click/scroll 元素解析必须用「事件发生时」捕获的前台PID/签名；钩子线程做 UIA 必须先 CoInitializeEx；独立侧起 sidecar 首个 HTTP UIA 调用已由 ensure_com_thread 处理。
- 停止录制后等 autosave（dirty 后 3s）再查 DB。
- Shift 不能算快捷键修饰键；仅 Control/Alt/Win 触发 pressKey 合并。
- 改带默认参数的方法签名后同步测试 fake；改 element_to_dict 全字段后同步 exact-dict 断言。
- PowerShell git 提交信息勿含 ${} 字面（会被当变量解析）。
- 本 session Edit/Write 对源码偶发报「未读取」，改文件优先写 .runtime/_p*.py 临时脚本做字符串 replace 再删除。

完成后按 §4 模板落盘 docs/handoff/23-M3 - 切片 12-XXX.md、更新 INDEX.md 与本文件，并生成下一对话开场白。
```
