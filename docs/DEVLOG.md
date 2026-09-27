# 锐流 RPA V3 · 开发过程时间线（DEVLOG）

> 本文汇总从基线切片 94 到 v0.2.0 的全部开发过程。每个切片的详细交接见 `docs/handoff/NN-*.md`，`docs/handoff/INDEX.md` 是完整目录。

---

## 阶段基线（切片 94 之前）

- M3 桌面自动化 1-18、M4 浏览器 1-11、M5 数据处理 1-26、M6 流程控制 1-6、M7 教程/邮件/数据库等 1-35。
- 切片 94 结束时：指令 161，测试 typecheck 0 / vitest 405 / pytest 88，根 README 已建，v0.1.1 tag 已打。

## 本次会话（切片 95 → 107，v0.2.0）

| 切片 | commit | 内容 | 测试变化 |
|---|---|---|---|
| 95–99 | （前序） | 拆 CONTRIBUTING.md、README 配 smoke 截图、AcademyView 教程页、MIT LICENSE、邮件 safeStorage 加密 + sendMailSaved | — |
| 100 | — | **数据库指令组**：dbConnect/dbQuery/dbExecute/dbClose，SQLite 走 better-sqlite3，MySQL 懒加载 mysql2 | +5 单测 |
| 101 | — | **选择器本地基准**：linkedom 跑生产 scrape 函数，10 类布局 fixture，门禁 ≥80%，实测 10/10 | — |
| 102 | `85aff19..03d5d08` | **真实站基准 + 打包**：抓 books/quotes.toscrape.com；发现 books 网格包装层聚类问题；npm run dist 出 234.7MB NSIS 包 | — |
| 103 | `03d5d08..2125a26` | **选择器回退链核心**：`fallback.ts` 纯函数（id→testid→aria→name→role→tag.class→text→cssPath）；pick 录制冗余抓特征；`WebSession.locateFirst`；新指令 webClickSmart | vitest 413→423 |
| 104 | `2125a26..1c3518d` | **录制闭环**：录制浏览器点击自动抓 features 并生成 webClickSmart 步骤；preload/env.d.ts 类型同步 | vitest 423 |
| 105 | `1c3518d..46ce197` | **xpath 兜底 + 相对位置**：回退链加 xpath= 候选；新指令 webInputSmart（输入框回退）、webClickRelative（行内相对位置锚点） | vitest 423→426，指令 167→169 |
| 106 | `46ce197..d31170c` | **Office COM**：pywin32 驱动 Office 2016；sidecar/office_com.py 单例管 Excel/Word；7 条新指令（officeExcel*/officeWord*）；真机 Excel 读写冒烟通过 | pytest 88→90，指令 169→176 |
| 107 | `d31170c..5775da2` | **WPS 兼容 + PDF**：KET/KWPS engine 切换；officeExcelMerge；officeExcelExportPdf/officeWordExportPdf；真机 WPS KET 读写+PDF 28KB 冒烟通过 | pytest 90，指令 176→179 |

最终：tag **v0.2.0**，指令 **179**，typecheck 0 / vitest 426 / pytest 90。

## 过程中踩过的坑（写给后来者）

1. **PowerShell here-string 吞 `${}`**：往 TS 文件写含模板串的代码时，`@"..."@` 会把 `${var}` 当 PS 变量吃掉。要么单引号拼接，要么改完 typecheck 后逐行补。
2. **换行符**：`src/main/index.ts`、`EditorView.tsx`、`preload/index.ts` 等是 LF，其它文件 CRLF 混。锚点前先数 CRLF。
3. **id 撞车**：新指令注册前必 grep `id: '...'`，本会话撞过 excelOpen（engine/excel/commands.ts 已存在）。
4. **fake session 缺方法**：WebSession 加了 `locateFirst`，所有测试 fake 都要补，否则 typecheck 全红。
5. **fake 不是 spy**：fake session 的 click/fill 是普通 async 函数不是 vi.fn，不能 `expect().toHaveBeenCalledWith()`。
6. **git push 网络抖**：Clash 代理 7890，配 `git config http.proxy`，失败重试 3-4 次。
7. **Office COM 偶发"服务器运行失败"**：上次 Quit 不干净时会出现，重试或换 WPS KET 即可。

## 设计决策记录

- **为什么回退链顺序这样定**：id 最稳但很多站点没有；data-testid 是测试钩子，比 aria 稳；xpath 抗 class hash 但脆于 DOM 结构变化；cssPath 放最后兜底。
- **为什么 Office 指令加 `office` 前缀**：已有基于 exceljs 的 `engine/excel/commands.ts`（纯文件读写，不启动 Excel 进程），COM 指令前缀区分，避免 id 冲突。
- **为什么 WPS 不强制装**：ProgID 不同（KET/KWPS vs Excel/Word）但方法签名一致，engine 参数切换即可。
- **为什么不签名**：个人自用，SmartScreen 一次点"仍要运行"即可；签名证书一年几百到上千，性价比低。
