# -*- coding: utf-8 -*-
"""sidecar HTTP 桥的冒烟测试：线程内起真实 server，打 /health、降级路由。"""

import json
import threading
import urllib.request
from http.server import ThreadingHTTPServer

import sys
from pathlib import Path

# 让测试能 import 到 server.py
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402


def _start_server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port


def _get(port, path):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=5) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))


def _post(port, path, body):
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))


def test_health_reports_engines():
    httpd, port = _start_server()
    try:
        status, body = _get(port, "/health")
        assert status == 200
        assert body["ok"] is True
        assert "ocr" in body["engines"]
        assert "cv2" in body["engines"]
    finally:
        httpd.shutdown()


def test_ocr_degrades_gracefully_when_engine_missing():
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/ocr", {"image_path": "x.png"})
        # 未装 RapidOCR 时应为 501 结构化降级；装了则 200（图片不存在会 400，也不崩）
        assert status in (200, 400, 501)
        assert "ok" in body
    finally:
        httpd.shutdown()


def test_find_image_degrades_gracefully():
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/find_image", {"source_path": "a.png", "template_path": "b.png"})
        assert status in (200, 400, 501)
        assert "ok" in body
    finally:
        httpd.shutdown()


def test_unknown_path_404():
    httpd, port = _start_server()
    try:
        status, body = _get(port, "/nope")
        assert status == 404
        assert body["ok"] is False
    finally:
        httpd.shutdown()
