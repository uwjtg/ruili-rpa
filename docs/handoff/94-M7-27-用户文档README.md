# M7 · 切片 27：用户文档（README）

> 接力开发交接文档 · V3 原型
>
> - 切片：M7-27（选项 D 用户文档）
> - 依赖切片：[93-M7-26-指令扩充第九批.md](./93-M7-26-指令扩充第九批.md)
> - 状态：**已完成**（typecheck 0 / vitest 405 / pytest 88 不变）
> - 落盘日期：2026-09-27

---

## 1. 本阶段目标与完成情况

按用户要求做用户文档。仓库此前无 README，新增根目录 `README.md`：

- 项目简介 + 徽章（version 0.1.1 / vitest 405 / pytest 88）
- 功能一览
- 环境要求（Node 20+/Python 3.10+/sidecar 可选依赖）
- 快速上手（install / dev / test / dist）
- 目录结构
- **指令速查表**（按分类列 ~160 条指令，从代码 grep 真实 id 整理）
- 开发约定（register 模式 / UTF-8 无 BOM / handoff 模板 / 许可证红线）
- 已知限制 V1（6 条，从早期 handoff 继承）

## 2. 产出物

| 文件 | 改动 |
|---|---|
| `README.md` | 新增，~150 行 |

## 3. 测试结果原文

纯文档，未改代码。沿用基线：
- typecheck 0 / vitest 405 / pytest 88

## 4. 自检清单

- [x] README 无链接死指（THIRD-PARTY-NOTICES 已存在）；
- [x] 指令速查表从 grep 真实 id 整理，非杜撰；
- [x] 已知限制与早期 handoff 一致；
- [x] 未改代码，测试基线不变。

## 5. 遗留问题

1. 未做截图/GIF（需真跑 UI 截图）。
2. 未写 CONTRIBUTING.md（开发约定已塞 README，可后续拆出）。
3. 未做英文版 README。

## 6. 对下一阶段的输入

- 用户文档 V1 已立；下一批可选：截图/GIF 走查 / CONTRIBUTING / 其他收尾。

## 7. 待用户拍板

1. 下一批：截图走查 / CONTRIBUTING / 其他？
