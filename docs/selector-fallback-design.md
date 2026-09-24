# 元素选择器回退链设计稿（阶段 5 · T10 评审稿）

> 目的：定义「拾取时冗余存特征、回放时按链降级」的选择器策略，对应计划书 6.2（影刀核心壁垒，本阶段只出设计稿，M3 落地）。
> 上游：阶段 3 `src/engine/web/session.ts` 已透传 Playwright locator；本设计在其上加一层 `ElementResolver`。

## 1. 问题

真实网页频繁改版：id 是随机串（React/Vue hash）、class 是 CSS-in-JS 哈希、结构层级天天变。单用任何一种选择器都会经常失效。影刀靠多年长尾修补把成功率做高；我们的策略是：**拾取时一次性冗余记录元素的全部可用特征，回放时按可信度从高到低依次尝试，命中唯一可见元素即胜**。

## 2. 拾取时记录的特征（ElementSignature）

拾取器从 DOM 节点一次性收集（落元素库，序列化 JSON）：

```ts
interface ElementSignature {
  // 强特征（稳定度高，优先试）
  id?: string
  name?: string            // <input name>
  ariaLabel?: string
  role?: string            // aria-role
  // 中特征
  text?: string            // 可见文本（精确/包含）
  title?: string
  placeholder?: string
  dataTestId?: string      // data-testid / data-test
  // 弱特征（最后兜底）
  cssPath?: string         // 计算出的 CSS 路径
  xpath?: string
  tag?: string
  // 消歧辅助
  frameUrl?: string        // 跨 iframe 时记录
  anchorText?: string      // 相对位置锚点：邻近的稳定文本
}
```

## 3. 回放时的回退顺序（Resolver）

`resolve(signature, page)` 按下列顺序生成 Playwright locator，逐个探测：

| 顺序 | 策略 | locator 写法（示意） | 备注 |
|---|---|---|---|
| 1 | data-testid | `page.getByTestId(sig.dataTestId)` | 最稳，优先 |
| 2 | id | `page.locator('#' + cssEscape(sig.id))` | 需 escape |
| 3 | name | `page.locator('[name="..."]')` | 表单控件 |
| 4 | aria | `page.getByRole(sig.role, { name: sig.ariaLabel })` | 可访问性树 |
| 5 | placeholder / title | `page.getByPlaceholder(...)` / `getByTitle(...)` | 表单/图标按钮 |
| 6 | 可见文本 | `page.getByText(sig.text, { exact: false })` | 链接/按钮 |
| 7 | cssPath | `page.locator(sig.cssPath)` | 结构兜底 |
| 8 | xpath | `page.locator('xpath=' + sig.xpath)` | 最后兜底 |

**判定规则**：
- 某策略 `locator.count() === 1` 且 `isVisible()` → 命中，返回该 locator。
- `count() > 1` → 用下一个更强特征交叉收敛（如文本 + tag）；仍多个则记日志并取第一个可见项，上报选择器歧义。
- `count() === 0` → 走下一条策略。
- 全部落空 → 抛「元素定位失败」错误，日志记录用了哪些策略、各命中数，供 M3 失败案例库迭代。

## 4. 与现有 WebSession 的接口扩展（M3 实现）

在 `WebSession` 接口加：

```ts
resolveElement(sig: ElementSignature): Promise<Locator>
clickBySignature(sig: ElementSignature): Promise<void>
fillBySignature(sig: ElementSignature, value: string): Promise<void>
extractBySignature(sig: ElementSignature): Promise<string>
```

web 指令 `webClick/webInput/webExtractText` 的 `selector` 参数在 M3 升级为「选择器 JSON」（向后兼容：字符串仍按裸 CSS 处理）。

## 5. 日志与自学习

- 每次定位记录 `{ stepId, usedStrategy, candidateCount, ms }` 进日志事件（`RunEvents` 加可选字段，向后兼容）。
- 命中落在「弱策略」（cssPath/xpath）的案例自动进失败案例库，M3 每双周补特征规则。
- 不做「自愈改 DOM」，只做「在已有特征里换一种找法」。

## 6. 不在本阶段范围

- 桌面 UIA 选择器（sidecar 内）。
- 视觉/坐标兜底（图像 OCR 命中后点坐标，阶段 5 已通 sidecar 桥）。
- 真正的录制器（CDP 事件→特征采集）。

## 7. 评审通过标准（§2）

- [x] 回退顺序 8 级明确，每级对应 Playwright 原生 locator（不自己造引擎）。
- [x] 拾取冗余记录 vs 回放降级，双向对应。
- [x] 与阶段 3 WebSession 接口向后兼容（字符串选择器仍可用）。
- [x] 失败可观测（用了哪级、命中数入日志），支撑 M3 迭代。
