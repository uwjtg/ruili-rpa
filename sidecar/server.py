#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
锐流 RPA · Python sidecar（阶段 3 POC）。

职责：承载 Node 侧生态薄弱的能力——OCR（RapidOCR）、找图（OpenCV 模板匹配）、
后续桌面 UIA（pywinauto）。本阶段先打通「Node 拉起 sidecar → HTTP 通信 → 能力探测」
链路；OCR / 找图在依赖未安装时返回 501 优雅降级，不导致崩溃。

协议（HTTP，仅监听 127.0.0.1）：
  GET  /health           -> {"ok": true, "version", "engines": {"ocr": bool, "cv2": bool}}
  POST /ocr              body {"image_path": str} -> {"ok": true, "text": str, "lines": [...]} | 501
  POST /find_image       body {"source_path", "template_path"} -> {"ok": true, "x", "y", "score"} | 501

启动时向 stdout 打印一行 `SIDECAR_READY port=<port>`，供 Node 侧同步握手。
仅依赖 Python 标准库即可启动；RapidOCR / OpenCV 为可选增强。
"""

import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict

VERSION = "0.1.0"

# ---- 能力探测（可选依赖，缺失不影响启动） ----
_OCR_ENGINE = None
_OCR_ERR = None
try:
    from rapidocr_onnxruntime import RapidOCR  # type: ignore

    _OCR_ENGINE = RapidOCR()
except Exception as e:  # noqa: BLE001
    _OCR_ERR = str(e)

_CV2 = None
try:
    import cv2  # type: ignore

    _CV2 = cv2
except Exception as e:  # noqa: BLE001
    _CV2 = None
    _CV2_ERR = str(e)


def engines_report() -> Dict[str, bool]:
    return {"ocr": _OCR_ENGINE is not None, "cv2": _CV2 is not None}


class Handler(BaseHTTPRequestHandler):
    # 静默默认访问日志（避免污染 stdout 的握手协议）
    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        pass

    def _send_json(self, status: int, body: Dict[str, Any]) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_body(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send_json(
                200,
                {"ok": True, "version": VERSION, "engines": engines_report()},
            )
        else:
            self._send_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        try:
            body = self._read_body()
        except Exception as e:  # noqa: BLE001
            self._send_json(400, {"ok": False, "error": f"bad_json: {e}"})
            return

        if self.path == "/ocr":
            if _OCR_ENGINE is None:
                self._send_json(
                    501,
                    {
                        "ok": False,
                        "error": "ocr_unavailable",
                        "detail": f"RapidOCR 未安装: {_OCR_ERR}",
                    },
                )
                return
            image_path = body.get("image_path", "")
            result, _elapse = _OCR_ENGINE(image_path)
            # result: [[box, text, score], ...]
            lines = [
                {"text": item[1], "score": float(item[2])}
                for item in (result or [])
            ]
            text = "\n".join(l["text"] for l in lines)
            self._send_json(200, {"ok": True, "text": text, "lines": lines})
            return

        if self.path == "/find_image":
            if _CV2 is None:
                self._send_json(
                    501,
                    {"ok": False, "error": "cv2_unavailable", "detail": "OpenCV 未安装"},
                )
                return
            source = _CV2.imread(body.get("source_path", ""))
            template = _CV2.imread(body.get("template_path", ""))
            if source is None or template is None:
                self._send_json(400, {"ok": False, "error": "image_read_failed"})
                return
            res = _CV2.matchTemplate(source, template, _CV2.TM_CCOEFF_NORMED)
            _, max_val, _, max_loc = _CV2.minMaxLoc(res)
            self._send_json(
                200,
                {
                    "ok": True,
                    "x": int(max_loc[0]),
                    "y": int(max_loc[1]),
                    "score": float(max_val),
                },
            )
            return

        self._send_json(404, {"ok": False, "error": "not_found"})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=0)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    port = server.server_address[1]
    # 握手行：Node 侧据此知道 sidecar 已就绪
    print(f"SIDECAR_READY port={port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    sys.exit(main())
