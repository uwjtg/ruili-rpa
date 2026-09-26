# M5 · 切片 20：Python sidecar 打进 resources（装机即用桌面指令）

> 接力开发交接文档 · 版本 V3 原型
>
> - 切片：M5-20 · 把自带 Python（裁剪版）+ sidecar 脚本打进安装包，主进程按 resourcesPath 定位，装机机器无需另装 Python
> - 依赖切片：[56-M5-19-应用图标](./56-M5-19-应用图标.md)
> - 状态：**已完成并验证**（安装包 155.4 MB；resources/python 实测起 sidecar、/health 与桌面端点正常）
> - 落盘日期：2026-09-25

---

## 1. 本阶段目标与完成情况

M5-18 遗留「装机后桌面指令不能用」——主进程硬编码 `pythonCmd='python'` 且脚本路径用 `process.cwd()`，装机用户机器没有 Python 就跑不了 pickElement / 桌面回放 / 录制。本次按用户拍板（接受体积 +30~50MB）落地：

- **裁剪 Python 整机**：从开发机完整 Python 3.14.7 复制到 `build/python/`，robocopy 排除重型 ML 目录（torch/torchvision/polars/cv2/scipy/onnxruntime/onnx/sympy/matplotlib/skimage/numpy/PIL/fontTools/cryptography/networkx/pygments/ultralytics/insightface 等），保留桌面链路必需的 `uiautomation`+`comtypes`+`tkinter`+标准库。裁剪后 115 MB。
- **sidecar 脚本随包**：`sidecar/server.py`、`sidecar/desktop_pick.py` 复制到 `build/python/app/`。
- **electron-builder extraResources**：`build/python` → 安装后 `resources/python/`。
- **主进程解析**：`src/engine/sidecar/client.ts` 新增 `resolveSidecarRuntime()`——打包态优先用 `process.resourcesPath/python/python.exe` + `.../app/server.py`；开发态回退系统 `python` + 仓库 `sidecar/server.py`（existsSync 双重兜底）。

未改 RunWireEvent / FlowDoc / sidecar 协议 / preload。

## 2. 产出物

- `build/python/`（裁剪版 Python，115 MB，已 gitignore 不入库）。
- `package.json`：`build.extraResources = [{from:"build/python",to:"python"}]`。
- `src/engine/sidecar/client.ts`：新增 `resolveSidecarRuntime()`；构造函数 `(scriptPath?, pythonCmd?)`；导入 `join`。
- `.gitignore`：忽略 `build/python/`。

## 3. 测试结果原文

```
$ npm run typecheck        # 0 错误
$ npx vitest run           # 26 文件 168/168
$ python -m pytest sidecar/tests -q
84 passed in 12.92s
```

打包态 sidecar 实测（直接跑 win-unpacked 内的解释器，不依赖装机机器 Python）：

```
> resources/python/python.exe app/server.py --port 8792
SIDECAR_READY port=8792
GET /health  -> {"ok":true,"version":"0.1.0","engines":{"ocr":false,"cv2":false}}
POST /desktop/window_pid {"hwnd":0} -> {"ok":true,"pid":0}
```

安装包：`dist-installer/ruili-rpa-0.1.0-setup.exe` = **155.4 MB**（上一版 124.0 MB，+31.4 MB，落在拍板的 +30~50MB 区间）。

## 4. 自检清单

- [x] 产出物落盘约定位置；
- [x] typecheck 0、vitest 168/168、pytest 84/84 全绿；
- [x] 打包产物 `resources/python/python.exe` 实测起 sidecar，握手+/health/桌面端点正常；
- [x] torch/cv2/numpy 等重目录已裁剪（不在 resources/python 内）；
- [x] 开发态不受影响（resourcesPath 下无自带 python 时回退系统 python）；
- [x] 未改 RunWireEvent / FlowDoc / sidecar HTTP 协议；
- [x] OCR/OpenCV 因裁剪降级为 501（与设计一致，装机端本就不内置）；
- [x] build/python/ 已 gitignore。

## 5. 遗留问题

1. **OCR / 找图（cv2）在装机端不可用**：裁剪时排除了 onnxruntime/cv2/PIL。要装 OCR 需另行把 RapidOCR+onnxruntime（+~60MB）打进包，后续单独切片。
2. **Scripts/ 残留少量入口 exe 壳**（torchrun/yolo/tqdm 等 .exe 启动器）：robocopy `/XD` 只排除目录，这些单文件壳没排掉，体积极小、不影响运行；下次可 `/XF *.exe` 清理 Scripts。
3. **裁剪版 Python 来源是开发机沙箱运行时 Python 3.14.7**：构建机换 Python 版本或重装后需重跑裁剪步骤（见下）；目前没有固化成 npm script，下次要手动重复。建议后续做个 `scripts/build-sidecar.ts` 固化。
4. **未代码签名**：electron-builder 自动用了 signtool（开发机有证书？日志显示 signing），但正式分发仍需确认证书有效性；Windows SmartScreen 可能仍拦。
5. 未做「装机后真跑一条桌面流程」的 GUI 端到端（需人工点）。

## 6. 对下一阶段的输入要求

- **重新生成裁剪 Python 的步骤**（若 Python 升级/重装）：
  1. robocopy 开发机 Python → `build/python`，`/XD` 排除第 1 节列出的 ML 目录；
  2. 拷 `sidecar/server.py`、`sidecar/desktop_pick.py` → `build/python/app/`；
  3. `build/python/python.exe -c "import uiautomation,comtypes,tkinter"` 验证；
  4. `npm run dist`。
- 打包态 sidecar 路径约定：`resources/python/python.exe` + `resources/python/app/server.py`；主进程解析见 `resolveSidecarRuntime()`，勿硬编码别处。
- 其他基线不变：better-sqlite3 asarUnpack + npmRebuild:false；跑 TS 用 vite-node；preload 加 API 后同步 env.d.ts。

## 7. 待用户拍板的决策

1. **OCR/找图是否要装机可用**：要的话再打一个切片，把 rapidocr_onnxruntime + onnxruntime + opencv-python 打进 `build/python`，预计再 +60~80MB；当前装机端 OCR 接口返回 501 优雅降级。
2. **是否固化裁剪脚本**：把第 6 节步骤做成 `scripts/build-sidecar.ts` + npm script，避免下次手滑。
3. 其余（图标定稿、自动更新源、热键手测、官方模板 30+）仍挂起。
