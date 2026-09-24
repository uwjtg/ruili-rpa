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
from desktop_pick import _parse_key_combo  # noqa: E402
from desktop_pick import DesktopPicker, ElementNotFoundError  # noqa: E402


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


def test_non_text_key_emits_pressKey_instruction():
    """M3 切片 4：非文本键（Enter）截断文本段并落盘为一条 pressKey 指令。"""
    rec = _make_recorder()
    rec._t0 = 0.0
    ins = rec._aggregate(
        [
            ("key", 0.1, 0x68, 0, 0),  # h
            ("key", 0.2, 0x0D, 0, 0),  # Enter → pressKey
            ("key", 0.3, 0x69, 0, 0),  # i
        ]
    )
    types = [i for i in ins if i["kind"] == "type"]
    assert [i["params"]["text"] for i in types] == ["h", "i"]
    keys = [i for i in ins if i["kind"] == "key"]
    assert len(keys) == 1
    assert keys[0]["cmdId"] == "pressKey"
    assert keys[0]["params"]["keys"] == "Enter"
    assert keys[0]["label"] == "按键 Enter"
    # 顺序：h → Enter → i
    assert [i["kind"] for i in ins] == ["type", "key", "type"]


def test_ctrl_letter_combines_into_hotkey():
    """M3 切片 4：Ctrl 按住 + A → 合并为一条 pressKey "Control+a"。"""
    rec = _make_recorder()
    rec._t0 = 0.0
    ins = rec._aggregate(
        [
            ("key", 0.1, 0x11, 0, 0),  # Control 按下（不单独成指令）
            ("key", 0.15, 0x41, 0, 0),  # A（Ctrl 下 ToUnicode 为控制符）
        ]
    )
    keys = [i for i in ins if i["kind"] == "key"]
    assert len(keys) == 1
    assert keys[0]["cmdId"] == "pressKey"
    assert keys[0]["params"]["keys"] == "Control+a"


def test_shift_letter_stays_text_not_hotkey():
    """Shift 透明（大小写由 vk_to_char 处理）：Shift+A 仍聚合为文本段 "A"。"""
    rec = _make_recorder()
    rec._t0 = 0.0
    ins = rec._aggregate(
        [
            ("key", 0.1, 0x10, 0, 0),  # Shift（透明，不进 held_mods）
            ("key", 0.15, 0x41, 0, 0),  # A → 'A' 文本
        ]
    )
    keys = [i for i in ins if i["kind"] == "key"]
    assert keys == []
    types = [i for i in ins if i["kind"] == "type"]
    assert [i["params"]["text"] for i in types] == ["A"]


def test_modifier_alone_emits_no_instruction():
    """单独按修饰键（未跟主键）不产生指令。"""
    rec = _make_recorder()
    rec._t0 = 0.0
    ins = rec._aggregate([("key", 0.1, 0x11, 0, 0)])  # 仅 Control
    assert ins == []


def test_backspace_emits_pressKey():
    rec = _make_recorder()
    rec._t0 = 0.0
    ins = rec._aggregate([("key", 0.1, 0x08, 0, 0)])  # Backspace
    assert [i["cmdId"] for i in ins] == ["pressKey"]
    assert ins[0]["params"]["keys"] == "Backspace"


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


# ---------- pressKey 组合解析（纯函数） ----------

def test_parse_key_combo():
    assert _parse_key_combo("Enter") == [0x0D]
    assert _parse_key_combo("control+a") == [0x11, 0x41]
    assert _parse_key_combo("Ctrl+Shift+S") == [0x11, 0x10, 0x53]
    assert _parse_key_combo("esc") == [0x1B]
    assert _parse_key_combo("F5") == [0x74]


def test_parse_key_combo_rejects_unknown():
    import pytest as _pytest

    with _pytest.raises(ValueError):
        _parse_key_combo("")
    # 单字母可解析
    assert _parse_key_combo("Control+Q") == [0x11, 0x51]
    with _pytest.raises(ValueError):
        _parse_key_combo("Control+Bogus")



# ---------- M3 切片 6：target_pid 圈定录制范围 ----------

def test_target_pid_filters_clicks():
    rec = _make_recorder()
    rec._t0 = 0.0
    rec._target_pid = 123
    rec.window_pid_at = lambda x, y: {10: 123, 20: 999}.get(x, 0)
    ins = rec._aggregate([
        ("click", 0.1, 10, 10),  # pid 123 目标 → 保留
        ("click", 0.2, 20, 20),  # pid 999 其它窗口 → 过滤
    ])
    assert len(ins) == 1
    assert ins[0]["kind"] == "click"


def test_target_pid_filters_keys():
    rec = _make_recorder()
    rec._t0 = 0.0
    rec._target_pid = 123
    ins = rec._aggregate([
        ("key", 0.1, ord("a"), 0, 0, 123),  # 目标进程 → 聚合文本
        ("key", 0.2, ord("b"), 0, 0, 999),  # 其它进程 → 过滤
    ])
    types = [i for i in ins if i["kind"] == "type"]
    assert [i["params"]["text"] for i in types] == ["a"]


def test_no_target_pid_keeps_clicks_anywhere():
    rec = _make_recorder()
    rec._t0 = 0.0
    rec.window_pid_at = lambda x, y: 999  # 未圈定 → 不过滤
    ins = rec._aggregate([("click", 0.1, 10, 10)])
    assert len(ins) == 1


# ---------- HTTP 端点路由（替换 _RECORDER / _PICKER） ----------

class _FakeRecorder:
    def __init__(self, instructions=None):
        self.started = False
        self.instructions = instructions or []
        self.start_args = None

    def start(self, app_pid=0, target_pid=0):
        if self.started:
            return False
        self.started = True
        self.start_args = (app_pid, target_pid)
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
        self.pressed = []

    def type_text(self, text):
        self.typed.append(text)

    def scroll(self, target, delta, x=None, y=None):
        self.scrolled.append({"target": target, "delta": delta, "x": x, "y": y})

    def press_key(self, keys):
        self.pressed.append(keys)

    def locate_element(self, target):
        self.located.append(target)
        if target.get("name") == "开始":
            return {"found": True, "strategy": "strict", "control": None, "box": None,
                    "trace": ["窗口句柄 1 解析成功", "严格属性命中"]}
        return {"found": False, "strategy": "none", "control": None, "box": None,
                "trace": ["窗口未找到", "全部策略落空"]}


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
        assert body["found"] is True
        assert body["strategy"] == "strict"
        # M3 切片 4：逐级定位 trace 透传
        assert body["trace"] == ["窗口句柄 1 解析成功", "严格属性命中"]

        status, body = _post(port, "/desktop/locate_element", {"target": {"name": "别的"}})
        assert status == 200
        assert body["found"] is False
        assert body["strategy"] == "none"
        assert body["trace"] == ["窗口未找到", "全部策略落空"]

        status, body = _post(port, "/desktop/locate_element", {})
        assert status == 400
        assert body["error"] == "target_required"
    finally:
        httpd.shutdown()


def test_press_key_endpoint(monkeypatch):
    fake = _FakeDesk()
    monkeypatch.setattr(server, "_PICKER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/desktop/press_key", {"keys": "Enter"})
        assert status == 200
        assert body == {"ok": True}
        assert fake.pressed == ["Enter"]

        status, body = _post(port, "/desktop/press_key", {"keys": "Control+A"})
        assert status == 200
        assert fake.pressed == ["Enter", "Control+A"]

        # 空 keys → 400
        status, body = _post(port, "/desktop/press_key", {})
        assert status == 400
        assert body["error"] == "keys_required"
    finally:
        httpd.shutdown()


# ---------- M3 切片 5：click_element 回放稳定性（precheck + 重试 + 重取窗口） ----------

def _picker_with_locate(seq):
    """绕过 __init__（不启真实 UIA/钩子），仅注入 locate_element/_click。"""
    p = object.__new__(DesktopPicker)
    calls = {"n": 0, "clicks": 0}

    def fake_locate(target):
        calls["n"] += 1
        return seq[calls["n"] - 1]

    p.locate_element = fake_locate
    p._click = lambda ctrl: calls.__setitem__("clicks", calls["clicks"] + 1)
    p._click_box_center = lambda box: calls.__setitem__("clicks", calls["clicks"] + 1)
    return p, calls


def _hit_ok():
    return {"found": True, "strategy": "property", "control": object(), "box": None, "trace": ["严格属性未命中", "宽松属性命中"]}


def _hit_fail():
    return {"found": False, "strategy": "none", "control": None, "box": None,
            "trace": ["窗口句柄 123 失效", "全部策略落空"]}


def test_click_retries_then_succeeds():
    """第一次定位失败、第二次成功 → 重试后点击一次，返回策略。"""
    p, calls = _picker_with_locate([_hit_fail(), _hit_ok()])
    strategy = p.click_element({}, retries=3, retry_delay=0)
    assert strategy == "property"
    assert calls["n"] == 2          # 首次 + 重试 1 次
    assert calls["clicks"] == 1     # 只在命中后点击一次


def test_click_retries_exhausted_raises_with_trace():
    """始终定位不到 → 重试满 retries 次后抛错，消息带 trace。"""
    p, calls = _picker_with_locate([_hit_fail(), _hit_fail(), _hit_fail()])
    with pytest.raises(ElementNotFoundError) as ei:
        p.click_element({}, retries=2, retry_delay=0)
    assert calls["n"] == 3          # 首次 + 重试 2 次
    assert calls["clicks"] == 0
    msg = str(ei.value)
    assert "重试 2 次后仍落空" in msg
    assert "窗口句柄 123 失效" in msg  # trace 拼进消息


def test_click_retries_zero_single_attempt():
    """retries=0 → 只尝试一次，立即抛错。"""
    p, calls = _picker_with_locate([_hit_fail()])
    with pytest.raises(ElementNotFoundError):
        p.click_element({}, retries=0, retry_delay=0)
    assert calls["n"] == 1


def test_click_coords_fallback_click_box():
    """命中策略为 coords（control=None）→ 走坐标兜底点击包围盒中心。"""
    box_hit = {"found": True, "strategy": "coords", "control": None,
               "box": {"x": 10, "y": 20, "width": 100, "height": 50}, "trace": ["坐标兜底命中"]}
    p, calls = _picker_with_locate([box_hit])
    strategy = p.click_element({}, retries=0, retry_delay=0)
    assert strategy == "coords"
    assert calls["clicks"] == 1
