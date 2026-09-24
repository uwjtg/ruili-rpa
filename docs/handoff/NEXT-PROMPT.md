# 下一个对话开场白

> 在新对话开头复制粘贴下面整段即可无缝接力。

```
继续锐流 RPA M3 切片 4（智能录制重放闭环 / 或按 §6 优先级自选）开发。请先读：
1) docs\锐流RPA-V3-接力开发模式说明.md
2) docs\锐流RPA-V3-开发计划书.md
3) docs\handoff\INDEX.md
4) docs\handoff\14-M3 - 切片 3 - 智能录制POC.md（上一切片，最新）
5) docs\handoff\13-M3 - 切片 2 - 选择器回退链与元素库.md
6) docs\handoff\12-M3-切片1-桌面拾取POC.md
7) docs\锐流RPA-开发交接文档.md（§5 编辑器交互清单、§7 边界）

当前基线：
- M3 切片 1/2/3 全部完成并落盘（桌面拾取 POC / 选择器回退链 strict→property→ancestor→index→coords + 元素库 / 智能录制 POC：观察式事件流→click/typeText/scroll 指令 + 录制即入库 + 编辑器「录制」按钮与录制态 + locate_element dry-run 校验）。
- 验证全绿：pytest 54/54（录制 19 例 + pick dry-run 3 例 + 事件时前台/祖先查找回归）、vitest 18 文件 98 用例、typecheck 0 错、electron-vite build 通过（renderer 821.94 kB）、license 无新增禁用。
- GUI 端到端闭环验证过：录制→点任务栏「开始」+输入 abc+滚动→停止→流程 7 步（pickElement 真实签名 开始/ButtonControl/任务栏 + typeText(abc) + scroll(+120)）+ 元素库自动入库。
- 主进程 IPC：run:、registry:list、llm:、flow:、pick:start/stop、elements:list/delete/verify、record:start/stop。
- 数据库 %APPDATA%\ruili-rpa\ruili.db；元素去重 key=windowHandle|automationId|name|controlType。
- sidecar 协议：/pick/start(阻塞120s)/stop、/desktop/click_element→{ok,strategy}、/record/start|stop、/desktop/type_text、/desktop/scroll、/desktop/locate_element→{ok,found,strategy}。
- 聚合阈值：CLICK_DEBOUNCE_MS=350/10px、TYPING_GAP_MS=800、SCROLL_GAP_MS=400、COORDS_CLICK_SIZE=8；指令 {id:"r{n}",kind,cmdId,label,params,ts}。
- Git 基线已齐：切片1/2 (6e6f3b7)、切片3 (9082717)。
- 冒烟留存：.runtime/smoke_record.py（sidecar 链路）、gui_smoke_record.py（GUI 闭环）、diag_record_keys.py、probe_taskbar.py、smoke_fallback.py、smoke_pick_chain.py、gui_smoke_fallback.py。

下一步（切片 4，按切片 3 §6 优先级第 1 位）：
- 录制重放闭环：把录制出的 pickElement/typeText/scroll 步骤直接运行，验证「录→存→跑」闭环（运行时已接好），处理指令顺序与目标窗口切换问题。
- 可选并行（§6 其余）：录制过滤增强（按窗口句柄圈定目标窗口、非文本键指令落盘）；元素库校验失败原因展示；聚合阈值真实场景校准。

关键约束：
- 环境 Windows 桌面，PowerShell（不用 Bash），node 22.23.2，Electron 44，npm 镜像 npmmirror；better-sqlite3 v13 NAPI 免 rebuild；RunWireEvent 形状从未改动。
- 项目根：C:\Users\Administrator\Desktop\1\ruili-rpa
- sidecar Python：C:\Users\Administrator\AppData\Local\Doubao\User Data\sandbox_runtime\bases\c98c5042338ed152c6f10ecd8591889f\python\python.exe（已装 uiautomation）；主进程用 python spawn（已在 PATH）。

勿重试方向（切片 3 沉淀，均为已验证死路）：
- computer_use_tool GUI 操作（PIP 初始化失败）；overlay 穿透在 root.update() 后设置；钩子装 tk mainloop 线程；遮罩全透明透传（判断拾取/录制用 picker.is_picking()）。
- GUI 自动点击必须 SetForegroundWindow 置前 + GetWindowRect 实时相对坐标（窗口位置会漂移；豆包侧边栏会遮挡窗口左侧）；冒烟进程必须 SetProcessDpiAwareness(2)（否则 rect 与截图像素坐标系不一致）。
- 录制聚合的 key 过滤与 click/scroll 元素解析必须用「事件发生时」捕获的 前台PID/签名（stop 聚合时 UI 状态已变会误判）；钩子线程做 UIA 必须先 CoInitializeEx。
- 停止录制后等 autosave（dirty 后 3s）再查 DB。

完成后按 §4 模板落盘 docs/handoff/15-M3 - 切片 4-XXX.md、更新 INDEX.md 与本文件，并生成下一对话开场白。
```
