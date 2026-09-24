# 下一个对话开场白

> 在新对话开头复制粘贴下面整段即可无缝接力。

```
继续锐流 RPA M3 切片 5（窗口句柄圈定录制 + 回放稳定性 / 或按切片 4 §6 优先级自选）开发。请先读：
1) docs\锐流RPA-V3-接力开发模式说明.md
2) docs\锐流RPA-V3-开发计划书.md
3) docs\handoff\INDEX.md
4) docs\handoff\15-M3 - 切片 4 - 录制重放闭环与pressKey.md（上一切片，最新）
5) docs\handoff\14-M3 - 切片 3 - 智能录制POC.md
6) docs\handoff\13-M3 - 切片 2 - 选择器回退链与元素库.md
7) docs\锐流RPA-开发交接文档.md（§5 编辑器交互清单、§7 边界）

当前基线：
- M3 切片 1/2/3/4 全部完成并落盘（桌面拾取 POC / 选择器回退链 + 元素库 / 智能录制 POC / 录制重放闭环 + pressKey 非文本键指令 + locate 校验失败原因 trace）。
- 验证全绿：pytest 61/61、vitest 18 文件 102 用例、typecheck 0 错、electron-vite build 通过（renderer 822.64 kB）、license 无新增禁用。
- 录→存→跑闭环已验证：.runtime/smoke_replay.py 自起 sidecar + 记事本，按录制指令形状回放 pickElement(命中 strategy=property)→typeText("line one")→pressKey(Enter)→typeText("line two")，UIA ValuePattern 读回全文 = 'line one\r\nline two'，Enter 真换行，PASS。
- pressKey 已落盘回放：POST /desktop/press_key {keys:"Enter"|"Control+A"|"Ctrl+Shift+S"}；录制聚合里 Control/Alt/Win 按住+主键合并为一条 pressKey，Shift 透明走文本段。
- locate 校验失败原因：POST /desktop/locate_element → {ok,found,strategy,trace:[…]}，元素库「校验」失败时 UI 红框逐行展示窗口/strict/property/ancestor/index/coords 各级尝试。
- 主进程 IPC：run:、registry:list、llm:、flow:、pick:start/stop、elements:list/delete/verify、record:start/stop。
- sidecar 协议：/pick/start(阻塞120s)/stop、/desktop/click_element、/record/start|stop、/desktop/type_text、/desktop/scroll、/desktop/locate_element、/desktop/press_key。
- 聚合阈值：CLICK_DEBOUNCE_MS=350/10px、TYPING_GAP_MS=800、SCROLL_GAP_MS=400、COORDS_CLICK_SIZE=8。
- 数据库 %APPDATA%\ruili-rpa\ruili.db；元素去重 key=windowHandle|automationId|name|controlType。
- Git 基线已齐：切片1/2 (6e6f3b7)、切片3 (9082717)、切片4 (f7a530f)。
- 冒烟留存：.runtime/smoke_record.py（录制）、smoke_replay.py（回放闭环）、gui_smoke_record.py、smoke_fallback.py、smoke_pick_chain.py、diag_record_keys.py、probe_taskbar.py。

下一步（切片 5，按切片 4 §6 优先级）：
1. 窗口句柄圈定录制范围 + 目标窗口 PID 过滤：录制开始时圈定用户选定窗口（不再只排除自身），消除误录其它窗口噪声；与「录制范围」待拍板项一起定。
2. 回放稳定性：回放 pickElement 前 dry-run locate_element 预检；失败按 N 次重试 + 重取窗口句柄（切片 2 §7 挂账）。
3. 聚合阈值真实场景校准：录一段真实操作人工核对后调 CLICK_DEBOUNCE/TYPING_GAP/SCROLL_GAP，可考虑做成可配置（按应用模板）。
4. 录制流程参数化：把录制出的字面文本/坐标暴露为可改参数（变量化），而非仅落字面量。

关键约束：
- 环境 Windows 桌面，PowerShell（不用 Bash），node 22.23.2，Electron 44，npm 镜像 npmmirror；better-sqlite3 v13 NAPI 免 rebuild；RunWireEvent 形状从未改动。
- 项目根：C:\Users\Administrator\Desktop\1\ruili-rpa
- sidecar Python：C:\Users\Administrator\AppData\Local\Doubao\User Data\sandbox_runtime\bases\c98c5042338ed152c6f10ecd8591889f\python\python.exe（已装 uiautomation）；主进程用 python spawn（已在 PATH）。

勿重试方向（切片 1-4 沉淀，均为已验证死路）：
- computer_use_tool GUI 操作（PIP 初始化失败）；overlay 穿透在 root.update() 后设置；钩子装 tk mainloop 线程；遮罩全透明透传（判断拾取/录制用 picker.is_picking()）。
- GUI 自动点击必须 SetForegroundWindow 置前 + GetWindowRect 实时相对坐标（窗口位置会漂移；豆包侧边栏会遮挡窗口左侧）；冒烟进程必须 SetProcessDpiAwareness(2)（否则 rect 与截图像素坐标系不一致）。
- 录制聚合的 key 过滤与 click/scroll 元素解析必须用「事件发生时」捕获的 前台PID/签名（stop 聚合时 UI 状态已变会误判）；钩子线程做 UIA 必须先 CoInitializeEx。
- 独立侧起 sidecar 后，首个 HTTP UIA 调用必须在工作线程 CoInitialize（已由 desktop_pick.ensure_com_thread 处理；勿在 do_POST 外层重复 CoInitialize 造成引用计数泄漏）。
- 停止录制后等 autosave（dirty 后 3s）再查 DB。
- Shift 不能算快捷键修饰键（会丢大写文本）；仅 Control/Alt/Win 触发 pressKey 合并。

完成后按 §4 模板落盘 docs/handoff/16-M3 - 切片 5-XXX.md、更新 INDEX.md 与本文件，并生成下一对话开场白。
```
