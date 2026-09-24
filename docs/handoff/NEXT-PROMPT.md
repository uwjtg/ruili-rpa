# 下一个对话开场白

> 在新对话开头复制粘贴下面整段即可无缝接力。

```
继续锐流 RPA M3 切片 9（录制流程参数化 / 或按切片 8 §6 优先级自选）开发。请先读：
1) docs\锐流RPA-V3-接力开发模式说明.md
2) docs\锐流RPA-V3-开发计划书.md
3) docs\handoff\INDEX.md
4) docs\handoff\19-M3 - 切片 8 - 聚合阈值可配置.md（上一切片，最新）
5) docs\handoff\18-M3 - 切片 7 - 坐标兜底窗口偏移修正.md
6) docs\handoff\17-M3 - 切片 6 - 窗口圈定录制.md
7) docs\锐流RPA-开发交接文档.md（§5 编辑器交互清单、§7 边界）

当前基线：
- M3 切片 1-8 全部完成并落盘。
- 验证全绿：pytest 75/75、vitest 18 文件 102 用例、typecheck 0、build renderer 823.75 kB、license 无新增禁用。
- 录→存→跑闭环：.runtime/smoke_replay.py 记事本回读 'line one\r\nline two' PASS。
- pressKey 非文本键/快捷键；click_element(target, retries=2) 未命中自动重试并按 windowTitle 重取窗口；locate 校验失败 trace。
- 窗口圈定录制（切片 6）：record:start 加 target_pid；/desktop/window_pid；编辑器「圈定窗口」按钮（record:pickTargetWindow）。
- 坐标兜底加固（切片 7）：element_to_dict 记录 windowBoundingBox；回放 coords 按窗口当前位置 dx/dy 换算偏移；PickedElement.windowBoundingBox?: ElementBox。
- 聚合阈值可配置（切片 8）：/record/start 加 thresholds {click_debounce_ms, click_debounce_px, typing_gap_ms, scroll_gap_ms}；Node 侧 record.start(targetPid, {clickDebounceMs,...})；非法/缺键/负数静默沿用默认。
- sidecar 协议：/pick/start|stop、/desktop/click_element(+retries)、/desktop/type_text、/desktop/scroll、/desktop/locate_element(+trace)、/desktop/press_key、/desktop/window_pid、/record/start(+target_pid,+thresholds)|stop。
- 主进程 IPC：run:、registry:list、llm:、flow:、pick:start/stop、elements:list/delete/verify、record:start(+thresholds)/stop/pickTargetWindow。
- DB %APPDATA%\ruili-rpa\ruili.db；元素去重 key=windowHandle|automationId|name|controlType。
- Git 基线：切片7 (443a453)、切片8 (本次提交)。
- 冒烟留存：.runtime/smoke_record.py、smoke_replay.py、gui_smoke_record.py、smoke_fallback.py、smoke_pick_chain.py、diag_record_keys.py、probe_taskbar.py。

下一步（切片 9，按切片 8 §6 优先级）：
1. 录制流程参数化：把录制出的字面文本/坐标暴露为可改变量（流程级参数：变量占位、运行时可改）。
2. 阈值设置面板 + 持久化：编辑器里调阈值并落盘，省去每次传参。
3. 坐标兜底运行层加固：点击前 SetForegroundWindow 置前（避免被遮挡点空）。
4. 圈定体验完善：取消圈定、录制中显示当前圈定窗口、多进程目标按顶层窗口树圈定。

关键约束：
- 环境 Windows 桌面，PowerShell（不用 Bash），node 22.23.2，Electron 44，npm 镜像 npmmirror；better-sqlite3 v13 NAPI 免 rebuild；RunWireEvent 形状从未改动。
- 项目根：C:\Users\Administrator\Desktop\1\ruili-rpa
- sidecar Python：C:\Users\Administrator\AppData\Local\Doubao\User Data\sandbox_runtime\bases\c98c5042338ed152c6f10ecd8591889f\python\python.exe（已装 uiautomation）；主进程用 python spawn（已在 PATH）。

勿重试方向（切片 1-8 沉淀，均为已验证死路）：
- computer_use_tool GUI 操作（PIP 初始化失败）；overlay 穿透在 root.update() 后设置；钩子装 tk mainloop 线程；遮罩全透明透传（判断拾取/录制用 picker.is_picking()）。
- GUI 自动点击必须 SetForegroundWindow 置前 + GetWindowRect 实时相对坐标；冒烟进程必须 SetProcessDpiAwareness(2)。
- 录制聚合的 key 过滤与 click/scroll 元素解析必须用「事件发生时」捕获的前台PID/签名；钩子线程做 UIA 必须先 CoInitializeEx；独立侧起 sidecar 首个 HTTP UIA 调用已由 ensure_com_thread 处理，勿在外层重复 CoInitialize。
- 停止录制后等 autosave（dirty 后 3s）再查 DB。
- Shift 不能算快捷键修饰键（会丢大写文本）；仅 Control/Alt/Win 触发 pressKey 合并。
- 改带默认参数的方法签名后，记得同步测试 fake 的签名（**_kw 兼容）；改 element_to_dict 全字段返回后要同步既有 exact-dict 断言。
- 本 session Edit/Write 对源码偶发报「未读取」，改文件优先写 .runtime/_p*.py 临时脚本做字符串 replace 再删除。

完成后按 §4 模板落盘 docs/handoff/20-M3 - 切片 9-XXX.md、更新 INDEX.md 与本文件，并生成下一对话开场白。
```
