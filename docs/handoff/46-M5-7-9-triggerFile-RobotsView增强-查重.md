# M5 · 切片 7-9：triggerFile 注入 + RobotsView 增强 + 任务查重

> 接力开发交接文档 · 版本 V3 原型
>
> - 切片：M5-7 文件路径注入触发变量 / M5-8 RobotsView 筛选+清空 / M5-9 任务查重
> - 依赖切片：[45-M5-6-桌面网页混合流程演示](./45-M5-6-桌面网页混合流程演示.md)
> - 状态：**已完成并验证**（vitest 26 文件 168/168、pytest 84/84、typecheck 0、build renderer 890.69 kB）
> - 落盘日期：2026-09-25

---

## M5-7 文件路径注入（triggerFile）

文件监听触发时把新落盘文件的完整路径塞进流程变量 `triggerFile`，流程里可用 `${triggerFile}`。

- InterpreterOptions 加 `initialVars?`，构造时存字段，run() 根作用域 merge（覆盖 flow.vars 同名）；
- RunManager.StartOptions 加 `initialVars?`，透传给 Interpreter；
- FileWatchManager.fire 第三参 `extraVars?`，onFile 里传 `{ triggerFile: full }`；
- index.ts 文件触发 fire 包装 `runManager.start(flow, extraVars ? { initialVars: extraVars } : {})`。

冒烟 `.runtime/smoke_triggerfile.mts`：落盘新文件后断言捕获到的 `triggerFile` 是该文件完整路径。

## M5-8 RobotsView 筛选 + 清空

- DB `clearRunHistory()`（DELETE FROM logs）；IPC `runs:clear`；preload/env.d.ts `runs.clear`；
- RobotsView 头部加流程下拉（从历史去重 flowName）+「清空」按钮（confirm 后清空）；列表按筛选显示。

## M5-9 创建时查重

createTask 在 INSERT 前：
- hotkey：查同加速器是否已被别的任务占用，返回 `快捷键已被任务「X」占用`；
- file：查同监听目录是否已被监听，返回 `目录已被任务「X」监听`。

冒烟 `.runtime/smoke_dedup_clear.mts`：建重复热键/重复目录均被拒，清空后历史归 0。

## 验证

- triggerFile 冒烟 PASS；查重+清空冒烟 6/6；
- vitest 26 文件 168/168；pytest 84/84；typecheck 0；build main 118.79 kB、renderer 890.69 kB；无新依赖。

## 自检清单

- [x] 未改 FlowDoc/RunWireEvent 形状；
- [x] initialVars 只在根作用域 merge，不影响流程内 setVar；
- [x] 查重只挡创建，编辑后改名/改键不强制复查（可接受）；
- [x] 清空二次确认，不可恢复。

## 遗留 / 下一步

- AI 魔法指令前端入口（astGen 后端已有，未接 UI）；
- 热键真按键手测、文件监听递归/等文件写完；
- 调度运行中实时日志推到 RobotsView。
