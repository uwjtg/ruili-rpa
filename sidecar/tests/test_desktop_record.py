# -*- coding: utf-8 -*-
"""智能录制（M3 切片 3）测试：事件聚合为指令（注入伪 uia/按键映射/窗口 PID）+
HTTP 端点路由（替换 _RECORDER / _PICKER）。真实全局钩子不进单测（走 smoke_record.py）。"""

import json
import sys
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402
from desktop_pick import DesktopRecorder  # noqa: E402


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


# ---------- 伪依赖 ----------

class _Rect:
    def __init__(self, left, top, right, bottom):
        self.left = left
        self.top = top
        self.right = right
        self.bottom = bottom


class _Top:
    NativeWindowHandle = 12345


class _RecCtrl:
    """可供 element_to_dict 使用的伪 UIA 控件（可空特征 → 判定为不可用元素）。"""

    def __init__(self, name="", automation_id="", control_type="", rect=(0, 0, 20, 20), parent=None):
        self.Name = name
        self.AutomationId = automation_id
        self.ControlTypeName = control_type
        self.ClassName = ""
        self.NativeWindowHandle = 0
        self.BoundingRectangle = _Rect(*rect)
        self._top = _Top()
        self._parent = parent

    def GetTopLevelControl(self):
        return self._top

    def GetParentControl(self):
        return self._parent


class _RecUia:
    """ControlFromPoint 按坐标返回伪控件；未注册坐标抛异常（= 解析不到元素）。"""

    def __init__(self, at_points=None):
        self.at = at_points or {}

    def ControlFromPoint(self, x, y):
        c = self.at.get((x, y))
        if c is None:
            raise RuntimeError("no control at point")
        return c


_CHAR = lambda vk, scan, flags: chr(vk) if 32 <= vk <= 126 else ""  # noqa: E731


def _make_recorder(at_points=None):
    return DesktopRecorder(
        uia=_RecUia(at_points),
        char_for_key=_CHAR,
        window_pid_at=lambda x, y: 0,
        foreground_pid=lambda: 0,
    )


# ---------- 生命周期 / 聚合（纯逻辑，不装真实钩子） ----------

def test_stop_when_not_recording_returns_none():
    rec = _make_recorder()
    assert rec.stop() is None
    assert rec.is_recording() is False


def test_start_rejects_when_already_recording():
    rec = _make_recorder()
    rec._recording = True  # 模拟已录制（不装真实钩子）
    assert rec.start(0) is False


def test_click_resolves_element_signature():
    rec = _make_recorder(at_points={(100, 100): _RecCtrl(name="开始", control_type="ButtonControl")})
    rec._t0 = 0.0
    ins = rec._aggregate([("click", 0.1, 100, 100)])
    assert len(ins) == 1
    i = ins[0]
    assert i["kind"] == "click"
    assert i["cmdId"] == "pickElement"
    assert i["label"] == "点击元素「开始」"
    assert i["params"]["target"]["name"] == "开始"
    assert i["params"]["target"]["controlType"] == "ButtonControl"


def test_click_unusable_element_falls_back_to_coords_signature():
    """UIA 解析到空特征控件 → 视为不可用 → 坐标兜底签名（8x8 包围盒）。"""
    rec = _make_recorder(at_points={(100, 100): _RecCtrl()})
    rec._t0 = 0.0
    ins = rec._aggregate([("click", 0.1, 100, 100)])
    assert len(ins) == 1
    t = ins[0]["params"]["target"]
    assert t["name"] == "" and t["controlType"] == ""
    assert t["boundingBox"] == {"x": 96, "y": 96, "width": 8, "height": 8}


def test_element_at_walks_up_to_usable_ancestor():
    """叶控件空特征（任务栏按钮等）→ 向上找最近可用祖先签名。"""
    parent = _RecCtrl(name="开始", control_type="ButtonControl", rect=(0, 870, 50, 895))
    leaf = _RecCtrl(rect=(20, 876, 30, 888), parent=parent)
    rec = _make_recorder(at_points={(24, 880): leaf})
    sig = rec._element_at(24, 880)
    assert sig is not None
    assert sig["name"] == "开始" and sig["controlType"] == "ButtonControl"


def test_element_at_returns_none_when_no_usable_ancestor():
    rec = _make_recorder(at_points={(100, 100): _RecCtrl()})
    assert rec._element_at(100, 100) is None


def test_click_filtered_by_app_pid():
    rec = _make_recorder()
    rec._app_pid = 4242
    rec.window_pid_at = lambda x, y: 4242  # 点在编辑器自己窗口上
    rec._t0 = 0.0
    assert rec._aggregate([("click", 0.1, 100, 100)]) == []


def test_double_click_debounced_to_single_instruction():
    rec = _make_recorder()
    rec._t0 = 0.0
    ins = rec._aggregate(
        [("click", 0.1, 100, 100), ("click", 0.25, 102, 101)]
    )
    assert len(ins) == 1  # 350ms 内同位置 → 合并


def test_typing_burst_aggregates_and_gap_splits():
    rec = _make_recorder()
    rec._t0 = 0.0
    ins = rec._aggregate(
        [
            ("key", 0.1, 0x68, 0, 0),  # h
            ("key", 0.2, 0x65, 0, 0),  # e
            ("key", 0.3, 0x6C, 0, 0),  # l
            ("key", 0.4, 0x6C, 0, 0),  # l
            ("key", 0.5, 0x6F, 0, 0),  # o
            ("key", 5.0, 0x77, 0, 0),  # 停顿 > 800ms → 新段 w
        ]
    )
    types = [i for i in ins if i["kind"] == "type"]
    assert [i["params"]["text"] for i in types] == ["hello", "w"]
    assert all(i["cmdId"] == "typeText" for i in types)


def test_non_text_key_flushes_and_ignored():
    rec = _make_recorder()
    rec._t0 = 0.0
    ins = rec._aggregate(
        [
            ("key", 0.1, 0x68, 0, 0),  # h
            ("key", 0.2, 0x0D, 0, 0),  # Enter（非文本键 → 截断且不产生指令）
            ("key", 0.3, 0x69, 0, 0),  # i
        ]
    )
    types = [i for i in ins if i["kind"] == "type"]
    assert [i["params"]["text"] for i in types] == ["h", "i"]


def test_keys_filtered_when_editor_focused():
    rec = _make_recorder()
    rec._app_pid = 4242
    rec.foreground_pid = lambda: 4242
    rec._t0 = 0.0
    assert rec._aggregate([("key", 0.1, 0x68, 0, 0)]) == []


def test_key_filter_uses_event_time_foreground_pid():
    """回归：key 过滤必须用事件发生时携带的前台 PID，而非聚合时刻的前台。
    （GUI 冒烟发现：用户操作目标窗口时前台是目标应用，stop 聚合时前台已切回
    编辑器自身 → 实时查询会把所有按键误过滤。）"""
    rec = _make_recorder()
    rec._app_pid = 4242
    rec.foreground_pid = lambda: 4242  # 聚合时刻前台=自身（会误过滤的旧行为）
    rec._t0 = 0.0
    # 事件时前台是目标应用(7777) → 即使聚合时前台==app_pid 也必须保留
    ins = rec._aggregate([("key", 0.1, 0x68, 0, 0, 7777)])
    types = [i for i in ins if i["kind"] == "type"]
    assert [i["params"]["text"] for i in types] == ["h"]
    # 事件时前台==app_pid → 过滤
    assert rec._aggregate([("key", 0.1, 0x68, 0, 0, 4242)]) == []


def test_scroll_aggregates_within_gap_and_splits_after_gap():
    rec = _make_recorder()
    rec._t0 = 0.0
    ins = rec._aggregate(
        [
            ("scroll", 0.1, 200, 300, 120),
            ("scroll", 0.2, 201, 300, 120),
            ("scroll", 5.0, 200, 300, -120),
        ]
    )
    scrolls = [i for i in ins if i["kind"] == "scroll"]
    assert [i["params"]["delta"] for i in scrolls] == [240, -120]
    assert all(i["cmdId"] == "scroll" for i in scrolls)
    # 合并事件保留最新一次的位置（同位置 ±10px 内合并）
    assert scrolls[0]["params"]["x"] == 201 and scrolls[0]["params"]["y"] == 300


def test_scroll_filtered_by_app_pid():
    rec = _make_recorder()
    rec._app_pid = 4242
    rec.window_pid_at = lambda x, y: 4242
    rec._t0 = 0.0
    assert rec._aggregate([("scroll", 0.1, 200, 300, 120)]) == []


def test_instruction_ids_and_ordering():
    rec = _make_recorder()
    rec._t0 = 0.0
    ins = rec._aggregate(
        [
            ("click", 0.1, 100, 100),
            ("key", 0.2, 0x68, 0, 0),
            ("scroll", 0.3, 200, 300, 120),
        ]
    )
    assert [i["id"] for i in ins] == ["r1", "r2", "r3"]
    assert [i["kind"] for i in ins] == ["click", "type", "scroll"]
    assert ins[0]["ts"] == 100  # 距录制开始 ms


# ---------- HTTP 端点路由（替换 _RECORDER / _PICKER） ----------

class _FakeRecorder:
    def __init__(self, instructions=None):
        self.started = False
        self.instructions = instructions or []

    def start(self, app_pid=0):
        if self.started:
            return False
        self.started = True
        return True

    def stop(self):
        if not self.started:
            return None
        self.started = False
        return self.instructions


class _FakeDesk:
    def __init__(self):
        self.typed = []
        self.scrolled = []
        self.located = []

    def type_text(self, text):
        self.typed.append(text)

    def scroll(self, target, delta, x=None, y=None):
        self.scrolled.append({"target": target, "delta": delta, "x": x, "y": y})

    def locate_element(self, target):
        self.located.append(target)
        if target.get("name") == "开始":
            return {"found": True, "strategy": "strict", "control": None, "box": None}
        return {"found": False, "strategy": "none", "control": None, "box": None}


def test_record_start_endpoint(monkeypatch):
    fake = _FakeRecorder()
    monkeypatch.setattr(server, "_RECORDER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/record/start", {"app_pid": 4242})
        assert status == 200
        assert body == {"ok": True, "started": True}
        assert fake.started is True
    finally:
        httpd.shutdown()


def test_record_start_already_recording_400(monkeypatch):
    fake = _FakeRecorder()
    fake.started = True
    monkeypatch.setattr(server, "_RECORDER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/record/start", {})
        assert status == 400
        assert body["error"] == "already_recording"
    finally:
        httpd.shutdown()


def test_record_stop_endpoint_returns_instructions(monkeypatch):
    fake = _FakeRecorder(instructions=[{"id": "r1", "kind": "click", "cmdId": "pickElement"}])
    fake.started = True
    monkeypatch.setattr(server, "_RECORDER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/record/stop", {})
        assert status == 200
        assert body["ok"] is True
        assert body["instructions"][0]["cmdId"] == "pickElement"
        assert fake.started is False
    finally:
        httpd.shutdown()


def test_record_stop_not_recording_400(monkeypatch):
    monkeypatch.setattr(server, "_RECORDER", _FakeRecorder())
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/record/stop", {})
        assert status == 400
        assert body["error"] == "not_recording"
    finally:
        httpd.shutdown()


def test_type_text_endpoint(monkeypatch):
    fake = _FakeDesk()
    monkeypatch.setattr(server, "_PICKER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/desktop/type_text", {"text": "hello"})
        assert status == 200
        assert body == {"ok": True}
        assert fake.typed == ["hello"]

        status, body = _post(port, "/desktop/type_text", {})
        assert status == 400
        assert body["error"] == "text_required"
    finally:
        httpd.shutdown()


def test_scroll_endpoint(monkeypatch):
    fake = _FakeDesk()
    monkeypatch.setattr(server, "_PICKER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/desktop/scroll", {"delta": 120, "target": {"name": "x"}})
        assert status == 200
        assert body == {"ok": True}
        assert fake.scrolled == [{"target": {"name": "x"}, "delta": 120, "x": None, "y": None}]

        status, body = _post(port, "/desktop/scroll", {})
        assert status == 400
        assert body["error"] == "delta_required"
    finally:
        httpd.shutdown()


def test_locate_element_endpoint(monkeypatch):
    fake = _FakeDesk()
    monkeypatch.setattr(server, "_PICKER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/desktop/locate_element", {"target": {"name": "开始"}})
        assert status == 200
        assert body == {"ok": True, "found": True, "strategy": "strict"}

        status, body = _post(port, "/desktop/locate_element", {"target": {"name": "别的"}})
        assert status == 200
        assert body == {"ok": True, "found": False, "strategy": "none"}

        status, body = _post(port, "/desktop/locate_element", {})
        assert status == 400
        assert body["error"] == "target_required"
    finally:
        httpd.shutdown()
