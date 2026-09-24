# -*- coding: utf-8 -*-
"""桌面拾取（M3 切片 1）测试：纯逻辑 + HTTP 端点路由（GUI 遮罩不进入单测）。"""

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
from desktop_pick import (  # noqa: E402
    DesktopPicker,
    ElementNotFoundError,
    element_to_dict,
    parse_target,
)


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


# ---------- element_to_dict 纯函数 ----------


class _Rect:
    def __init__(self, left, top, right, bottom):
        self.left = left
        self.top = top
        self.right = right
        self.bottom = bottom


class _FakeTop:
    NativeWindowHandle = 12345


class _FakeCtrl:
    def __init__(self, **kw):
        self.Name = kw.get("name", "按钮")
        self.AutomationId = kw.get("automation_id", "btn_1")
        self.ControlTypeName = kw.get("control_type", "ButtonControl")
        self.ClassName = kw.get("class_name", "Button")
        self.NativeWindowHandle = kw.get("handle", 0)
        self.BoundingRectangle = kw.get("rect", _Rect(10, 20, 110, 40))
        self._top = kw.get("top", _FakeTop())

    def GetTopLevelControl(self):
        return self._top


def test_element_to_dict_extracts_all_fields():
    d = element_to_dict(_FakeCtrl())
    assert d == {
        "windowHandle": 12345,  # 子控件自身无句柄 → 顶层窗口句柄
        "automationId": "btn_1",
        "name": "按钮",
        "controlType": "ButtonControl",
        "className": "Button",
        "boundingBox": {"x": 10, "y": 20, "width": 100, "height": 20},
        "windowTitle": "",
        "processId": 0,
        "text": "按钮",
        "index": -1,
        "ancestor": [],
        "windowBoundingBox": {"x": 0, "y": 0, "width": 0, "height": 0},
    }


def test_element_to_dict_keeps_own_window_handle():
    d = element_to_dict(_FakeCtrl(handle=888))
    assert d["windowHandle"] == 888


def test_element_to_dict_tolerates_missing_attrs():
    class Bare:
        BoundingRectangle = None

        def GetTopLevelControl(self):
            raise RuntimeError("no top")

    d = element_to_dict(Bare())
    assert d["windowHandle"] == 0
    assert d["automationId"] == ""
    assert d["name"] == ""
    assert d["controlType"] == ""
    assert d["boundingBox"] == {"x": 0, "y": 0, "width": 0, "height": 0}
    assert d["windowTitle"] == ""
    assert d["processId"] == 0
    assert d["text"] == ""
    assert d["index"] == -1
    assert d["ancestor"] == []


def test_element_to_dict_accepts_tuple_rect():
    class TupleRect:
        Name = "n"
        AutomationId = ""
        ControlTypeName = "EditControl"
        ClassName = "Edit"
        NativeWindowHandle = 0
        BoundingRectangle = (5, 6, 55, 26)

        def GetTopLevelControl(self):
            return _FakeTop()

    d = element_to_dict(TupleRect())
    assert d["boundingBox"] == {"x": 5, "y": 6, "width": 50, "height": 20}
    assert d["text"] == "n"
    assert d["index"] == -1
    assert d["ancestor"] == []


def test_parse_target_accepts_dict_json_and_rejects_garbage():
    assert parse_target({"name": "x"}) == {"name": "x"}
    assert parse_target('{"name": "x"}') == {"name": "x"}
    assert parse_target("   ") is None
    assert parse_target("not-json") is None
    assert parse_target('[1,2]') is None
    assert parse_target(None) is None
    assert parse_target(42) is None


# ---------- HTTP 端点路由（替换 _PICKER） ----------


class _FakePicker:
    def __init__(self):
        self.start_calls = 0
        self.stop_calls = 0
        self.click_calls = []

    def start(self, timeout=120.0):
        self.start_calls += 1
        return {
            "ok": True,
            "element": {
                "windowHandle": 999,
                "automationId": "a",
                "name": "目标",
                "controlType": "ButtonControl",
                "className": "Button",
                "boundingBox": {"x": 1, "y": 2, "width": 10, "height": 5},
            },
        }

    def stop(self):
        self.stop_calls += 1
        return True

    def click_element(self, target, **_kw):
        self.click_calls.append(target)
        return "coords"


def test_pick_start_endpoint_returns_element(monkeypatch):
    fake = _FakePicker()
    monkeypatch.setattr(server, "_PICKER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/pick/start", {})
        assert status == 200
        assert body["ok"] is True
        assert body["element"]["name"] == "目标"
        assert fake.start_calls == 1
    finally:
        httpd.shutdown()


def test_pick_start_endpoint_cancelled(monkeypatch):
    class Cancelled:
        def start(self, timeout=120.0):
            return {"ok": True, "cancelled": True}

        def stop(self):
            return True

        def click_element(self, target, **_kw):
            raise AssertionError("unused")

    monkeypatch.setattr(server, "_PICKER", Cancelled())
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/pick/start", {})
        assert status == 200
        assert body == {"ok": True, "cancelled": True}
    finally:
        httpd.shutdown()


def test_pick_stop_endpoint(monkeypatch):
    fake = _FakePicker()
    monkeypatch.setattr(server, "_PICKER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/pick/stop", {})
        assert status == 200
        assert body == {"ok": True, "stopped": True}
        assert fake.stop_calls == 1
    finally:
        httpd.shutdown()


def test_click_element_endpoint_ok_and_404(monkeypatch):
    fake = _FakePicker()
    monkeypatch.setattr(server, "_PICKER", fake)
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/desktop/click_element", {"target": {"name": "x"}})
        assert status == 200
        assert body == {"ok": True, "strategy": "coords"}
        assert fake.click_calls == [{"name": "x"}]
    finally:
        httpd.shutdown()

    class NotFound:
        def click_element(self, target, **_kw):
            raise ElementNotFoundError("未找到元素")

        def start(self, timeout=120.0):
            raise AssertionError("unused")

        def stop(self):
            return False

    monkeypatch.setattr(server, "_PICKER", NotFound())
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/desktop/click_element", {"target": {"name": "x"}})
        assert status == 404
        assert body["ok"] is False
        assert "未找到元素" in body["error"]
    finally:
        httpd.shutdown()


def test_click_element_endpoint_requires_target(monkeypatch):
    monkeypatch.setattr(server, "_PICKER", _FakePicker())
    httpd, port = _start_server()
    try:
        status, body = _post(port, "/desktop/click_element", {})
        assert status == 400
        assert body["error"] == "target_required"
    finally:
        httpd.shutdown()


# ---------- DesktopPicker 定位/点击逻辑（注入伪 uia） ----------


class _FakeUiaCtrl:
    def __init__(self, automation_id="", name="", control_type="", children=None, clickable=None):
        self.AutomationId = automation_id
        self.Name = name
        self.ControlTypeName = control_type
        self._children = children or []
        self.clicked = False
        self._clickable = clickable

    def GetChildren(self):
        return self._children

    def Click(self):
        self.clicked = True

    def GetClickablePoint(self):
        if self._clickable is None:
            raise RuntimeError("no point")
        return self._clickable


class _FakeUia:
    def __init__(self, root):
        self.root = root
        self.handles = {1: root}

    def ControlFromHandle(self, handle):
        return self.handles.get(handle)

    def GetRootControl(self):
        return self.root


def _make_tree():
    inner = _FakeUiaCtrl(automation_id="", name="输入框", control_type="EditControl", clickable=(50, 60))
    btn = _FakeUiaCtrl(automation_id="btn_ok", name="确定", control_type="ButtonControl", clickable=(100, 100))
    root = _FakeUiaCtrl(automation_id="", name="主窗口", control_type="WindowControl", children=[inner, btn])
    return root, inner, btn


def test_click_element_finds_by_automation_id_and_clicks():
    root, _inner, btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    picker.click_element({"windowHandle": 1, "automationId": "btn_ok", "name": "", "controlType": ""})
    assert btn.clicked is True


def test_click_element_matches_by_name_when_automation_id_empty():
    root, inner, _btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    picker.click_element({"windowHandle": 1, "automationId": "", "name": "输入框", "controlType": "EditControl"})
    assert inner.clicked is True


def test_click_element_not_found_raises():
    root, _inner, _btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    with pytest.raises(ElementNotFoundError):
        picker.click_element({"windowHandle": 1, "automationId": "nope", "name": "", "controlType": ""})


def test_click_element_unknown_handle_raises():
    picker = DesktopPicker(uia=_FakeUia(_make_tree()[0]))
    with pytest.raises(ElementNotFoundError):
        picker.click_element({"windowHandle": 404, "automationId": "", "name": "", "controlType": ""})


def test_click_element_falls_back_to_bounding_box_center(monkeypatch):
    """UIA 定位失败但有 boundingBox 时，坐标兜底点击中心（选择器回退链第 1 级）。"""
    root, _inner, _btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    sent = []
    monkeypatch.setattr(DesktopPicker, "_send_click", classmethod(lambda cls, x, y: sent.append((x, y))))
    # windowHandle 未知 + name 不匹配 → 定位失败 → 走 boundingBox 中心 (110, 120)
    picker.click_element({
        "windowHandle": 404,
        "automationId": "",
        "name": "不存在的名字",
        "controlType": "",
        "boundingBox": {"x": 100, "y": 100, "width": 20, "height": 40},
    })
    assert sent == [(110, 120)]


def test_click_element_no_box_and_not_found_raises():
    root, _inner, _btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    with pytest.raises(ElementNotFoundError):
        picker.click_element({
            "windowHandle": 404,
            "automationId": "",
            "name": "不存在的名字",
            "controlType": "",
            "boundingBox": {"x": 0, "y": 0, "width": 0, "height": 0},
        })


# ---------- M3 切片 2：选择器回退链 ----------


def _box(x=100, y=100, w=20, h=40):
    return {"x": x, "y": y, "width": w, "height": h}


def _sig(**kw):
    base = {
        "windowHandle": 1,
        "automationId": "btn_ok",
        "name": "确定",
        "controlType": "ButtonControl",
        "className": "Button",
        "boundingBox": _box(),
    }
    base.update(kw)
    return base


def test_fallback_strict_wins_when_all_fields_match():
    root, _inner, btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    strategy = picker.click_element(_sig(automationId="btn_ok", name="确定", controlType="ButtonControl"))
    assert strategy == "strict"
    assert btn.clicked is True


def test_fallback_property_when_strict_misses():
    """name 变了但 automationId 还在 → strict 失败，宽松 property 命中。"""
    root, _inner, btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    strategy = picker.click_element(_sig(automationId="btn_ok", name="新名字", controlType="ButtonControl"))
    assert strategy == "property"
    assert btn.clicked is True


def test_fallback_ancestor_chain():
    """目标强特征为空（Electron 深层控件）→ strict/property 跳过，ancestor 链定位父容器。"""
    target = _FakeUiaCtrl(automation_id="", name="", control_type="", clickable=(1, 1))
    panel = _FakeUiaCtrl(automation_id="panel_main", name="", control_type="PaneControl", children=[target])
    inner = _FakeUiaCtrl(automation_id="", name="输入框", control_type="EditControl", clickable=(50, 60))
    root = _FakeUiaCtrl(automation_id="", name="主窗口", control_type="WindowControl", children=[inner, panel])
    picker = DesktopPicker(uia=_FakeUia(root))
    sig = _sig(
        windowHandle=1,
        automationId="",
        name="",
        controlType="",
        ancestor=[{"controlType": "PaneControl", "name": "", "automationId": "panel_main"}],
    )
    strategy = picker.click_element(sig)
    assert strategy == "ancestor"
    assert target.clicked is True


def test_fallback_index_when_ancestor_absent():
    """无 ancestor → index 在窗口根 children 中按序号取（目标特征为空）。"""
    btn = _FakeUiaCtrl(automation_id="", name="", control_type="", clickable=(1, 1))
    inner = _FakeUiaCtrl(automation_id="", name="输入框", control_type="EditControl", clickable=(50, 60))
    root = _FakeUiaCtrl(automation_id="", name="主窗口", control_type="WindowControl", children=[inner, btn])
    picker = DesktopPicker(uia=_FakeUia(root))
    sig = _sig(
        windowHandle=1,
        automationId="",
        name="",
        controlType="",
        index=1,
        ancestor=[],
    )
    strategy = picker.click_element(sig)
    assert strategy == "index"
    assert btn.clicked is True


def test_fallback_coords_when_all_selector_strategies_miss(monkeypatch):
    root, _inner, _btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    sent = []
    monkeypatch.setattr(
        DesktopPicker, "_send_click", classmethod(lambda cls, x, y: sent.append((x, y)))
    )
    strategy = picker.click_element(_sig(
        windowHandle=404,
        automationId="nope",
        name="不存在的",
        controlType="ButtonControl",
        boundingBox=_box(100, 100, 20, 40),
    ))
    assert strategy == "coords"
    assert sent == [(110, 120)]


def test_fallback_window_title_when_handle_invalid(monkeypatch):
    """句柄失效 → windowTitle 在桌面树定位顶层窗口 → 子树匹配目标。"""
    btn = _FakeUiaCtrl(automation_id="btn_ok", name="确定", control_type="ButtonControl", clickable=(1, 1))
    root = _FakeUiaCtrl(automation_id="", name="主窗口", control_type="WindowControl", children=[btn])
    desktop = _FakeUiaCtrl(automation_id="", name="桌面", control_type="", children=[root])
    uia = _FakeUia(desktop)
    uia.handles[1] = root  # 窗口句柄仍映射 root，但 target 故意用失效句柄 404
    picker = DesktopPicker(uia=uia)
    strategy = picker.click_element(_sig(
        windowHandle=404,
        windowTitle="主窗口",
        automationId="btn_ok",
        name="确定",
        controlType="ButtonControl",
    ))
    assert strategy == "strict"
    assert btn.clicked is True


def test_fallback_old_target_without_new_fields_still_works():
    """旧流程 target（无 windowTitle/index/ancestor）→ strict/property 兼容。"""
    root, _inner, btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    strategy = picker.click_element({
        "windowHandle": 1,
        "automationId": "btn_ok",
        "name": "",
        "controlType": "",
        "className": "",
        "boundingBox": _box(),
    })
    assert strategy == "strict"
    assert btn.clicked is True


def test_element_to_dict_collects_ancestor_and_index():
    """拾取时冗余收集祖先链（近→远）与同级序号。"""

    class _Parent:
        AutomationId = "panel_main"
        Name = ""
        ControlTypeName = "PaneControl"
        NativeWindowHandle = 0
        BoundingRectangle = _Rect(0, 0, 400, 300)

        def __init__(self, child):
            self._child = child

        def GetTopLevelControl(self):
            return _FakeTop()

        def GetChildren(self):
            return [self._child]  # 同一目标实例 → 序号 0

    class _WithParent(_FakeCtrl):
        def __init__(self, **kw):
            super().__init__(**kw)
            self._parent = _Parent(self)

        def GetParentControl(self):
            return self._parent

    d = element_to_dict(_WithParent())
    assert d["ancestor"] == [
        {"controlType": "PaneControl", "automationId": "panel_main"}
    ]
    assert d["index"] == 0  # 目标在父级 children 中的序号


def test_element_to_dict_window_meta():
    class _TopWithPid:
        NativeWindowHandle = 12345
        Name = "锐流 RPA 主窗口"
        ProcessId = 4242

    class _ChildOfTop(_FakeCtrl):
        def GetTopLevelControl(self):
            return _TopWithPid()

    d = element_to_dict(_ChildOfTop())
    assert d["windowTitle"] == "锐流 RPA 主窗口"
    assert d["processId"] == 4242


# ---------- M3 切片 3：locate_element dry-run（只定位不点击） ----------

def test_locate_element_finds_without_clicking():
    root, _inner, btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    hit = picker.locate_element(_sig(
        automationId="btn_ok", name="确定", controlType="ButtonControl"
    ))
    assert hit["found"] is True
    assert hit["strategy"] == "strict"
    assert hit["control"] is btn
    assert btn.clicked is False  # dry-run 不点击


def test_locate_element_coords_strategy_with_box():
    root, _inner, _btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    hit = picker.locate_element(_sig(
        windowHandle=404,
        automationId="nope",
        name="不存在的",
        controlType="ButtonControl",
        boundingBox=_box(100, 100, 20, 40),
    ))
    assert hit["found"] is True
    assert hit["strategy"] == "coords"
    assert hit["control"] is None
    assert hit["box"] == {"x": 100, "y": 100, "width": 20, "height": 40}


def test_locate_element_not_found_without_box():
    root, _inner, _btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    hit = picker.locate_element(_sig(
        windowHandle=404,
        automationId="nope",
        name="不存在的",
        controlType="ButtonControl",
        boundingBox=_box(0, 0, 0, 0),  # 无效 box → 无坐标兜底
    ))
    assert hit["found"] is False
    assert hit["strategy"] == "none"


# ---------- M3 切片 13：坐标兜底点击前 SetForegroundWindow 置前 ----------

def test_coords_click_brings_window_foreground_first(monkeypatch):
    """坐标兜底点击：先对目标窗口置前（SetForegroundWindow），再点包围盒中心。"""
    root, _inner, _btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    brought = []
    sent = []
    monkeypatch.setattr(
        DesktopPicker, "_send_click", classmethod(lambda cls, x, y: sent.append((x, y)))
    )
    monkeypatch.setattr(picker, "_bring_foreground", lambda hwnd: brought.append(hwnd))
    picker.click_element({
        "windowHandle": 1,
        "automationId": "nope",
        "name": "不存在的",
        "controlType": "",
        "boundingBox": {"x": 100, "y": 100, "width": 20, "height": 40},
    })
    assert brought == [1]
    assert sent == [(110, 120)]


def test_coords_click_no_window_skips_foreground(monkeypatch):
    """窗口找不到（无句柄/无标题匹配）→ 不调用置前，仍按坐标点击。"""
    root, _inner, _btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    brought = []
    sent = []
    monkeypatch.setattr(
        DesktopPicker, "_send_click", classmethod(lambda cls, x, y: sent.append((x, y)))
    )
    monkeypatch.setattr(picker, "_bring_foreground", lambda hwnd: brought.append(hwnd))
    picker.click_element({
        "windowHandle": 0,
        "automationId": "",
        "name": "找不到的窗口",
        "controlType": "",
        "boundingBox": {"x": 100, "y": 100, "width": 20, "height": 40},
    })
    assert brought == []  # 无窗口可置前
    assert sent == [(110, 120)]


def test_coords_click_foreground_uses_reresolved_window_handle(monkeypatch):
    """句柄失效 → 按标题重新定位窗口根 → 坐标兜底置前用根窗口句柄。"""
    root = _FakeUiaCtrl(automation_id="", name="主窗口", control_type="WindowControl", children=[])
    root.NativeWindowHandle = 777  # 重新定位到的窗口根自身句柄
    desktop = _FakeUiaCtrl(automation_id="", name="桌面", control_type="", children=[root])
    uia = _FakeUia(desktop)
    uia.handles[1] = root
    picker = DesktopPicker(uia=uia)
    brought = []
    sent = []
    monkeypatch.setattr(
        DesktopPicker, "_send_click", classmethod(lambda cls, x, y: sent.append((x, y)))
    )
    monkeypatch.setattr(picker, "_bring_foreground", lambda hwnd: brought.append(hwnd))
    picker.click_element({
        "windowHandle": 404,
        "windowTitle": "主窗口",
        "automationId": "nope",
        "name": "不存在的",
        "controlType": "",
        "boundingBox": {"x": 100, "y": 100, "width": 20, "height": 40},
    })
    assert brought == [777]
    assert sent == [(110, 120)]


def test_bring_foreground_zero_handle_is_noop():
    """无句柄时 _bring_foreground 直接返回 False，不触碰 Win32。"""
    picker = DesktopPicker(uia=_FakeUia(_make_tree()[0]))
    assert picker._bring_foreground(0) is False
    assert picker._bring_foreground(None) is False


def test_locate_coords_returns_window_handle_field():
    """locate_element 的 coords 命中带 window_handle（有窗口时），无窗口为 0。"""
    root, _inner, _btn = _make_tree()
    picker = DesktopPicker(uia=_FakeUia(root))
    hit = picker.locate_element(_sig(
        windowHandle=1,
        automationId="nope",
        name="不存在的",
        controlType="",
        boundingBox=_box(100, 100, 20, 40),
    ))
    assert hit["strategy"] == "coords"
    assert hit["window_handle"] == 1
    miss = picker.locate_element({
        "windowHandle": 0,
        "automationId": "",
        "name": "找不到的窗口",
        "controlType": "",
        "boundingBox": _box(100, 100, 20, 40),
    })
    assert miss["strategy"] == "coords"
    assert miss["window_handle"] == 0
