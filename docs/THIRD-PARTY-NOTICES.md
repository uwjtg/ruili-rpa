# 第三方组件声明（THIRD-PARTY-NOTICES）草稿

> 阶段 5 · T9 许可证审计产物。随安装包发布（计划书 §4.4 / §10 义务）。
> 扫描命令：`npm run license:check`（license-checker --summary）。
> 扫描日期：2026-09-24。

## 1. 结论

- **未发现禁用组件**（计划书 §4.4 红线：EPPlus 5+ / PyMuPDF / Emgu.CV / n8n 源码 / AutoIt / AutoHotkey / GPL·AGPL 进主程序）——**0 违规**。
- 唯一 GPL 字样来自 `jszip` 的**双许可 `(MIT OR GPL-3.0-or-later)`**：本项目选择 **MIT** 选项，不触发 GPL 传染。
- 许可证分布（license-checker 汇总）：MIT 268、ISC 31、Apache-2.0 20、BSD-3-Clause 8、BSD-2-Clause 7、BlueOak-1.0.0 5、MIT(其他) 2、Unlicense 1、CC-BY-4.0 1、(MIT OR GPL) 1、(MIT AND Zlib) 1。

## 2. 运行时直接依赖（随包分发）

| 组件 | 版本 | 许可证 | 用途 |
|---|---|---|---|
| electron | ^44.4 | MIT | 桌面壳 |
| react / react-dom | ^19.3 | MIT | UI |
| react-router-dom | ^7.18 | MIT | 路由 |
| playwright-core | ^1.63 | Apache-2.0 | 网页 CDP 自动化 |
| exceljs | ^4.4 | MIT | Excel 读写 |

## 3.  notable 传递依赖（需履行署名义务）

| 组件 | 许可证 | 说明 / 处置 |
|---|---|---|
| jszip | `(MIT OR GPL-3.0-or-later)` | exceljs 依赖；**本项目选用 MIT**，随包保留其 MIT 许可声明 |
| unzipper / binary / traverse / chainsaw | MIT（traverse、chainsaw 为 MIT/X11） | exceljs 读取 xlsx 的传递依赖 |
| caniuse-lite | CC-BY-4.0 | browserslist 构建期浏览器兼容数据库，**不进运行时**；数据署名 |
| buffers@0.1.1 | 未显式声明（substack 2012 年老式工具） | unzipper→binary 传递依赖，约 30 行 buffer 拼接工具；**本审计标记为低风险观察项**，不属禁用清单；升级 exceljs/unzipper 或替换 Excel 轨时顺带评估 |
| Electron / Chromium | MIT + BSD 子组件 | 见 Electron 官方 LICENSE |

## 4. Python sidecar 依赖（sidecar 进程，独立分发）

| 组件 | 许可证 | 状态 |
|---|---|---|
| Python 标准库 | PSF | 始终随 sidecar |
| opencv-python | Apache-2.0 | 可选（本机已装），找图能力 |
| rapidocr-onnxruntime / PaddleOCR 模型 | Apache-2.0 | **未安装**；阶段 5/M5 按需 pip 安装后补登 |

## 5. 义务履行

- 所有 MIT/Apache-2.0/BSD 组件：保留其版权与许可证声明（本文件 + 安装包内 NOTICES）。
- 不引用影刀任何二进制/资源（计划书 §10）。
- 无 AGPL/GPL 组件进主程序（jszip 选 MIT 分支）。

*本文件为草稿，阶段 6 收尾核对时随安装包构建流程固化。*
