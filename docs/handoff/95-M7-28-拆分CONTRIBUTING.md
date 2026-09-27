# M7 · 切片 28：拆分 CONTRIBUTING.md

> 接力开发交接文档 · V3 原型
>
> - 切片：M7-28（选项 B 拆 CONTRIBUTING.md）
> - 依赖切片：[94-M7-27-用户文档README.md](./94-M7-27-用户文档README.md)
> - 状态：**已完成**（typecheck 0 / vitest 405 / pytest 88 不变）
> - 落盘日期：2026-09-27

---

## 1. 本阶段目标与完成情况

切片 94 把开发约定塞进了根 README。本切片把它拆成独立的 `CONTRIBUTING.md`，让 README 面向普通用户、CONTRIBUTING 面向开发者/下一个接力会话：

- 新增 `CONTRIBUTING.md`（约 110 行）：环境准备、常用命令表、目录速记、**新增指令标准 6 步流程**（含最小代码骨架）、Python sidecar 约定（fake `_PICKER` pytest 教训）、编码硬约束（UTF-8 无 BOM / LF / RunWireEvent 冻结 / GPL·AGPL 红线 / token 不入库）、测试 DoD、接力交接流程、提交信息约定。
- 精简根 `README.md`：原「开发约定」4 条改为一句话指针，指向 CONTRIBUTING。
- 内容全部对照真实代码核对：命令取自 `package.json` scripts；注册流程对照 `registry.ts` / `runManager.ts` 实际 import 与装配；踩坑条目来自切片 90/93 历史。

## 2. 产出物

| 文件 | 改动 |
|---|---|
| `CONTRIBUTING.md` | 新增，约 110 行，UTF-8 无 BOM（首字节 `23 20`） |
| `README.md` | 「开发约定」小节 → 「开发」指针段，约 6 行 |

无代码改动。

## 3. 测试结果原文

纯文档改动，跑三绿门禁确认基线不变：

- `npm run typecheck`：0 错（tsc node + web 两 project 均无输出）。
- `npm test`（vitest）：`Test Files 39 passed (39)` / `Tests 405 passed (405)`，Duration 11.17s。
- `npm run test:sidecar`（pytest）：`88 passed in 14.98s`。

## 4. 自检清单

- [x] 产出物落盘约定路径（根目录 CONTRIBUTING.md + handoff 95）。
- [x] typecheck / vitest / pytest 三绿，原文见 §3。
- [x] 命令与注册流程对照 `package.json` / `registry.ts` / `runManager.ts` 核实，非杜撰。
- [x] 新 .md 文件 UTF-8 无 BOM（已读首字节验证）。
- [x] 未引入新依赖、未改 RunWireEvent 形状、无密钥入库。
- [x] 交接文档 7 段写满并落盘，INDEX.md 已加行。

## 5. 遗留问题

1. README「许可证」小节仍写「私有项目，未开源」，但仓库已 public（切片 71）——本次未改，留给用户拍板是否补开源许可证。
2. CONTRIBUTING 面向内部接力，未做外部 PR 模板 / issue 模板（自用模式，暂不需要）。
3. 未做英文版 README / CONTRIBUTING。

## 6. 对下一阶段的输入

- 开发者文档 V1 已立；下一批可选：
  - A) UI 截图 / GIF 走查（需真起 Electron 截图，配 README 顶部）；
  - C) 收尾项：邮件密码走 safeStorage、教程视图占位、代码签名、WPS/Office COM、装机版自动更新端到端。

## 7. 待用户拍板

1. 下一批走 A（截图走查）还是 C（收尾项，挑其中一两项）？默认推荐 A：公开仓库有截图能显著提升 README 观感，且不涉及高风险代码。
2. 仓库已 public 但 LICENSE 仍 UNLICENSED，是否要补一个开源许可证（如 MIT）？本切片未动，等指示。
