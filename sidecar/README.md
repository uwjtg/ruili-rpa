# sidecar · Python 能力桥

本目录为 Python sidecar 工作区。

```
sidecar/
  server.py         # HTTP 服务（仅监听 127.0.0.1 动态端口）
  requirements.txt  # opencv-python / rapidocr-onnxruntime / uiautomation / pillow …
  bootstrap.ps1     # 下载 Python embeddable + 安装依赖到本地 libs
```

能力：OCR（RapidOCR）、找图（OpenCV 模板匹配）、桌面拾取/录制（uiautomation + UI Automation）、Office COM（Office 文档）。

通信协议：**HTTP**（Electron 侧 `src/main/sidecar.ts` spawn；启动时 sidecar 向 stdout 打印 `SIDECAR_READY port=<port>` 供 Node 握手；Node 用随机 127.0.0.1 端口，请求超时 30s）。详细路由见 `server.py` 头部 docstring（`/health`、`/ocr`、`/find_image`、`/pick/*`、`/desktop/*`、`/record/*`、Office 接口）。

许可证红线：不引入 GPL/AGPL 依赖进主程序（见《锐流RPA-V3-开发计划书》§4.4）。
