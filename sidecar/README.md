# sidecar · Python 能力桥（阶段 3 起填充）

本目录为 Python sidecar 工作区，规划结构：

```
sidecar/
  server.py         # stdio JSON-RPC 服务（阶段 3 / T6）
  requirements.txt  # opencv-python / rapidocr-onnxruntime / pywinauto / mss …
  bootstrap.ps1     # 下载 Python embeddable + 安装依赖到本地 libs
```

能力：OCR（RapidOCR）、找图（OpenCV 模板匹配）、桌面 UIA（pywinauto）。
通信协议：**stdio JSON-RPC**（Electron 侧 `src/main/sidecar.ts` spawn，心跳 3s、请求超时 30s）。
许可证红线：不引入 GPL/AGPL 依赖进主程序（见《锐流RPA-V3-开发计划书》§4.4）。
