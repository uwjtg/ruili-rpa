# 锐流 RPA

> 对标影刀的 Electron 桌面自动化客户端。Windows 桌面 RPA：浏览器/桌面操作、数据抓取、邮件、Office 文档、调度机器人，开箱即用。

![version](https://img.shields.io/badge/version-0.1.1-blue) ![tests](https://img.shields.io/badge/vitest-405-brightgreen) ![pytest](https://img.shields.io/badge/pytest-88-brightgreen)

## 功能一览

- **浏览器自动化**：打开浏览器、点击、输入、等待、抓取列表、执行 JS、前进/后退/刷新
- **桌面自动化**：拾取元素点击、坐标鼠标、右键/双击、全屏截图、前台窗口、按键/快捷键
- **文件/数据**：读写文本/JSON/CSV/XLSX/Word/PDF，字符串/数组/数学/日期处理
- **邮件**：SMTP 发送（nodemailer）、IMAP 收未读（imapflow）
- **通知**：飞书/钉钉/Webhook、系统对话框/剪贴板/提示音
- **流程**：变量、分支、循环、日志、延时
- **录制**：桌面元素拾取 + 网页录制（Python sidecar）

指令总数 **160+**，覆盖 V1 范围。

## 环境要求

- Windows 10/11（64 位）
- 已装：Node.js 20+、Python 3.10+（sidecar）
- 桌面元素拾取依赖 `uiautomation`；截图依赖 `Pillow`；OCR 可选 `rapidocr_onnxruntime`

## 快速上手

```powershell
# 1. 安装依赖
npm install
cd sidecar && pip install -r requirements.txt && cd ..

# 2. 开发模式跑起来
npm run dev

# 3. 跑测试
npm test                  # vitest
npm run typecheck         # tsc
npm run test:sidecar      # pytest

# 4. 打包安装包
npm run dist              # out 下生成 nsis 安装包
```

## 目录结构

```
ruili-rpa/
├── src/
│   ├── main/            # Electron 主进程（窗口/托盘/IPC/sidecar 拉起）
│   ├── renderer/        # React 渲染层（画布/编辑器/调试）
│   ├── preload/         # 预加载桥
│   └── engine/         # 运行引擎
│       ├── commands/   # 指令库（文件/系统/数据/CSV/邮件/Word/PDF/Excel/IMAP）
│       ├── web/        # 浏览器会话与指令
│       ├── desktop/    # 桌面指令
│       ├── sidecar/    # Python sidecar HTTP 客户端
│       └── run/        # 运行器（RunManager）
├── sidecar/            # Python 端（拾取/录制/OCR/桌面高级）
└── docs/               # 开发计划书、接力文档、handoff
```

## 指令速查（按分类）

| 分类 | 代表指令 |
|---|---|
| 流程/变量 | setVar / ifVar / loopList / logMessage / delay / sleep / comment |
| 文件 | readTextFile / writeTextFile / appendTextFile / fileExists / listFiles / copyFile / moveFile / deleteFile / createFolder / fileSize |
| 路径 | pathJoin / pathBasename / pathDirname / pathExtname |
| 环境 | getEnv / setEnv |
| Base64 | base64Encode / base64Decode |
| 字符串 | strTrim / strUpper / strLower / strReplace / strSplit / strSubstring / stringIncludes / stringIndexOf / stringCount / stringRepeat / stringReverse / stringSplitLines / stringPadStart / stringPadEnd / stringPadCenter / stringTrimStart / stringTrimEnd / stringReplaceFirst / stringStartsWith / stringEndsWith / stringConcat / stringLength / regexExtract |
| 数字 | numAbs / numCeil / numFloor / numMax / numMin / numMod / numPow / numRandom / numRound / numSqrt / parseInt / parseFloat / randomInt / numAbsDiff |
| 日期 | nowIso / nowFormat / timestampNow / timestampToDate / addDays / dateDiffDays / dateNow |
| 数组 | listAppend / listGet / listLength / listJoin / listReverse / listSort / listMax / listMin / listChunk / listFlatten / listPluck / listUnique / listSum / listAvg / listSortByField |
| JSON | jsonParse / jsonStringify / readJsonFile / writeJsonFile |
| CSV | csvReadFile / csvWriteFile / csvParseText / csvObjectsToRows / csvRowsToObjects |
| Excel | xlsxListSheets / xlsxReadSheet / xlsxWriteSheet |
| Word | docxCreateText / docxCreateTable |
| PDF | pdfMerge / pdfExtractPages |
| 邮件 | sendMail / sendMailViaEnv / imapConnect / imapFetchUnseen / imapDisconnect |
| HTTP | httpGet / httpPost |
| 通知 | notifyFeishu / notifyDingTalk / notifyWebhook |
| 系统 | clipboardCopy / clipboardPaste / showInfo / showError / showConfirm / showOpenFile / showSaveFile / beep |
| 浏览器 | webOpenBrowser / webOpenUrl / webClick / webInput / webScroll / webPressKey / webExtractText / webWaitFor / webScrapeList / webCloseBrowser / webGetTitle / webGetUrl / webEval / webGoBack / webGoForward / webRefresh / webCheckElement / webClearInput / webSelectOption |
| 桌面 | pickElement / typeText / scroll / pressKey / desktopMoveMouse / desktopClickCoords / desktopScreenshot / desktopGetForeground |

## 开发

本地开发、新增指令、测试与接力交接约定见 [CONTRIBUTING.md](./CONTRIBUTING.md)。一句话：改完跑 `npm run typecheck && npm test && npm run test:sidecar` 三绿，再按 `docs/handoff/` 模板落盘交接文档。

## 已知限制（V1）

- 邮件密码未走 safeStorage 加密入库
- 教程视图内容为占位
- 未配 Windows 代码签名
- WPS/Office COM 轨未做
- 装机版自动更新端到端未在真机验过
- IMAP 真实邮箱兼容性（QQ/163/Gmail 授权码）未验

## 许可证

私有项目，未开源。第三方组件清单见 [docs/THIRD-PARTY-NOTICES.md](./docs/THIRD-PARTY-NOTICES.md)。
