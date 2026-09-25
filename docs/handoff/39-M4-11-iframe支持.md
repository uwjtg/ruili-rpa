# M4 · 切片 11：iframe 支持

> 接力开发交接文档 · 版本 V3 原型
>
> - 切片：M4-11 · web 指令跨 iframe 定位（frameSelector）
> - 依赖切片：[38-M4-10-录制器真站冒烟](./38-M4-10-录制器真站冒烟.md)
> - 状态：**已完成并验证**（vitest 26 文件 165/165、pytest 84/84、typecheck 0、build renderer 881.11 kB；iframe 真站冒烟 3/3）
> - 落盘日期：2026-09-25

---

## 1. 本阶段目标与完成情况

handbook 38 挂的 iframe 支持尾巴。给元素级 web 指令加可选 `frame`（iframe CSS 选择器）参数，跨 frame 定位真的在 Playwright 里走通。

1. **WebSession 接口**：`click/fill/getText/waitFor/eval` 五个方法加可选 `frameSelector?: string`；
2. **RealWebSession**：新增私有 `loc(selector, frameSelector?)`——给了 frameSelector 就用 `page.frameLocator(frameSelector).locator(selector)`；eval 走 frame 分支时 `page.waitForSelector(frameSelector)` 拿到 iframe 元素句柄，再 `handle.contentFrame()` 取 Frame，在其执行上下文里跑函数体（主世界 document 是 iframe 的 document）；
3. **web 指令**：webClick/webInput/webExtractText/webWaitFor/webScrapeList 都加「所在 iframe 选择器（可选）」参数并透传；webScrapeList 把 frame 作为 eval 第三参；
4. **单测同步**：旧断言补 `undefined` 尾参（签名同步点）；新增 2 条 frame 透传断言（webClick 传参、webScrapeList eval 第三参）。

**不做**：录制器/拾取器跨 frame（页面脚本注入在主世界，iframe 内事件不冒泡到主文档监听器；留后续）；SPA 多 frame 枚举。

## 2. 产出物清单

| 文件 | 改动 |
|---|---|
| `src/engine/web/session.ts` | WebSession 接口五方法加 frameSelector?；RealWebSession 加私有 loc()、eval frame 分支 |
| `src/engine/web/commands.ts` | 5 条 web 指令加 frame 参数并透传 |
| `src/engine/web/commands.test.ts` | 旧断言补尾参；+2 frame 透传用例 |

## 3. 测试结果原文

- vitest：26 文件 165/165（web 9 用例含 2 条 iframe 透传）；
- 真站 iframe 冒烟 `npx vite-node .runtime/smoke_iframe_live.mts`：**3/3 PASS**——主框架取 #outer、跨 frame 取 #frame-title、跨 frame 抓 .item（A/B 两行）；
- pytest 84/84；typecheck 0；build renderer 881.11 kB。

## 4. 自检清单

- [x] 产出物落盘；
- [x] vitest/pytest/typecheck/build 全绿；
- [x] WebSession 接口签名变更已同步 fakeSession（vi.fn 天然多参）+ 旧断言；
- [x] 未引入新依赖。

## 5. 遗留问题

1. 录制器/CDP 拾取器不跨 iframe（监听器挂在主文档）；要支持需在每个 frame 里单独注入或用 CDP `Target.setAutoAttach`。
2. iframe 跨源时 `contentFrame()` 仍可定位，但 `frame.evaluate` 受目标 frame CSP 限制（Playwright 内部绕过，与主框架一致）。
3. webScrapeList 翻页的 nextSelector 仍在主框架点（列表在 frame 内、翻页按钮在外层是常见结构，够用）。

## 6. 恢复现场速查

- 跨 frame 定位：`src/engine/web/session.ts#loc` + eval frame 分支；
- iframe 冒烟：`.runtime/smoke_iframe_live.mts` + `.runtime/iframe-parent.html`。
