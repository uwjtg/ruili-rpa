# 下一个对话开场白

> 在新对话开头复制粘贴下面整段即可无缝接力。

```
继续锐流 RPA M3 切片 6（窗口句柄圈定录制范围 / 或按切片 5 §6 优先级自选）开发。请先读：
1) docs\锐流RPA-V3-接力开发模式说明.md
2) docs\锐流RPA-V3-开发计划书.md
3) docs\handoff\INDEX.md
4) docs\handoff\16-M3 - 切片 5 - 回放稳定性.md（上一切片，最新）
5) docs\handoff\15-M3 - 切片 4 - 录制重放闭环与pressKey.md
6) docs\handoff\14-M3 - 切片 3 - 智能录制POC.md
7) docs\锐流RPA-开发交接文档.md（§5 编辑器交互清单、§7 边界）

当前基线：
- M3 切片 1/2/3/4/5 全部完成并落盘。
- 验证全绿：pytest 65/65、vitest 18 文件 102 用例、typecheck 0 错、electron-vite build 通过（renderer 822.64 kB）、license 无新增禁用。
- 录→存→跑闭环：.runtime/smoke_replay.py 记事本回读 'line one\r\nline two' PASS。
- pressKey 非文本键/快捷键：POST /desktop/press_key {keys}；录制聚合 Control/Alt/Win+主键合并，Shift 透明走文本。
- 回放稳定性（切片 5）：click_element(target, retries=2) 未命中自动重试，每次重跑 locate_element（窗口句柄失效自动按 windowTitle 重取窗口），失败消息带逐级 trace；pickElement 指令新增 retries 参数（默认 2，钳制 0-5）。
- locate 校验失败原因：POST /desktop/locate_element → {ok,found,strategy,trace:[…]}，ElementPanel 失败红框展示。
- sidecar 协议：/pick/start|stop、/desktop/click_element(+retries)、/record/start|stop、/desktop/type_text、/desktop/scroll、/desktop/locate_element、/desktop/press_key。
- 主进程 IPC：run:、registry:list、llm:、flow:、pick:start/stop、elements:list/delete/verify、record:start/stop。
- DB %APPDATA%\ruili-rpa\ruili.db；元素去重 key=windowHandle|automationId|name|controlType。
- Git 基线：切片4 (02251a4)、切片5 (本次提交)。
- 冒烟留存：.runtime/smoke_record.py、smoke_replay.py、gui_smoke_record.py、smoke_fallback.py、smoke_pick_chain.py、diag_record_keys.py、probe_taskbar.py。

下一步（切片 6，按切片 5 §6 优先级）：
1. 窗口句柄圈定录制范围 + 目标 PID 过滤：录制前用 /pick/start 让用户点选目标窗口，取其顶层窗口 PID，record:start 接受 target_pid，录制钩子只保留该 PID 的事件（而非只排除自身）。需 UI 一步「选择录制窗口」。
2. 坐标兜底加固：回放 coords 点击前按窗口标题重定位窗口，把旧 boundingBox 换算到新偏移；或对纯坐标签名提示重拾取。
3. 聚合阈值校准：录真实操作人工核对后调 CLICK_DEBOUNCE/TYPING_GAP/SCROLL_GAP，做成可配置。
4. 录制流程参数化：把录制出的字面文本/坐标暴露为可改变量。

关键约束：
- 环境 Windows 桌面，PowerShell（不用 Bash），node 22.23.2，Electron 44，npm 镜像 npmmirror；better-sqlite3 v13 NAPI 免 rebuild；RunWireEvent 形状从未改动。
- 项目根：C:\Users\Administrator\Desktop\1\ruili-rpa
- sidecar Python：C:\Users\Administrator\AppData\Local\Doubao\User Data\sandbox_runtime\bases\c98c5042338ed152c6f10ecd8591889f\python\python.exe（已装 uiautomation）；主进程用 python spawn（已在 PATH）。

勿重试方向（切片 1-5 沉淀，均为已验证死路）：
- computer_use_tool GUI 操作（PIP 初始化失败）；overlay 穿透在 root.update() 后设置；钩子装 tk mainloop 线程；遮罩全透明透传（判断拾取/录制用 picker.is_picking()）。
- GUI 自动点击必须 SetForegroundWindow 置前 + GetWindowRect 实时相对坐标（窗口位置会漂移；豆包侧边栏会遮挡窗口左侧）；冒烟进程必须 SetProcessDpiAwareness(2)。
- 录制聚合的 key 过滤与 click/scroll 元素解析必须用「事件发生时」捕获的前台PID/签名；钩子线程做 UIA 必须先 CoInitializeEx；独立侧起 sidecar 后首个 HTTP UIA 调用已由 ensure_com_thread 处理，勿在外层重复 CoInitialize。
- 停止录制后等 autosave（dirty 后 3s）再查 DB。
- Shift 不能算快捷键修饰键（会丢大写文本）；仅 Control/Alt/Win 触发 pressKey 合并。
- 改 click_element 等带默认参数的方法签名后，记得同步测试 fake 的签名（**_kw 兼容）。

完成后按 §4 模板落盘 docs/handoff/17-M3 - 切片 6-XXX.md、更新 INDEX.md 与本文件，并生成下一对话开场白。
```
