# M7 · 切片 39：Office COM（Excel/Word 自动化）

> 接力开发交接文档 · V3 原型
>
> - 切片：M7-39（用户机器已装 Office 2016，pywin32 可驱动 Excel/Word）
> - 依赖切片：[105-M7-38-xpath与相对位置锚点](./105-M7-38-xpath与相对位置锚点.md)
> - 状态：**已完成**（typecheck 0 / vitest 426 / pytest 90；指令 169 → 176）
> - 落盘日期：2026-09-28

---

## 1. 本阶段目标

此前账本写"WPS/Office COM 未做"是因为以为没装 Office；用户确认 Office 2016 已装后，本切片通过 pywin32 打通 Excel/Word COM 自动化。WPS 暂不安装（ProgID 不同但方法签名一致，后续想支持只换 ProgID）。

## 2. 产出物

| 文件 | 改动 |
|---|---|
| `sidecar/office_com.py` | 新增：模块级单例管 Excel/Word 会话；excel_open/read/write/close、word_open/replace/close；pywin32 缺失抛错 |
| `sidecar/server.py` | 加 /office/* 路由分发；engines_report 加 office_com |
| `sidecar/tests/test_server.py` | +2 用例（路由分发 fake、501 降级） |
| `src/engine/sidecar/client.ts` | 加 7 个 office* HTTP 方法 |
| `src/engine/sidecar/commands.ts` | 新指令组 Office（7 条） |

新指令（均 group=Office）：
- `officeExcelOpen` / `officeExcelReadRange` / `officeExcelWriteRange` / `officeExcelClose`
- `officeWordOpen` / `officeWordFindReplace` / `officeWordClose`

## 3. 测试结果

- typecheck 0；vitest **426**；pytest **90**（88+2）。
- 真机冒烟：用 Excel COM 创建临时 xlsx → 写 A1/B1 → 模块读回 `[['hello', 42.0]]` → 关闭清理。✅

## 4. 自检

- [x] 与已有 `engine/excel/commands.ts`（基于 exceljs 的文件读写）id 不冲突——新指令统一加 `office` 前缀（切片 93 撞 id 教训，这次先 grep 了 `id: '(excel|word)`）。
- [x] pywin32 未装时 /office/* 返回 501 结构化降级。
- [x] Office 进程复用单例，避免频繁起停。
- [x] RunWireEvent 形状未动。

## 5. 遗留

- WPS 支持：换 ProgID 为 KET.Application / KWPS.Application，方法签名基本一致，未来一行改动。
- 未做 Excel 单元格样式/合并/图表等高级操作；当前只读写区域。
- Word 只做了全文替换，未做光标定位/表格操作/导出 PDF。

## 6. 待拍板

无。WPS 是否需要现在就装、是否要继续做 Word/Excel 高级操作，等用户定。
