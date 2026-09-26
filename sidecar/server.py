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
  POST /pick/start       body {} -> 阻塞拾取；{"ok": true, "element": {...}} | {"ok": true, "cancelled": true} | {"ok": false, "error"}
  POST /pick/stop        body {} -> {"ok": true, "stopped": bool}
  POST /desktop/click_element  body {"target": {...}, "retries"?: int} -> {"ok": true, "strategy"} | 404 {"ok": false, "error"} | 400
  POST /desktop/locate_element body {"target": {...}} -> {"ok": true, "found": bool, "strategy": str, "trace": [str]} | 400
  POST /desktop/type_text      body {"text": str} -> {"ok": true} | 400
  POST /desktop/scroll         body {"target"?: {...}, "x"?: int, "y"?: int, "delta": int} -> {"ok": true} | 400
  POST /desktop/press_key      body {"keys": str} -> {"ok": true} | 400 | 500
  POST /record/start           body {"app_pid"?: int, "target_pid"?: int, "thresholds"?: object} -> {"ok": true, "started": true} | 400 already_recording
  POST /record/stop            body {} -> {"ok": true, "instructions": [...]} | 400 not_recording

启动时向 stdout 打印一行 `SIDECAR_READY port=<port>`，供 Node 侧同步握手。
仅依赖 Python 标准库即可启动；RapidOCR / OpenCV 为可选增强；桌面拾取依赖
uiautomation 库（Unlicense，计划书 §4.1 选型）与 tkinter（标准库）。
"""

import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict

from desktop_pick import DesktopPicker, DesktopRecorder, ElementNotFoundError

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


# 桌面拾取单例（M3 切片 1）：HTTP handler 线程调 start() 阻塞；测试可替换
_PICKER = DesktopPicker()

# 录制器单例（M3 切片 3）：观察式智能录制；测试可替换
_RECORDER = DesktopRecorder()


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

        # ---- 桌面元素拾取（M3 切片 1） ----
        if self.path == "/pick/start":
            try:
                reply = _PICKER.start(timeout=120.0)
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"ok": False, "error": f"pick_start_failed: {e}"})
                return
            self._send_json(200, reply)
            return

        if self.path == "/pick/stop":
            try:
                stopped = _PICKER.stop()
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"ok": False, "error": f"pick_stop_failed: {e}"})
                return
            self._send_json(200, {"ok": True, "stopped": stopped})
            return

        if self.path == "/desktop/click_element":
            target = body.get("target")
            if not isinstance(target, dict):
                self._send_json(400, {"ok": False, "error": "target_required"})
                return
            retries = body.get("retries")
            if not isinstance(retries, int) or retries < 0 or retries > 5:
                retries = 2  # 默认重试 2 次（共 3 次尝试）
            try:
                strategy = _PICKER.click_element(target, retries=retries)
            except ElementNotFoundError as e:
                self._send_json(404, {"ok": False, "error": str(e)})
                return
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"ok": False, "error": f"click_element_failed: {e}"})
                return
            # strategy：命中的回退链策略（strict/property/ancestor/index/coords）
            self._send_json(200, {"ok": True, "strategy": strategy})
            return

        # ---- 元素 dry-run 定位 / 录制回放（M3 切片 3） ----
        if self.path == "/desktop/locate_element":
            target = body.get("target")
            if not isinstance(target, dict):
                self._send_json(400, {"ok": False, "error": "target_required"})
                return
            try:
                hit = _PICKER.locate_element(target)
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"ok": False, "error": f"locate_element_failed: {e}"})
                return
            # found/strategy：元素库「校验」与回放 dry-run（不点击）
            # trace：逐级定位报告（M3 切片 4，供校验失败原因展示）
            self._send_json(
                200,
                {
                    "ok": True,
                    "found": bool(hit.get("found", False)),
                    "strategy": hit.get("strategy", "none"),
                    "trace": list(hit.get("trace") or []),
                },
            )
            return

        if self.path == "/desktop/type_text":
            text = body.get("text")
            if not isinstance(text, str) or not text:
                self._send_json(400, {"ok": False, "error": "text_required"})
                return
            try:
                _PICKER.type_text(text)
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"ok": False, "error": f"type_text_failed: {e}"})
                return
            self._send_json(200, {"ok": True})
            return

        if self.path == "/desktop/scroll":
            try:
                delta = int(body.get("delta"))
            except (TypeError, ValueError):
                self._send_json(400, {"ok": False, "error": "delta_required"})
                return
            target = body.get("target")
            if not isinstance(target, dict):
                target = None
            try:
                x = None if body.get("x") is None else int(body.get("x"))
                y = None if body.get("y") is None else int(body.get("y"))
            except (TypeError, ValueError):
                self._send_json(400, {"ok": False, "error": "xy_invalid"})
                return
            try:
                _PICKER.scroll(target, delta, x, y)
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"ok": False, "error": f"scroll_failed: {e}"})
                return
            self._send_json(200, {"ok": True})
            return

        if self.path == "/desktop/press_key":
            keys = body.get("keys")
            if not isinstance(keys, str) or not keys:
                self._send_json(400, {"ok": False, "error": "keys_required"})
                return
            try:
                _PICKER.press_key(keys)
            except ValueError as e:
                self._send_json(400, {"ok": False, "error": f"bad_keys: {e}"})
                return
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"ok": False, "error": f"press_key_failed: {e}"})
                return
            self._send_json(200, {"ok": True})
            return

        if self.path == "/desktop/window_pid":
            hwnd = body.get("hwnd")
            if not isinstance(hwnd, int):
                self._send_json(400, {"ok": False, "error": "hwnd_required"})
                return
            pid = _PICKER.window_pid(hwnd)
            self._send_json(200, {"ok": True, "pid": pid})
            return

        # ---- M7 切片 22：坐标级鼠标 / 截图 / 前台窗口 ----
        if self.path == "/desktop/move_mouse":
            try:
                x = int(body.get("x"))
                y = int(body.get("y"))
            except (TypeError, ValueError):
                self._send_json(400, {"ok": False, "error": "xy_required"})
                return
            try:
                _PICKER.move_mouse(x, y)
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"ok": False, "error": f"move_mouse_failed: {e}"})
                return
            self._send_json(200, {"ok": True})
            return

        if self.path == "/desktop/click_coords":
            try:
                x = int(body.get("x"))
                y = int(body.get("y"))
            except (TypeError, ValueError):
                self._send_json(400, {"ok": False, "error": "xy_required"})
                return
            button = body.get("button", "left")
            double = bool(body.get("double", False))
            try:
                _PICKER.click_coords(x, y, str(button), double)
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"ok": False, "error": f"click_coords_failed: {e}"})
                return
            self._send_json(200, {"ok": True})
            return

        if self.path == "/desktop/screenshot":
            path = body.get("path")
            if not isinstance(path, str) or not path:
                self._send_json(400, {"ok": False, "error": "path_required"})
                return
            try:
                saved = _PICKER.screenshot(path)
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"ok": False, "error": f"screenshot_failed: {e}"})
                return
            self._send_json(200, {"ok": True, "path": saved})
            return

        if self.path == "/desktop/foreground_window":
            try:
                info = _PICKER.foreground_window()
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"ok": False, "error": f"foreground_window_failed: {e}"})
                return
            self._send_json(200, {"ok": True, **info})
            return
        # ---- sidecar 运行期配置（M3 切片 18）：主进程推送全局开关 ----
        if self.path == "/desktop/config":
            delay = body.get("foreground_delay_ms")
            if delay is not None and not isinstance(delay, int):
                self._send_json(400, {"ok": False, "error": "foreground_delay_ms_invalid"})
                return
            if delay is not None:
                _PICKER.set_foreground_delay_ms(delay)
            self._send_json(200, {"ok": True})
            return

        # ---- 智能录制（M3 切片 3） ----
        if self.path == "/record/start":
            try:
                app_pid = int(body.get("app_pid") or 0)
            except (TypeError, ValueError):
                self._send_json(400, {"ok": False, "error": "app_pid_invalid"})
                return
            try:
                target_pid = int(body.get("target_pid") or 0)
            except (TypeError, ValueError):
                self._send_json(400, {"ok": False, "error": "target_pid_invalid"})
                return
            thresholds = body.get("thresholds")
            if thresholds is not None and not isinstance(thresholds, dict):
                self._send_json(400, {"ok": False, "error": "thresholds_invalid"})
                return
            try:
                started = _RECORDER.start(app_pid, target_pid, thresholds)
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"ok": False, "error": f"record_start_failed: {e}"})
                return
            if not started:
                self._send_json(400, {"ok": False, "error": "already_recording"})
                return
            self._send_json(200, {"ok": True, "started": True})
            return

        if self.path == "/record/stop":
            try:
                instructions = _RECORDER.stop()
            except Exception as e:  # noqa: BLE001
                self._send_json(500, {"ok": False, "error": f"record_stop_failed: {e}"})
                return
            if instructions is None:
                self._send_json(400, {"ok": False, "error": "not_recording"})
                return
            self._send_json(200, {"ok": True, "instructions": instructions})
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
