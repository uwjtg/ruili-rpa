# M3 · 切片 15：点击 boundingBox 内 JSON 插值参数化

> 接力开发交接文档 · 版本 V3 原型
>
> - 切片：M3 切片 15 · pickElement 坐标兜底包围盒 x/y 抽成点击位置变量
> - 依赖切片：[25-M3 - 切片 14 - 变量弹窗增强](./25-M3%20-%20切片%2014%20-%20变量弹窗增强.md)
> - 状态：**已完成并验证**（vitest 21 文件 128/128、typecheck 0、build 839.86 kB、pytest 81/81、坐标字符串兼容实测 PASS）
> - 落盘日期：2026-09-25

---

## 1. 切片目标

关闭切片 13 §6 优先级 #2：**点击 boundingBox 内 JSON 插值参数化**。录制产生的
pickElement 步骤，target JSON 里的 boundingBox.x/y（坐标兜底点击位置）抽成 number
流程变量 `clickX1/clickY1`，运行时插值后 JSON.parse 仍为合法元素对象；用户在变量面板
改值即可调整点击落点，无需改步骤 JSON。

## 2. 完成项（代码落盘清单）

| 文件 | 改动 |
|---|---|
| `src/shared/record-params.ts` | 新增 `parameterizeClickBox`：对 pickElement target（对象或 JSON 字符串）解析 boundingBox，把数值 x/y 抽为 `clickX`/`clickY` number 变量（带说明）；**有抽取时 target 一律转 JSON 字符串**（含 `${var}`，运行时先插值再 parse）；已含 `${}` 的字符串跳过防二次抽取；同时为既有 input/scroll 变量补 `description` |
| `src/shared/record-params.test.ts` | +4：对象 target 抽取+转字符串+插值后可 parse（数值字段为数字字符串，sidecar int() 规整）；JSON 字符串 target 抽取、已含 `${}` 跳过；全非数值保持原样；连续点击递增命名 clickX2/clickY2 |

**数据流**：录制 pickElement（target=元素对象）→ 切片 15 参数化（boundingBox.x→
`"${clickX1}"`，target 转 JSON 字符串）→ 运行 `pickElement` runner 对字符串先
`ctx.interpolate`（`${clickX1}`→"100"）→ `JSON.parse`（x="100" 字符串）→ sidecar
`_valid_box` `int()` 规整（实测 "100"→100，"abc"→None 走失败路径）。

## 3. 关键设计决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 抽取字段 | 仅 boundingBox.x/y（点击落点） | 与 scroll x/y 对齐；width/height 变动少，不抽 |
| 对象 target 处理 | 有抽取时转 JSON 字符串 | runner 只对字符串插值；对象插不了值 |
| 二次抽取防护 | 字符串含 `${` 即跳过 | 同一录制重复参数化不叠加 |
| 数值类型 | number 变量，插值后为数字字符串 | sidecar `int()` 规整等价 Number()，已实测 |
| 命名 | `clickX1/clickY1/clickX2…` 递增 | 与 inputN/scrollDeltaN 一致，避开已有变量 |

## 4. 验证结果

- vitest 128/128（record-params 6→10）；typecheck 0；build 839.86 kB；pytest 81/81；
- `_valid_box({'x':'100','y':'120',…})` → `{100,120,20,40}`；`'abc'` → None（实测）。

## 5. 遗留与风险

1. 用户把 clickX 改成非数字 → 坐标兜底失效（该次点击回退无坐标抛错）——预期行为，运行日志可见。
2. 参数化后 target 是字符串；参数面板显示 JSON 文本，手工改需保持 JSON 合法。
3. 未抽 width/height：点击中心随 x/y 平移，尺寸不变。

## 6. 恢复现场速查

- 参数化：`src/shared/record-params.ts#parameterizeClickBox`；
- 运行插值：`src/engine/desktop/commands.ts` pickElement runner（字符串先 interpolate 再 parseTargetParam）；
- sidecar 规整：`sidecar/desktop_pick.py#_valid_box`（int() 兼容数字字符串）。
