# M7 · 切片 19：Excel (.xlsx) 读写（exceljs）

> 接力开发交接文档 · V3 原型
>
> - 切片：M7-19（第四个新依赖：exceljs）
> - 依赖切片：[85-M7-18-PDF处理.md](./85-M7-18-PDF处理.md)
> - 状态：**已完成并验证**（typecheck 0 / vitest 390 / pytest 84）
> - 落盘日期：2026-09-26

---

## 1. 本阶段目标与完成情况

引入 `exceljs`（纯 Node，不需要装 Office）做 .xlsx 读写。与现有 `src/engine/excel/commands.ts`（走 Python sidecar COM 自动化真 Excel）互补——那套要求机器装 Office，这套纯文件操作跨平台。

**新增 3 条指令**：
- `xlsxListSheets`：列出 sheet 名
- `xlsxReadSheet`：读 sheet 为二维数组
- `xlsxWriteSheet`：把二维数组写入 sheet（不存在则新建，可覆盖）

新建 `src/engine/commands/xlsx.ts`，在 `buildEngineRegistry()` 注册；index.ts 导出。

## 2. 产出物

| 文件 | 改动 |
|---|---|
| `package.json` | exceljs 已作为依赖显式声明（4.4.0） |
| `src/engine/commands/xlsx.ts` | 新增，3 条指令 |
| `src/engine/commands/xlsx.test.ts` | 新增，2 例单测（注册/读写回环） |
| `src/engine/run/runManager.ts` | 注册 |
| `src/engine/index.ts` | 导出 |

## 3. 测试结果原文

```
$ npm run typecheck   # 0 错误
$ npm test
 Test Files  37 passed (37)
      Tests  390 passed (390)   # 上一基线 388，+2
```

指令总数：128 → **131**。

## 4. 自检清单

- [x] 3 条注册计数锁定；
- [x] 写后读回，sheet 列表正确；单元格值（含数字类型）读回；
- [x] typecheck 0 / vitest 390；
- [x] 未改 RunWireEvent；.ts UTF-8 无 BOM。

## 5. 遗留问题

1. **指令总数 131**，距 150 还差 ~19。
2. 未做公式、样式、合并单元格、图表。
3. 未做 IMAP 收邮件（imapflow）。

## 6. 对下一阶段的输入

- 下一批：IMAP 收邮件（imapflow）/ 浏览器与桌面高级指令。

## 7. 待用户拍板

1. 下一批：IMAP / 浏览器桌面高级？
