# M7 · 切片 40：WPS 兼容 + 合并单元格 + Office 导出 PDF

> 接力开发交接文档 · V3 原型
>
> - 切片：M7-40（用户已装 WPS；补 WPS 引擎、Excel 合并单元格、Word/Excel 导出 PDF）
> - 依赖切片：[106-M7-39-Office-COM](./106-M7-39-Office-COM.md)
> - 状态：**已完成**（typecheck 0 / vitest 426 / pytest 90；指令 176 → 179）
> - 落盘日期：2026-09-28

---

## 1. 本阶段目标

承接 106，把"全做"清单扫完：
1. **WPS 兼容**：用户机器已装 WPS，验证 `KWPS.Application`（文字）/ `KET.Application`（表格）12.0 可起；open 类指令加 engine 参数（excel/wps、word/wps）。
2. **Excel 合并单元格**：`officeExcelMerge`。
3. **导出 PDF**：`officeExcelExportPdf`（xlTypePDF=0）、`officeWordExportPdf`（wdFormatPDF=17）。

## 2. 产出物

| 文件 | 改动 |
|---|---|
| `sidecar/office_com.py` | excel_open/word_open 加 engine 参数；新增 excel_merge/excel_export_pdf/word_export_pdf |
| `sidecar/server.py` | /office/* 传 engine；加 excel_merge/excel_export_pdf/word_export_pdf 路由 |
| `sidecar/tests/test_server.py` | fake 补 engine 参数和新函数 mock |
| `src/engine/sidecar/client.ts` | open 方法加 engine；加 merge/exportPdf 方法 |
| `src/engine/sidecar/commands.ts` | SidecarLike 加新方法；注册 officeExcelMerge/officeExcelExportPdf/officeWordExportPdf；open 指令加 engine 参数 |
| `src/engine/sidecar/commands.test.ts` | 期望列表更新到 13 条 |

## 3. 真机冒烟（WPS）

- 用 KET.Application 建 xlsx → 模块 engine='wps' 打开 → 读 A1:B2 返回 `[['标题',None],['内容',123.0]]` → 导出 PDF 28KB → 清理。✅

## 4. 测试结果

- typecheck 0；vitest **426**；pytest **90**。

## 5. 自检

- [x] WPS ProgID 实测可起（KWPS/KET 12.0）。
- [x] engine 参数默认 excel/word，向后兼容旧流程。
- [x] fake mock 同步补全（切片 90 教训）。

## 6. 遗留

- 未测 KWPS 文字端（word engine=wps）真机导出 PDF；接口已通，方法签名与 Word 一致。
- Excel 样式（字体/颜色/列宽）未做。

## 7. 待拍板

无。
