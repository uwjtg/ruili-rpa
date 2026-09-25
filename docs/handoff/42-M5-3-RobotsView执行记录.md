# M5 · 切片 3：RobotsView 真实化（执行记录）

> 接力开发交接文档 · 版本 V3 原型
>
> - 切片：M5-3 · 机器人视图从占位改为真实运行历史 + 日志明细
> - 依赖切片：[41-M5-2-调度加固-互斥与补跑](./41-M5-2-调度加固-互斥与补跑.md)
> - 状态：**已完成并验证**（vitest 26 文件 168/168、pytest 84/84、typecheck 0、build renderer 887.29 kB；runs 查询冒烟 11/11）
> - 落盘日期：2026-09-25

---

## 1. 本阶段目标与完成情况

handoff 40/41 挂的 RobotsView 尾巴。logs 表 M2 就已落盘（appendRunLog），一直没有读侧入口。本轮补：

1. **DB 读侧**（`src/main/store/db.ts`）：
   - `listRunHistory(limit=100)`：按 run_id 聚合，LEFT JOIN flows 取名，返回 status/durationMs/startedAt(MIN ts)/endedAt(MAX ts)/entryCount，按结束时间倒序；
   - `listRunEntries(runId)`：单 run 的日志明细（level/message/ts，按时间正序）；
2. **IPC**：`runs:history`、`runs:entries`（main/index.ts）；
3. **preload + env.d.ts**：runs.history/runs.entries 桥接与 RunHistoryItem/RunLogEntryRow 类型镜像；
4. **RobotsView 真实化**：运行历史卡片列表（流程名/开始时间/日志条数/耗时/status 彩色徽章），点击展开当次运行日志（按 level 上色、等宽字体），空态/刷新按钮。

## 2. 产出物清单

| 文件 | 改动 |
|---|---|
| `src/main/store/db.ts` | +RunHistoryItem/RunLogEntryRow 类型 + listRunHistory/listRunEntries |
| `src/main/index.ts` | import 两函数 + IPC runs:history / runs:entries |
| `src/preload/index.ts` | +runs 桥 + 两个类型 |
| `src/renderer/src/env.d.ts` | +runs 窗口镜像 + 两个 interface |
| `src/renderer/src/views/RobotsView.tsx` | 占位→真实历史列表 + 展开日志明细 |

## 3. 测试结果原文

- runs 查询冒烟 `npx vite-node .runtime/smoke_runs_history.mts`：**11/11 PASS**（聚合字段 flowName/status/durationMs/entryCount/startedAt/endedAt、明细正序含 warn）；
- vitest 26 文件 168/168（未新增用例，读侧逻辑靠冒烟覆盖）；
- pytest 84/84；typecheck 0；build main 112.50 kB、renderer 887.29 kB；无新依赖。

## 4. 自检清单

- [x] 产出物落盘；
- [x] vitest/pytest/typecheck/build 全绿；
- [x] 未改 FlowDoc/RunWireEvent；未加新依赖；
- [x] flow_id 为 null（未保存流程临时跑）时 flowName=null，UI 显示「未保存流程」；
- [x] 日志只在运行结束批量落盘（appendRunLog），历史是异步可见的，非实时流。

## 5. 遗留问题

1. **非实时**：运行中的日志不在 RobotsView 出现，要等 flow-end 写库后刷新；实时流仍走 run:event IPC（编辑器看）；
2. **没有清空/删除历史**：logs 表只增不减，长期会涨；后续加「清空历史」按钮（DELETE WHERE run_id）；
3. **没有按流程筛选**：现在是全局最近 100 条；后续可加下拉按 flow 过滤；
4. **调度触发的运行也落 logs**（appendRunLog 在 broadcast 里无条件写），RobotsView 能看到，符合预期；
5. 热键/文件监听触发器、桌面+网页混合流程演示未做。

## 6. 对下一阶段的输入要求

- 下一步建议：
  1. 热键触发器（全局快捷键启动流程）；
  2. 文件监听触发器（监听目录新文件触发流程，常用于自动处理下载/投递文件）；
  3. 桌面+网页混合流程端到端演示。

## 7. 恢复现场速查

- 聚合 SQL：`db.ts#listRunHistory`（GROUP BY run_id + LEFT JOIN flows）；
- IPC：`index.ts` runs:history / runs:entries；
- 视图：`src/renderer/src/views/RobotsView.tsx`。
