"""M7 切片 22：坐标级鼠标 / 截图 / 前台窗口 endpoint 单测。"""
import json
import os
import sys
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server  # noqa: E402


def _start_server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port


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


class _FakeDesk:
    def __init__(self):
        self.moved = []
        self.clicked = []
        self.shots = []

    def move_mouse(self, x, y):
        self.moved.append((x, y))

    def click_coords(self, x, y, button="left", double=False):
        self.clicked.append((x, y, button, double))

    def screenshot(self, path):
        self.shots.append(path)
        return path

    def foreground_window(self):
        return {"hwnd": 123, "title": "记事本", "pid": 456,
                "rect": {"left": 0, "top": 0, "right": 800, "bottom": 600}}


def test_move_mouse_endpoint(monkeypatch):
    fake = _FakeDesk()
    monkeypatch.setattr(server, "_PICKER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/desktop/move_mouse", {"x": 100, "y": 200})
        assert status == 200 and body == {"ok": True}
        assert fake.moved == [(100, 200)]
        status, body = _post(port, "/desktop/move_mouse", {"x": "oops", "y": 1})
        assert status == 400
    finally:
        httpd.shutdown()


def test_click_coords_endpoint(monkeypatch):
    fake = _FakeDesk()
    monkeypatch.setattr(server, "_PICKER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/desktop/click_coords",
                             {"x": 10, "y": 20, "button": "right", "double": True})
        assert status == 200 and body == {"ok": True}
        assert fake.clicked == [(10, 20, "right", True)]
    finally:
        httpd.shutdown()


def test_screenshot_endpoint(monkeypatch):
    fake = _FakeDesk()
    monkeypatch.setattr(server, "_PICKER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/desktop/screenshot", {"path": "C:/tmp/a.png"})
        assert status == 200 and body == {"ok": True, "path": "C:/tmp/a.png"}
        assert fake.shots == ["C:/tmp/a.png"]
        status, body = _post(port, "/desktop/screenshot", {})
        assert status == 400
    finally:
        httpd.shutdown()


def test_foreground_window_endpoint(monkeypatch):
    fake = _FakeDesk()
    monkeypatch.setattr(server, "_PICKER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/desktop/foreground_window", {})
        assert status == 200
        assert body["title"] == "记事本"
        assert body["pid"] == 456
    finally:
        httpd.shutdown()
