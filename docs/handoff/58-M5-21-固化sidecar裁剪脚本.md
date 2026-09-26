# M5 · 切片 21：固化 sidecar 裁剪脚本（build:sidecar）

> 接力开发交接文档 · 版本 V3 原型
>
> - 切片：M5-21 · 把 M5-20 手搓的「复制+裁剪 Python 进 build/python」固化成可复跑的脚本与 npm 命令
> - 依赖切片：[57-M5-20-PythonSidecar打包进resources](./57-M5-20-PythonSidecar打包进resources.md)
> - 状态：**已完成并验证**（`npm run build:sidecar` 一键复现 build/python，自验通过；重打包 151.3 MB）
> - 落盘日期：2026-09-25

---

## 1. 本阶段目标与完成情况

M5-20 把 Python 打进包，但裁剪步骤是手搓命令、换构建机或 Python 升级就会丢（M5-20 §5.3 已挂账）。本次固化：

- 新增 `scripts/build-sidecar.ts`：
  1. 探测源 Python 前缀（`RUILI_SIDECAR_PYTHON_PREFIX` 环境变量优先，否则 PATH 上的 `python -c sys.prefix`）；
  2. 自验源 Python 含 `uiautomation/comtypes/tkinter`，缺则报错退出；
  3. 清理 `build/python/`，robocopy `/E` 复制并 `/XD` 排除重型 ML 目录（torch/cv2/numpy/onnx/scipy/…）、`/XF *.pyc`；
  4. 拷 `sidecar/server.py`、`sidecar/desktop_pick.py` → `build/python/app/`；
  5. 用裁剪后的 `build/python/python.exe` 自验 import 三件套，打印体积。
- `package.json` 加 `"build:sidecar": "vite-node scripts/build-sidecar.ts"`。

## 2. 产出物

- `scripts/build-sidecar.ts`（约 130 行，仅用 node 内置模块）。
- `package.json`：scripts 新增 `build:sidecar`。

## 3. 测试结果原文

```
$ npm run build:sidecar
[build:sidecar] 源 Python: ...\sandbox_runtime\...\python
[build:sidecar] 完成：build/python = 96 MB，自验通过。

$ build/python/python.exe app/server.py --port 8793
SIDECAR_READY / GET /health -> {"ok":true,"engines":{"ocr":false,"cv2":false}}

$ npm run typecheck   # 0 错误
$ npm run dist        # renderer 911.64 kB
→ ruili-rpa-0.1.0-setup.exe  151.3 MB
```

（vitest/pytest 本切片未动业务代码，沿用基线 168/168、84/84。）

## 4. 自检清单

- [x] 脚本落盘 `scripts/build-sidecar.ts`，npm 命令可跑；
- [x] 一键复现 build/python，自验 import 三件套通过；
- [x] 新副本起 sidecar /health 正常；
- [x] typecheck 0；重打包成功，安装包 151.3 MB；
- [x] 未改 RunWireEvent / FlowDoc / sidecar 协议 / 主进程解析逻辑；
- [x] 源 Python 不满足依赖时显式报错，不静默出残包。

## 5. 遗留问题

1. 脚本仍依赖「开发机 PATH 上有带 uiautomation 的完整 Python」；CI/干净机器上需先装 Python+依赖再设 `RUILI_SIDECAR_PYTHON_PREFIX`。
2. `Scripts/` 残留少量 .exe 启动器壳（与 M5-20 同，体积极小）；如需干净可后续在脚本 `/XF *.exe` 并只保留 python.exe。
3. OCR/cv2 仍裁剪掉（装机端 501），是否打进包仍待用户拍板（M5-20 §7.1）。

## 6. 对下一阶段的输入要求

- 重建内嵌 Python 的标准流程：`npm run build:sidecar` → `npm run dist`（先 sidecar 后 dist）。
- 源 Python 换版本/位置：设 `RUILI_SIDECAR_PYTHON_PREFIX` 后重跑 `build:sidecar`。
- 裁剪排除清单集中在 `scripts/build-sidecar.ts` 的 `EXCLUDE_DIRS`，要加 OCR/cv2 就在这里改（连同 pip install 进 build/python）。

## 7. 待用户拍板的决策

1. 装机端 OCR/找图是否要可用（再 +60~80MB）——仍待拍板。
2. 自动更新 electron-updater 的更新源 URL——仍待提供。
3. 官方模板 30+、热键真按键手测（人工）——排期中。
