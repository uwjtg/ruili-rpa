# M3 · 切片 4：录制重放闭环「录→存→跑」+ 非文本键指令 + 校验失败原因

> 接力开发交接文档 · 版本 V3 原型
>
> - 切片：M3 切片 4（录制重放闭环：录制出的指令可真实回放；并行增量 pressKey 非文本键指令 + locate trace 校验失败原因）
> - 依赖切片：[14-M3 - 切片 3 - 智能录制POC](./14-M3%20-%20切片%203%20-%20智能录制POC.md)
> - 状态：**已完成并验证**（pytest 61/61、vitest 18 文件 102/102、typecheck 0、build renderer 822.64 kB、license 无新增禁用、sidecar 真实回放闭环冒烟 PASS）
> - 落盘日期：2026-09-24

---

## 1. 切片目标

按切片 3 交接文档 §6 优先级第 1 位，打通**录制重放闭环「录→存→跑」**：切片 3 已证明
「录→存」（观察式录制聚合为 click→pickElement / type→typeText / scroll→scroll 指令并入库），
本切片证明这些**录制出的指令形状可真实回放并产生可验证效果**，并补齐两个直接影响闭环可用性的缺口：

1. **非文本键指令 `pressKey`**（切片 3 §5.4 挂账）：此前 Enter/Backspace/快捷键只截断文本段、
   不落盘——录制出的流程无法还原「按 Enter 提交」类操作。本切片让非文本键落盘为 `pressKey`
   指令（支持 `Enter` / `Tab` / `Control+A` / `Ctrl+Shift+S` 等），快捷键自动合并；
2. **校验失败原因 trace**（切片 3 §6.3）：`locate_element` 逐级返回定位报告，元素库「校验」
   失败时展示每一级的尝试结果（窗口句柄是否失效、strict/property/ancestor/index 是否命中）；
3. **回放闭环真实冒烟**：用记事本验证 `pickElement→typeText→pressKey(Enter)→typeText`
   这串录制指令形状回放后，记事本文本确实按预期分行写入。

**顺带修复**：HTTP 处理线程首次碰 UIA 未初始化 COM（`CO_E_NOTINITIALIZED`）——此前 smoke
靠「主线程先碰过 UIA」掩盖，独立侧起侧时暴露，已在 `locate_element` 入口加线程幂等 `CoInitializeEx`。

**不做的**（顺延切片 5）：窗口句柄圈定录制范围、聚合阈值按真实样本校准、回放前重取窗口句柄/重试、
录制流程参数化（变量化录制值）。

---

## 2. 完成项（代码落盘清单）

### 2.1 sidecar（Python）`sidecar/desktop_pick.py`
- 新增按键名→VK 映射：`VK_TO_NAME`（Backspace/Tab/Enter/方向/F1-F12 等，录制聚合用）、
  `KEY_NAME_TO_VK`（pressKey 解析用，含 esc/return/ctrl 别名）、`_SHORTCUT_MOD_VKS`
  （Control/Alt/Win；Shift 透明——大小写由 `vk_to_char` 的 ToUnicode 处理）。
- 新增 `_recorder_vk_name(vk)`（非文本键名 + 字母/数字名）与 `_parse_key_combo(keys)`
  （解析 `"Enter"` / `"Control+A"` / `"Ctrl+Shift+S"` 为有序 vk 列表，未知键抛 ValueError）。
- 新增 `DesktopPicker.press_key(keys)` + `_send_key(vk, up)`：SendInput 组合键——修饰键先按下
  不释放、主键按下+释放、再逆序释放修饰键。
- `DesktopRecorder._aggregate` 重写 key 分支：
  - 修饰键（Control/Alt/Win）按下只记录 `held_mods`，不单独成指令；Shift 透明；
  - 普通可打印字符（无 held_mods）→ 仍聚合为 typeText 文本段；
  - 非文本键（Enter/Backspace/Tab/方向/F键）或「修饰键+字符」→ 落盘一条 `pressKey`
    指令 `{kind:"key", cmdId:"pressKey", params:{keys:"Control+A"}}`；
  - 命中点在自身 app_pid 时清空 held_mods 再过滤。
- `locate_element` 增加 `trace: list[str]`：逐级记录窗口解析、strict/property/ancestor/index/coords
    每级是否命中及原因（如「窗口句柄 65806 失效」「严格属性未命中」「祖先链：无特征，跳过」）。
- 新增 `ensure_com_thread()`（threading.local 幂等），在 `locate_element` 入口调用——
  修复 HTTP 工作线程首次 UIA 调用 `CO_E_NOTINITIALIZED`。

### 2.2 sidecar HTTP 端点 `sidecar/server.py`
- 新增 `POST /desktop/press_key {keys}`（空 keys 400 `keys_required`；未知键名 400 `bad_keys`；
  SendInput 失败 500）。
- `/desktop/locate_element` 回复增加 `trace: [str]`。
- 模块 docstring 协议清单同步。

### 2.3 共享契约
- `src/shared/desktop-record.ts`：`RecordKind` 增加 `'key'`；文档注释补 `key → pressKey`。
- `src/shared/desktop-pick.ts`：`LocateElementReply` 增加 `trace?: string[]`。

### 2.4 主进程 / 引擎
- `src/engine/sidecar/client.ts`：新增 `pressKey(keys)` → POST `/desktop/press_key`。
- `src/engine/desktop/commands.ts`：`DesktopLike` 增加 `pressKey`；注册 `pressKey` 指令
  （桌面分组，单参数 `keys`，runner 插值后调 desktop.pressKey，成功日志「已按下按键/快捷键：X」）。
- `src/main/index.ts`：`elements:verify` 回复透传 `trace`。

### 2.5 渲染层
- `src/preload/index.ts` + `src/renderer/src/env.d.ts`：`elements.verify` 返回类型增加 `trace?: string[]`。
- `ElementPanel.tsx`：`VerifyState` 携带 `trace`；校验失败时在红底等宽框内逐行展示定位报告。
- `EditorView.tsx`：录制完成日志统计增加「按键 N」；开启录制提示文案补「/ 按键」。

### 2.6 测试
- `sidecar/tests/test_desktop_record.py`（+7 例，共 61）：
  - 非文本键落盘 pressKey（Enter 截断文本段并成一条 key 指令，顺序 h→Enter→i）；
  - Ctrl+字母合并为 `Control+a` 热键；Shift+字母仍走文本段 `"A"`（不误判为快捷键）；
  - 单独按修饰键不产生指令；Backspace → pressKey；
  - `_parse_key_combo` 正常/未知键名；
  - `/desktop/press_key` 端点（成功 + 空 keys 400）；
  - `/desktop/locate_element` trace 透传（命中/未命中两路）。
  - 原 `test_non_text_key_flushes_and_ignored` 改写为 `test_non_text_key_emits_pressKey_instruction`
    （行为变更：Enter 现在落盘）。
- `src/engine/desktop/commands.test.ts`（+4 例，共 102）：注册 pressKey、成功调用、
  `${var}` 插值 + 空 keys 抛错、回放失败抛错。

---

## 3. 关键设计决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 非文本键如何落盘 | 新增 `pressKey` 指令（`keys` 字符串），而非多种 key 指令 | 统一 SendInput 组合键入口；Enter/Backspace/快捷键共用一套回放 |
| 哪些修饰键算快捷键 | 仅 Control/Alt/Win；Shift 透明 | Shift 只改变字符大小写，已由 `vk_to_char`(ToUnicode) 处理；Shift+字母必须仍走文本段，否则会丢大写文本 |
| 快捷键合并 | 修饰键按下只记 `held_mods`，随后主键合并为一条 `Control+A` | 没有 WM_KEYUP 事件流，靠「下一个按键」触发合并；单独按修饰键不产生指令 |
| locate trace 放哪 | 在 `locate_element` 顶层决策流收集，不改递归查找器 | 低风险：trace 只记录每级是否尝试/命中，无需穿透 `_find_strict` 内部 |
| HTTP 线程 COM | `locate_element` 入口 `ensure_com_thread()`（threading.local 幂等） | ThreadingHTTPServer 线程复用，每线程只 CoInitialize 一次；hook 线程已有自己的初始化不冲突 |
| 闭环验证方式 | sidecar 级记事本回放冒烟（读回文本断言） | GUI 自动化在本环境不稳定（切片 1/3 已记 computer_use_tool 不可用）；回放原语链路用记事本 ValuePattern 回读即可定量证明 |

---

## 4. 验证结果

### 4.1 自动化
| 项 | 结果 |
|---|---|
| `pytest sidecar/tests` | **61 passed**（切片 3 的 54 + pressKey/parse/locate trace/press_key 端点 7） |
| `npm run typecheck` | **0 错误** |
| `npm test`（vitest） | **18 文件 / 102 passed**（98 + pressKey 4） |
| `npm run build` | 通过（renderer **822.64 kB**，较切片 3 的 821.94 kB +0.7 kB） |
| `npm run license:check` | 无新增禁用 license（仍为 MIT/ISC/Apache/BSD/Unlicense 等既有清单） |

### 4.2 录→存→跑闭环冒烟（`.runtime/smoke_replay.py`，sidecar 真实链路）
- 自起 sidecar + 记事本：UIA 定位其 Edit 控件构造录制式 target 签名；
- 按「录制出的指令序列」回放：
  `click_element`(pickElement，命中策略 **property**) → `type_text("line one")` →
  `press_key("Enter")` → `type_text("line two")`；
- UIA ValuePattern 读回记事本全文 = **`'line one\r\nline two'`**：
  两行都在、且 Enter 真正换行（`between` 含 `\r\n`）——**回放闭环 PASS，退出码 0**。
- 这补齐了切片 3 §4.2/§4.3 已证「录→存」的「跑」半段；录出的指令形状
  （pickElement/typeText/scroll + 新增 pressKey）现已全部可真实回放。

### 4.3 调试过程沉淀
1. **HTTP 线程 COM 未初始化**：独立侧起 sidecar 直接调 `/desktop/click_element` 报
   `[WinError -2147221008] 尚未调用 CoInitialize`。切片 2 的 smoke 因为先在主线程用过
   UIA 才「碰巧」通过；本闭环 smoke 是首个「冷启动后首调 UIA 走 HTTP 线程」的用例。
   修复：`locate_element` 入口 `ensure_com_thread()`（threading.local 幂等）。
2. **Shift 不能算快捷键修饰键**：初版把 Shift 也塞进 `held_mods`，会让 Shift+大写字母
   误入 pressKey 丢文本。改为仅 Control/Alt/Win 触发快捷键合并，Shift 透明交给 ToUnicode。

---

## 5. 遗留与风险

1. **窗口句柄圈定录制范围未做**（切片 3 §6.2/§7 待拍板项顺延）：录制仍是全局钩子 +
   app_pid 自过滤，会录到非目标窗口操作；切片 5 按目标窗口 HWND/PID 圈定。
2. **聚合阈值未校准**（350/800/400ms 常量）：慢速打字仍会拆成多条 typeText；双击防抖
   会合并真实双击意图。待真实样本校准（切片 5）。
3. **回放稳定性未做重试**：回放前不重取窗口句柄，目标窗口关闭/移动后 coords 兜底可能点偏；
   切片 2 §7 与切片 3 §6.5 挂账的「N 次重试 + 重取句柄」仍未做。
4. **pressKey 无键位映射 UI**：keys 参数为手填字符串（`Control+A`），录制时自动生成；
   手动编辑场景缺可视化按键选择器（POC 可接受）。
5. **录制未录窗口切换**：跨窗口操作的录制顺序依赖用户先后；回放时首个 pickElement 会
   把目标窗口点到前台，后续 typeText 落到当前焦点——记事本冒烟已验证此链，但真实多窗口
   应用的焦点切换仍需样本验证。
6. **Tcl leaked 告警（既有）**：overlay 线程退出已知行为，功能无损。

---

## 6. 下一步建议（优先级排序）

1. **窗口句柄圈定录制范围 + 目标窗口 PID 过滤**：录制开始时圈定用户选定窗口（而非只排除
   自身），消除误录其它窗口噪声；与「录制范围」待拍板项一起定。
2. **回放稳定性**：回放 pickElement 前 dry-run `locate_element` 预检；失败按 N 次重试 +
   重取窗口句柄（切片 2 §7 挂账）。
3. **聚合阈值校准**：录一段真实操作人工核对后调整 CLICK_DEBOUNCE/TYPING_GAP/SCROLL_GAP；
   可考虑做成可配置（按应用模板）。
4. **录制流程参数化**：把录制出的字面文本/坐标暴露为可改参数（变量化），而非仅落字面量。
5. **校验 trace 入口补全**：把 locate trace 也接到「运行前预检」（切片 2 §5.6 挂账项）。

---

## 7. 待拍板项

| 项 | 现状 | 待拍板 |
|---|---|---|
| 录制范围 | 全局钩子 + app_pid 自过滤 | 是否切片 5 做「目标窗口句柄圈定」？推荐做 |
| 聚合阈值 | 350/800/400ms 常量 | 是否做成可配置（按应用模板）？ |
| 坐标兜底入库 | 空特征签名照存元素库 | 是否跳过纯坐标签名不入库？ |
| pressKey keys 输入 | 手填字符串 | 是否需要可视化按键选择器（中期）？ |

---

## 8. 恢复现场速查

- sidecar 起服：`python sidecar/server.py --port 0`（握手行 `SIDECAR_READY port=N`）；
- 回放闭环冒烟：`python .runtime/smoke_replay.py`（自起 sidecar + 记事本，读回文本断言，
  退出码 0 全绿）；
- 录制链路（切片 3）：编辑器「录制」→ `record:start` → 观察不吞输入 → `record:stop`
  聚合指令 → `saveRecordedElements` 入库 + renderer 追加步骤；
- pressKey：`POST /desktop/press_key {keys:"Enter"|"Control+A"|"Ctrl+Shift+S"}`；
  录制聚合：Control/Alt/Win 按住 + 主键 → 一条 pressKey；Shift 透明走文本；
- 校验 trace：`POST /desktop/locate_element {target}` → `{ok, found, strategy, trace:[…]}`，
  元素库「校验」失败时在 UI 红框内逐行展示；
- 聚合阈值：`CLICK_DEBOUNCE_MS=350 / TYPING_GAP_MS=800 / SCROLL_GAP_MS=400`；
- DB：`%APPDATA%\ruili-rpa\ruili.db`（flows / elements）；
- 勿重试：computer_use_tool GUI 操作（PIP 初始化失败）；GUI 自动点击必须 DPI aware +
  SetForegroundWindow 置前 + 实时 GetWindowRect；独立侧起 sidecar 后首个 HTTP UIA 调用
  必须在工作线程 CoInitialize（已由 ensure_com_thread 处理）。
