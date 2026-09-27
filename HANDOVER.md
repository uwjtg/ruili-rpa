# 锐流 RPA V3 · 智能体交接手册

> 给下一个接手的智能体/开发者：读完这一篇就能继续干活。
> 最后更新：2026-09-28（对应 commit `5775da2` / tag `v0.2.0`）

---

## 1. 这是什么

Windows 桌面 RPA（Robotic Process Automation）工具，Electron + Python sidecar 架构。
对标影刀/ UiBot 的个人自用 POC：可视化流程编排 + 浏览器自动化 + 桌面 UIA 自动化 + 数据处理 + Office/WPS COM。

- 仓库：https://github.com/uwjtg/ruili-rpa （public）
- 技术栈：Electron 3x + React + TypeScript（主进程/渲染）+ Python 3 sidecar（pywin32/uiautomation/OpenCV/RapidOCR）
- 打包：electron-builder NSIS；内置嵌入式 Python 到 resources/python

## 2. 当前状态（基线）

- **测试三绿**：`npm run typecheck` = 0 错；`npm test`（vitest）= **426 passed**；`npm run test:sidecar`（pytest）= **90 passed**。
- **指令总数 179**（计划书目标 150–180，达标）。
- 已交付切片：M3 1-18 / M4 1-11 / M5 1-26 / M6 1-6 / M7 1-40（见 `docs/handoff/INDEX.md`）。
- 最新安装包：`dist-installer/ruili-rpa-0.1.1-setup.exe`（234.7 MB，未签名，自用直接装）。

## 3. 环境准备（新机器）

```powershell
# 1. 克隆
git clone https://github.com/uwjtg/ruili-rpa
cd ruili-rpa

# 2. Node 依赖（需 Node 18+）
npm install

# 3. Python sidecar 依赖（用系统 Python 3.11+）
pip install pywin32 uiautomation opencv-python rapidocr-onnxruntime

# 4. 冒烟
npm run typecheck    # 必须 0
npm test             # 426 passed
npm run test:sidecar # 90 passed
```

开发态跑：`npm run dev`。打包：`npm run dist`（出 NSIS 安装包）。

## 4. 目录结构（关键）

```
src/
  main/            Electron 主进程（窗口、IPC、sidecar 生命周期）
  engine/          RPA 引擎：指令注册、RunManager 执行、web/desktop/db/office 指令
    commands/      业务指令（demo/data/csv/pdf/xlsx/docx/db/mail/imap/util/system）
    web/           Playwright 浏览器会话 + 回退链
    sidecar/       Python sidecar HTTP client + sidecar 指令
    run/           RunManager（事件流、超时、dispose）
  shared/          前后端共享：pick-script/record-script/scrape/desktop-pick
  renderer/src/    React 渲染层（EditorView 流程编辑器）
sidecar/
  server.py        Python HTTP 服务（127.0.0.1，动态端口）
  office_com.py    Excel/Word/WPS COM 封装
  desktop_pick.py  UIA 拾取/录制/坐标操作
  tests/           pytest
docs/handoff/      每个切片一份交接文档（NN-标题.md），INDEX.md 是目录
scripts/           构建/基准脚本
```

## 5. 硬性约束（踩过的坑，必读）

1. **RunWireEvent 形状冻结**——不要改主进程→渲染层事件结构。
2. **改 .ts 一律显式 UTF-8 无 BOM**：本仓库文件换行符不统一（LF/CRLF 混）。用 PowerShell 改时先探测 CRLF 数量，锚点用对换行符，否则静默不命中。
   ```powershell
   $bytes=[IO.File]::ReadAllBytes($p); $crlf=0
   for($i=0;$i -lt $bytes.Length-1;$i++){if($bytes[$i]-eq13-and$bytes[$i+1]-eq10){$crlf++}}
   # $crlf>50 用 `r`n，否则 `n
   ```
3. **新指令先 grep `id: '...'` 查重**（撞过 listSum/excelOpen 等）。
4. **sidecar 新 endpoint 要加 pytest fake**（fake 不真起 Office/UIA）。
5. **PowerShell here-string 会吃掉 JS 模板串里的 `${}`**——写含 `${...}` 的 TS 时不要用 `@"..."@`，改用单引号拼接或直接 Edit 工具。
6. **git push 走代理**：`git config http.proxy http://127.0.0.1:7890`（Clash）。
7. 注册新指令：`src/engine/commands/` 写 `register*Commands`，在 `runManager.ts` 的 `buildEngineRegistry()` 注册，`src/engine/index.ts` 导出。

## 6. 已实现的能力速查

- **浏览器**：Playwright，打开/导航/点击/输入/抓取列表/截图/回退链定位（id→testid→aria→name→role→tag.class→text→xpath→cssPath）、智能录制。
- **桌面**：UIA 拾取（pywinauto/uiautomation）、观察式录制、坐标点击/滚动/热键、截图。
- **数据**：CSV/JSON/Excel（exceljs）/PDF 合并拆页/Word(docxtemplater)/字符串数字列表日期操作。
- **Office COM**：Excel/WPS 表格读写区域、合并单元格、导出 PDF；Word/WPS 文字打开、全文替换、导出 PDF。
- **系统**：剪贴板、对话框、通知（钉钉/飞书/webhook）、HTTP、环境变量、DB（SQLite/MySQL）、邮件发送/IMAP 收件。

## 7. 还能做什么（未做，按优先级）

| 项 | 说明 | 卡点 |
|---|---|---|
| Windows 代码签名 | 消除 SmartScreen | 需买证书（~$200/年），自用可跳过 |
| 装机版自动更新 | electron-updater 真机端到端 | 需签名 + 发布服务器 |
| Excel 样式/图表 | 字体颜色列宽图表 | COM 接口已通，纯工作量 |
| Word 表格/光标定位 | 当前只有全文替换 | 同上 |
| PostgreSQL/SQL Server | 加驱动 | 需真实库 |
| webInputSmart 录制自动接线 | 输入框也带回退链 | 改录制器 fill 事件 |
| 指令补到 180 | 再补 1 条 | 自选 |

## 8. 打包产物

- 源代码 zip：`ruili-rpa-source-v0.2.0.zip`（见本包同级）
- 安装包：`ruili-rpa-0.1.1-setup.exe`（234.7MB，未签名）
- 编程过程：`docs/handoff/`（切片 85–107），`docs/handoff/INDEX.md` 是目录；`docs/DEVLOG.md` 是汇总时间线。
