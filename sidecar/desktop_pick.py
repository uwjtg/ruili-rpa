#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
锐流 RPA · 桌面元素拾取（M3 切片 1 POC）。

实现两条能力（Windows UIA，依赖 uiautomation 库 + 标准库 tkinter/ctypes）：
  1. 拾取模式（pick/start）：
     全屏透明置顶遮罩（tkinter，仅负责高亮显示）+ 全局鼠标/键盘钩子
     （WH_MOUSE_LL / WH_KEYBOARD_LL，ctypes）负责输入：
       - 鼠标移动 → UIA ElementFromPoint 取控件 → 遮罩高亮其边框；
       - 左键按下 → 吞掉事件（不误触下层应用）并返回元素信息；
       - 右键 / Esc → 取消拾取。
     返回元素形状（与 src/shared/desktop-pick.ts 对齐）：
       {windowHandle, automationId, name, controlType, className, boundingBox:{x,y,width,height}}
  2. 点击回放（desktop/click_element）：
     按拾取结果（windowHandle / automationId / name / controlType）用 UIA 重新
     定位控件并点击其中心，供 pickElement 指令运行时使用。

坐标体系：进程先启用 Per-Monitor DPI awareness，保证 tkinter 屏幕坐标与 UIA
BoundingRectangle（物理像素）一致，高亮框不错位。遮罩加 WS_EX_TRANSPARENT |
WS_EX_LAYERED 扩展样式，使 UIA hit-test 穿透遮罩直达下层窗口（实测有效）。

纯逻辑（element_to_dict / parse_target / _find 匹配）不依赖 GUI，可被 pytest
注入伪对象单测。
"""

from __future__ import annotations

import ctypes
import ctypes.wintypes
import threading
import tkinter as tk
from typing import Any, Callable, Dict, Optional

# 遮罩"透明色"：canvas 背景用该颜色，tk 的 -transparentcolor 把它透传，只露出高亮边框
TRANSPARENT_COLOR = "#FF00FE"
HIGHLIGHT_COLOR = "#7C5CFC"  # 与设计 token 主紫一致
HIGHLIGHT_WIDTH = 3
SEARCH_MAX_DEPTH = 12
SEARCH_MAX_NODES = 5000

# ---- Win32 常量（全局钩子） ----
WH_MOUSE_LL = 14
WH_KEYBOARD_LL = 13
WM_MOUSEMOVE = 0x0200
WM_LBUTTONDOWN = 0x0201
WM_RBUTTONDOWN = 0x0204
WM_KEYDOWN = 0x0100
VK_ESCAPE = 0x1B
GWL_EXSTYLE = -20
WS_EX_TRANSPARENT = 0x00000020
WS_EX_LAYERED = 0x00080000

HOOKPROC = ctypes.WINFUNCTYPE(
    ctypes.c_ssize_t, ctypes.c_int, ctypes.c_ulong, ctypes.c_ssize_t
)

# 显式声明 Win32 签名（windll 默认按 c_int 传参会溢出 64 位指针）
_user32 = ctypes.WinDLL("user32", use_last_error=True)
_user32.SetWindowsHookExW.argtypes = [
    ctypes.c_int,
    HOOKPROC,
    ctypes.c_void_p,
    ctypes.c_ulong,
]
_user32.SetWindowsHookExW.restype = ctypes.c_ssize_t
_user32.CallNextHookEx.argtypes = [
    ctypes.c_ssize_t,
    ctypes.c_int,
    ctypes.c_ulong,
    ctypes.c_ssize_t,
]
_user32.CallNextHookEx.restype = ctypes.c_ssize_t
_user32.UnhookWindowsHookEx.argtypes = [ctypes.c_ssize_t]
_user32.UnhookWindowsHookEx.restype = ctypes.c_int
_user32.GetMessageW.argtypes = [
    ctypes.POINTER(ctypes.wintypes.MSG),
    ctypes.c_void_p,
    ctypes.c_uint,
    ctypes.c_uint,
]
_user32.GetMessageW.restype = ctypes.c_int
_user32.PostThreadMessageW.argtypes = [
    ctypes.c_ulong,
    ctypes.c_uint,
    ctypes.c_ulong,
    ctypes.c_ulong,
]
_user32.PostThreadMessageW.restype = ctypes.c_int


class _HookThread(threading.Thread):
    """
    全局钩子专用线程：自带 GetMessage 消息循环驱动 WH_MOUSE_LL / WH_KEYBOARD_LL。

    钩子回调只在安装线程的消息循环里被系统调用，且会尝试进入 Python（ctypes
    回调需要 GIL）。若装在 tk mainloop 线程，回调会在 Tcl 释放 GIL 的间隙触发
    导致崩溃（PyEval_RestoreThread）。独立线程 + 纯 GetMessageW 循环让回调
    始终在 Python 持有 GIL 的上下文中执行——安全。

    回调不触碰 tkinter；事件经线程安全队列交给 tk 线程轮询消费。
    """

    WM_QUIT = 0x0012

    def __init__(self) -> None:
        super().__init__(name="pick-hooks", daemon=True)
        self._ready = threading.Event()
        self._queue: list = []
        self._lock = threading.Lock()
        self._hook_mouse: Optional[int] = None
        self._hook_kbd: Optional[int] = None
        self._mouse_ref: Optional[HOOKPROC] = None
        self._kbd_ref: Optional[HOOKPROC] = None

    def run(self) -> None:
        self._mouse_ref = HOOKPROC(self._mouse_proc)
        self._kbd_ref = HOOKPROC(self._kbd_proc)
        # LL 钩子（进程内回调）hMod 必须为 NULL；线程 id=0 绑定当前线程
        self._hook_mouse = _user32.SetWindowsHookExW(
            WH_MOUSE_LL, self._mouse_ref, None, 0
        )
        self._hook_kbd = _user32.SetWindowsHookExW(
            WH_KEYBOARD_LL, self._kbd_ref, None, 0
        )
        self._ready.set()
        msg = ctypes.wintypes.MSG()
        while _user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
            pass  # 消息泵：LL 钩子回调在 GetMessageW 返回时被调用
        self._unhook()

    def stop(self) -> None:
        try:
            _user32.PostThreadMessageW(self.ident, self.WM_QUIT, 0, 0)
        except Exception:
            pass

    def wait_ready(self, timeout: float = 3.0) -> bool:
        return self._ready.wait(timeout)

    def push(self, event: tuple) -> None:
        with self._lock:
            self._queue.append(event)

    def drain(self) -> list:
        with self._lock:
            q = self._queue
            self._queue = []
        return q

    def _unhook(self) -> None:
        if self._hook_mouse:
            _user32.UnhookWindowsHookEx(self._hook_mouse)
            self._hook_mouse = None
        if self._hook_kbd:
            _user32.UnhookWindowsHookEx(self._hook_kbd)
            self._hook_kbd = None

    def _mouse_proc(self, n_code: int, w_param: int, l_param: int) -> int:
        if n_code >= 0:
            if w_param == WM_MOUSEMOVE:
                pt = ctypes.cast(l_param, ctypes.POINTER(MSLLHOOKSTRUCT)).contents.pt
                self.push(("move", pt.x, pt.y))
            elif w_param == WM_LBUTTONDOWN:
                pt = ctypes.cast(l_param, ctypes.POINTER(MSLLHOOKSTRUCT)).contents.pt
                self.push(("click", pt.x, pt.y))
                return 1  # 吞掉左键事件：防止误触下层应用
            elif w_param == WM_RBUTTONDOWN:
                self.push(("cancel",))
                return 1
        return _user32.CallNextHookEx(self._hook_mouse, n_code, w_param, l_param)

    def _kbd_proc(self, n_code: int, w_param: int, l_param: int) -> int:
        if n_code >= 0 and w_param == WM_KEYDOWN:
            kb = ctypes.cast(l_param, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
            if kb.vkCode == VK_ESCAPE:
                self.push(("cancel",))
                return 1  # 吞掉 Esc，避免误触下层应用
        return _user32.CallNextHookEx(self._hook_kbd, n_code, w_param, l_param)


class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


class MSLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ("pt", POINT),
        ("mouseData", ctypes.c_ulong),
        ("flags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ("vkCode", ctypes.c_ulong),
        ("scanCode", ctypes.c_ulong),
        ("flags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class ElementNotFoundError(Exception):
    """按选择器回放时未找到目标控件。"""


def enable_dpi_awareness() -> None:
    """进程级 DPI aware（Per-Monitor V2 → fallback System aware），在创建任何窗口前调用。"""
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)  # type: ignore[attr-defined]
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()  # type: ignore[attr-defined]
        except Exception:
            pass


def _safe_str(v: Any) -> str:
    return "" if v is None else str(v)


def _safe_attr(ctrl: Any, attr: str) -> str:
    """容错提取控件属性为字符串；缺失/异常返回空串。"""
    try:
        return _safe_str(getattr(ctrl, attr))
    except Exception:
        return ""


def _collect_ancestors(ctrl: Any, max_depth: int = 3) -> tuple:
    """
    从目标控件向上收集祖先链（近→远，最多 max_depth 层）与同级序号。
    返回 (ancestor, index)：
      - ancestor: [{"controlType","name","automationId"}…] 仅含非空特征；
        ancestor[0] 是目标控件的直接父级（离目标最近）。
      - index: 目标控件在直接父级 GetChildren() 中的序号；未知为 -1。
    纯函数（容错）：任何一步失败即停，不抛异常。
    """
    ancestor: list = []
    index = -1
    try:
        parent = ctrl.GetParentControl()
    except Exception:
        parent = None
    cur = ctrl
    for _ in range(max_depth):
        if parent is None:
            break
        # 在父级 children 里找 cur 的序号（children 顺序稳定时可复用）
        try:
            children = list(parent.GetChildren())
            for i, ch in enumerate(children):
                if ch is cur or ch == cur:
                    index = i
                    break
        except Exception:
            children = None
        entry: Dict[str, str] = {}
        for attr, key in (
            ("ControlTypeName", "controlType"),
            ("Name", "name"),
            ("AutomationId", "automationId"),
        ):
            v = _safe_attr(parent, attr)
            if v:
                entry[key] = v
        if entry:
            ancestor.append(entry)
        cur = parent
        try:
            parent = parent.GetParentControl()
        except Exception:
            parent = None
    return ancestor, index


def _window_meta(ctrl: Any) -> tuple:
    """顶层窗口标题与进程 PID（窗口定位锚）。容错返回 ("", 0)。"""
    try:
        top = ctrl.GetTopLevelControl()
    except Exception:
        top = None
    if top is None:
        return "", 0
    title = _safe_attr(top, "Name")
    pid = 0
    try:
        pid = int(getattr(top, "ProcessId") or 0)
    except Exception:
        pid = 0
    return title, pid


def element_to_dict(ctrl: Any) -> Dict[str, Any]:
    """
    把 UIA Control 对象提取为可序列化拾取结果（纯函数，缺失属性容错为空）。

    ctrl 需要具备（可注入伪对象）：
      Name / AutomationId / ControlTypeName / ClassName / NativeWindowHandle / BoundingRectangle
      GetTopLevelControl()
    BoundingRectangle 取 left/top/right/bottom（兼容库的 RECT 对象与 tuple 两种形态）。
    """
    def _box(rect: Any) -> Dict[str, int]:
        try:
            left = int(rect.left)
            top = int(rect.top)
            right = int(rect.right)
            bottom = int(rect.bottom)
        except AttributeError:
            # 兼容 (left, top, right, bottom) 元组
            left, top, right, bottom = (int(x) for x in rect[:4])
        return {"x": left, "y": top, "width": max(0, right - left), "height": max(0, bottom - top)}

    name = automation_id = control_type = class_name = ""
    try:
        name = _safe_str(ctrl.Name)
    except Exception:
        pass
    try:
        automation_id = _safe_str(ctrl.AutomationId)
    except Exception:
        pass
    try:
        control_type = _safe_str(ctrl.ControlTypeName)
    except Exception:
        pass
    try:
        class_name = _safe_str(ctrl.ClassName)
    except Exception:
        pass

    window_handle = 0
    try:
        window_handle = int(ctrl.NativeWindowHandle or 0)
    except Exception:
        window_handle = 0
    # 子控件自身没有窗口句柄时，取其顶层窗口句柄（拾取结果需要定位到所在窗口）
    if window_handle <= 0:
        try:
            top = ctrl.GetTopLevelControl()
            if top is not None:
                window_handle = int(top.NativeWindowHandle or 0)
        except Exception:
            pass

    box: Dict[str, int] = {"x": 0, "y": 0, "width": 0, "height": 0}
    try:
        rect = ctrl.BoundingRectangle
        if rect is not None:
            box = _box(rect)
    except Exception:
        pass

    # M3 切片 2：选择器回退链的冗余特征（可复用选择器描述）
    ancestor, index = _collect_ancestors(ctrl)
    window_title, process_id = _window_meta(ctrl)

    return {
        "windowHandle": window_handle,
        "automationId": automation_id,
        "name": name,
        "controlType": control_type,
        "className": class_name,
        "boundingBox": box,
        "windowTitle": window_title,
        "processId": process_id,
        "text": name,  # 可见文本：UIA Name 通常即文本；独立字段便于文本定位
        "index": index,
        "ancestor": ancestor,
    }


def parse_target(raw: Any) -> Optional[Dict[str, Any]]:
    """解析指令参数里的 target（已是 dict 或 JSON 字符串），非法返回 None。"""
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        import json

        text = raw.strip()
        if not text:
            return None
        try:
            obj = json.loads(text)
        except ValueError:
            return None
        return obj if isinstance(obj, dict) else None
    return None


def _rect_to_box(rect: Any) -> Optional[tuple]:
    """把 UIA BoundingRectangle 规整为 (left, top, right, bottom)；无效返回 None。"""
    if rect is None:
        return None
    try:
        left, top, right, bottom = int(rect.left), int(rect.top), int(rect.right), int(rect.bottom)
    except AttributeError:
        try:
            left, top, right, bottom = (int(x) for x in rect[:4])
        except Exception:
            return None
    if right <= left or bottom <= top:
        return None
    return (left, top, right, bottom)


class DesktopPicker:
    """
    拾取 / 点击回放的统一入口。uia / tk 可注入（测试给伪实现，GUI 路径默认真实）。

    线程模型：HTTP handler 线程调用 start() 阻塞等待；overlay 在独立线程跑
    tkinter 事件循环 + 全局钩子消息回调；stop() 从任意线程置取消标志并退出。
    """

    def __init__(
        self,
        uia: Any = None,
        tklib: Any = None,
        on_pick: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> None:
        import uiautomation as default_uia  # type: ignore

        self.uia = uia if uia is not None else default_uia
        self.tklib = tklib if tklib is not None else tk
        # 拾取完成回调（注入用；主流程直接看 start() 返回值）
        self.on_pick = on_pick

        self._root: Optional[Any] = None
        self._overlay_thread: Optional[threading.Thread] = None
        self._hook_thread: Optional[_HookThread] = None
        self._done = threading.Event()
        self._result: Optional[Dict[str, Any]] = None
        self._cancelled = False
        self._lock = threading.Lock()
        self._highlight_id: Optional[int] = None

    # ---------- 状态 ----------
    def is_picking(self) -> bool:
        return self._overlay_thread is not None and self._overlay_thread.is_alive()

    # ---------- 拾取模式 ----------
    def start(self, timeout: float = 120.0) -> Dict[str, Any]:
        """
        阻塞进入拾取模式直到：左键点击（返回元素）/ 取消 / 超时。
        返回 {ok: True, element: {...}} / {ok: True, cancelled: True} / {ok: False, error}。
        """
        with self._lock:
            if self.is_picking():
                return {"ok": False, "error": "already_picking"}
            self._done.clear()
            self._result = None
            self._cancelled = False

        enable_dpi_awareness()
        self._overlay_thread = threading.Thread(
            target=self._run_overlay, name="pick-overlay", daemon=True
        )
        self._overlay_thread.start()

        finished = self._done.wait(timeout)
        if not finished:
            self._cancelled = True
            self._teardown_overlay()
            return {"ok": False, "error": "pick_timeout"}
        if self._cancelled:
            return {"ok": True, "cancelled": True}
        if self._result is None:
            return {"ok": False, "error": "pick_no_element"}
        return {"ok": True, "element": self._result}

    def stop(self) -> bool:
        """取消拾取；正在拾取返回 True，否则 False。"""
        was_picking = self.is_picking()
        self._cancelled = True
        self._teardown_overlay()
        return was_picking

    def _teardown_overlay(self) -> None:
        root = self._root
        if root is not None:
            try:
                root.after(0, root.quit)  # 跨线程调度退出事件循环
            except Exception:
                try:
                    root.quit()
                except Exception:
                    pass
        self._done.set()

    # ---------- overlay 内部实现（GUI 线程） ----------
    def _run_overlay(self) -> None:
        tklib = self.tklib
        root = tklib.Tk()
        self._root = root
        try:
            w = root.winfo_screenwidth()
            h = root.winfo_screenheight()
            root.overrideredirect(True)
            root.attributes("-topmost", True)
            root.geometry(f"{w}x{h}+0+0")
            # 全屏除高亮边框外全部透传
            root.attributes("-transparentcolor", TRANSPARENT_COLOR)
            root.config(cursor="crosshair")

            canvas = tklib.Canvas(
                root, width=w, height=h, bg=TRANSPARENT_COLOR, highlightthickness=0
            )
            canvas.pack()
            self._canvas = canvas

            # 先 update 确保窗口句柄已创建，再设 WS_EX_TRANSPARENT|WS_EX_LAYERED：
            # 让 UIA hit-test 与鼠标都穿透遮罩（实测有效；输入由全局钩子接管）
            root.update()
            self._make_overlay_input_transparent(root)
            root.update()

            self._hook_thread = _HookThread()
            self._hook_thread.start()
            if not self._hook_thread.wait_ready(3.0):
                raise RuntimeError("全局钩子安装失败")
            self._poll_after_id = root.after(25, self._poll_events)
            root.mainloop()
        finally:
            if self._hook_thread is not None:
                self._hook_thread.stop()
                self._hook_thread = None
            self._root = None
            try:
                root.destroy()
            except Exception:
                pass
            # 清理 tkinter 模块级 _default_root 引用，避免 Tcl 解释器跨线程泄漏告警
            try:
                if getattr(tklib, "_default_root", None) is root:
                    tklib._default_root = None
            except Exception:
                pass
            self._done.set()

    def _make_overlay_input_transparent(self, root: Any) -> None:
        """给遮罩顶层窗口加 WS_EX_TRANSPARENT | WS_EX_LAYERED：UIA hit-test 穿透。"""
        try:
            hwnd = ctypes.windll.user32.GetParent(root.winfo_id())
            style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            ctypes.windll.user32.SetWindowLongW(
                hwnd, GWL_EXSTYLE, style | WS_EX_TRANSPARENT | WS_EX_LAYERED
            )
        except Exception:
            pass

    # ---------- 事件轮询（tk 线程，消费钩子线程队列） ----------
    def _poll_events(self) -> None:
        hook = self._hook_thread
        root = self._root
        if hook is None or root is None:
            return
        for event in hook.drain():
            kind = event[0]
            if kind == "move":
                self._highlight_at(int(event[1]), int(event[2]))
            elif kind == "click":
                self._pick_at(int(event[1]), int(event[2]))
                return  # 拾取完成，mainloop 即将退出
            elif kind == "cancel":
                self._cancelled = True
                root.quit()
                return
        try:
            self._poll_after_id = root.after(25, self._poll_events)
        except Exception:
            pass

    # ---------- 高亮 / 拾取（tk 线程内直接操作 canvas） ----------
    def _highlight_at(self, x: int, y: int) -> None:
        canvas = getattr(self, "_canvas", None)
        if canvas is None:
            return
        try:
            ctrl = self.uia.ControlFromPoint(x, y)
            box = _rect_to_box(ctrl.BoundingRectangle)
        except Exception:
            box = None
        if self._highlight_id is not None:
            try:
                canvas.delete(self._highlight_id)
            except Exception:
                pass
            self._highlight_id = None
        if box is None:
            return
        x0, y0, x1, y1 = box
        try:
            canvas.create_rectangle(
                x0 - 2, y0 - 2, x1 + 2, y1 + 2, outline="#FFFFFF", width=1
            )
            self._highlight_id = canvas.create_rectangle(
                x0, y0, x1, y1, outline=HIGHLIGHT_COLOR, width=HIGHLIGHT_WIDTH
            )
        except Exception:
            pass

    def _pick_at(self, x: int, y: int) -> None:
        try:
            ctrl = self.uia.ControlFromPoint(x, y)
            element = element_to_dict(ctrl)
        except Exception:
            self._result = None
            self._cancelled = True
            try:
                self._root.after(0, self._root.quit)
            except Exception:
                pass
            return
        self._result = element
        if self.on_pick is not None:
            try:
                self.on_pick(element)
            except Exception:
                pass
        try:
            self._root.after(0, self._root.quit)
        except Exception:
            pass

    # ---------- 点击回放（pickElement 运行时，选择器回退链） ----------
    def click_element(self, target: Dict[str, Any]) -> str:
        """
        按选择器回退链定位 UIA 控件并点击其中心，返回命中的策略名。

        回退链（M3 切片 2，拾取时冗余存特征、回放时按链降级）：
          1. strict   全部非空强特征（automationId/name/controlType）精确匹配；
          2. property 任一非空特征宽松匹配（切片 1 语义，向后兼容）；
          3. ancestor 祖先链逐级下钻（从远到近），最后一级在父级 children 匹配目标；
          4. index    在已定位父级 children 中按拾取时序号取；
          5. coords   拾取时包围盒中心坐标兜底。

        所有策略落空抛 ElementNotFoundError；点击失败抛 RuntimeError。
        旧 target（无 windowTitle/index/ancestor 字段）自动跳过对应策略，行为兼容。
        """
        handle = int(target.get("windowHandle") or 0)
        name = _safe_str(target.get("name"))
        automation_id = _safe_str(target.get("automationId"))
        control_type = _safe_str(target.get("controlType"))
        window_title = _safe_str(target.get("windowTitle"))
        index = int(target.get("index") or -1)
        ancestor = target.get("ancestor") or []
        if not isinstance(ancestor, list):
            ancestor = []

        # 0) 定位窗口根：优先 windowHandle；句柄缺失/失效 → windowTitle → name
        root = None
        if handle > 0:
            try:
                root = self._control_from_handle(handle)
            except ElementNotFoundError:
                root = None
        if root is None:
            root = self._find_window(
                self._root_control(), window_title or name, 0, [0]
            )
        if root is None:
            # 窗口都找不到（被关闭/句柄失效）：坐标兜底
            self._click_coords(target)
            return "coords"

        # 1) 严格属性
        found = self._find_strict(root, name, automation_id, control_type, 0, [0])
        if found is not None:
            self._click(found)
            return "strict"

        # 2) 宽松属性（任一非空特征命中，容忍特征漂移）
        found = self._find_loose(root, name, automation_id, control_type, 0, [0])
        if found is not None:
            self._click(found)
            return "property"

        # 3) ancestor 链
        if ancestor:
            found = self._find_by_ancestor(
                root, ancestor, name, automation_id, control_type, 0, [0]
            )
            if found is not None:
                self._click(found)
                return "ancestor"

        # 4) index
        if index >= 0:
            found = self._find_by_index(
                root, ancestor, index, name, automation_id, control_type, 0, [0]
            )
            if found is not None:
                self._click(found)
                return "index"

        # 5) 坐标兜底
        self._click_coords(target)
        return "coords"

    def _click_coords(self, target: Dict[str, Any]) -> None:
        """坐标兜底：拾取时包围盒中心直接点击；无有效 bbox 抛 ElementNotFoundError。"""
        box = target.get("boundingBox")
        if (
            isinstance(box, dict)
            and int(box.get("width") or 0) > 0
            and int(box.get("height") or 0) > 0
        ):
            cx = int(box["x"]) + int(box["width"]) // 2
            cy = int(box["y"]) + int(box["height"]) // 2
            self._send_click(cx, cy)
            return
        raise ElementNotFoundError(
            "未找到元素：全部回退链策略落空且无有效坐标（boundingBox）"
        )

    def _attr(self, ctrl: Any, attr: str) -> str:
        return _safe_attr(ctrl, attr)

    def _find_strict(
        self,
        ctrl: Any,
        name: str,
        automation_id: str,
        control_type: str,
        depth: int,
        counter: list,
    ) -> Optional[Any]:
        """严格属性匹配：全部非空强特征同时命中才返回（回退链第 1 级）。"""
        counter[0] += 1
        if counter[0] > SEARCH_MAX_NODES or depth > SEARCH_MAX_DEPTH:
            return None
        wants = [
            (v, a)
            for v, a in (
                (automation_id, "AutomationId"),
                (name, "Name"),
                (control_type, "ControlTypeName"),
            )
            if v
        ]
        if wants and all(self._attr(ctrl, a) == v for v, a in wants):
            return ctrl
        try:
            children = ctrl.GetChildren()
        except Exception:
            return None
        for child in children:
            hit = self._find_strict(
                child, name, automation_id, control_type, depth + 1, counter
            )
            if hit is not None:
                return hit
        return None

    def _find_loose(
        self,
        ctrl: Any,
        name: str,
        automation_id: str,
        control_type: str,
        depth: int,
        counter: list,
    ) -> Optional[Any]:
        """宽松属性匹配：任一非空强特征命中即返回（回退链第 2 级，容忍字段漂移）。"""
        counter[0] += 1
        if counter[0] > SEARCH_MAX_NODES or depth > SEARCH_MAX_DEPTH:
            return None
        fields = [
            (automation_id, "AutomationId"),
            (name, "Name"),
            (control_type, "ControlTypeName"),
        ]
        if any(want and self._attr(ctrl, a) == want for want, a in fields):
            return ctrl
        try:
            children = ctrl.GetChildren()
        except Exception:
            return None
        for child in children:
            hit = self._find_loose(
                child, name, automation_id, control_type, depth + 1, counter
            )
            if hit is not None:
                return hit
        return None

    def _find_child_matching(
        self, parent: Any, anc: Dict[str, Any], counter: list
    ) -> Optional[Any]:
        """在 parent 的直接 children 里找与 anc 非空特征全部相等的节点（ancestor 链一级）。"""
        try:
            children = parent.GetChildren()
        except Exception:
            return None
        for child in children:
            counter[0] += 1
            if counter[0] > SEARCH_MAX_NODES:
                return None
            ok = True
            for key, attr in (
                ("controlType", "ControlTypeName"),
                ("name", "Name"),
                ("automationId", "AutomationId"),
            ):
                want = anc.get(key)
                if want and self._attr(child, attr) != want:
                    ok = False
                    break
            if ok:
                return child
        return None

    def _find_by_ancestor(
        self,
        root: Any,
        ancestor: list,
        name: str,
        automation_id: str,
        control_type: str,
        depth: int,
        counter: list,
    ) -> Optional[Any]:
        """祖先链逐级下钻（从远到近），最后一级在父级 children 里匹配目标非空特征。"""
        cur = root
        for anc in reversed(ancestor):
            node = self._find_child_matching(cur, anc, counter)
            if node is None:
                return None
            cur = node
        # 最后一级：父级 children 中按目标特征（任一非空字段命中）取；
        # 特征全空时视为不约束（结构已由 ancestor 链收敛），取第一个子节点。
        try:
            children = cur.GetChildren()
        except Exception:
            return None
        for child in children:
            counter[0] += 1
            if counter[0] > SEARCH_MAX_NODES:
                return None
            if (
                (not automation_id or self._attr(child, "AutomationId") == automation_id)
                and (not name or self._attr(child, "Name") == name)
                and (
                    not control_type
                    or self._attr(child, "ControlTypeName") == control_type
                )
            ):
                return child
        return None

    def _find_by_index(
        self,
        root: Any,
        ancestor: list,
        index: int,
        name: str,
        automation_id: str,
        control_type: str,
        depth: int,
        counter: list,
    ) -> Optional[Any]:
        """按拾取时序号定位：先按 ancestor 链定位父级（无则窗口根），再取 children[index]。"""
        parent = root
        if ancestor:
            for anc in reversed(ancestor):
                node = self._find_child_matching(parent, anc, counter)
                if node is None:
                    return None
                parent = node
        try:
            children = parent.GetChildren()
        except Exception:
            return None
        if 0 <= index < len(children):
            return children[index]
        return None

    def _control_from_handle(self, handle: int) -> Any:
        ctrl = self.uia.ControlFromHandle(handle)
        if ctrl is None:
            raise ElementNotFoundError(f"窗口句柄 {handle} 无法解析为 UIA 元素")
        return ctrl

    def _root_control(self) -> Any:
        return self.uia.GetRootControl()

    def _find_window(
        self, desktop: Any, name: str, depth: int, counter: list
    ) -> Optional[Any]:
        """在桌面树里找 Name 匹配的顶层窗口（searchDepth 兜底）。"""
        counter[0] += 1
        if counter[0] > SEARCH_MAX_NODES or depth > SEARCH_MAX_DEPTH:
            return None
        try:
            children = desktop.GetChildren()
        except Exception:
            return None
        for child in children:
            counter[0] += 1
            if counter[0] > SEARCH_MAX_NODES:
                return None
            try:
                ctype = _safe_str(child.ControlTypeName)
            except Exception:
                ctype = ""
            if ctype.endswith("WindowControl"):
                try:
                    child_name = _safe_str(child.Name)
                except Exception:
                    child_name = ""
                if name and child_name == name:
                    return child
            hit = self._find_window(child, name, depth + 1, counter)
            if hit is not None:
                return hit
        return None

    def _find(
        self,
        ctrl: Any,
        name: str,
        automation_id: str,
        control_type: str,
        depth: int,
        counter: list,
    ) -> Optional[Any]:
        """在控件子树中按（automationId / name / controlType 非空字段）匹配。"""
        counter[0] += 1
        if counter[0] > SEARCH_MAX_NODES or depth > SEARCH_MAX_DEPTH:
            return None

        def _attr(ctrl_: Any, a: str) -> str:
            try:
                return _safe_str(getattr(ctrl_, a))
            except Exception:
                return ""

        if automation_id and _attr(ctrl, "AutomationId") != automation_id:
            pass
        elif name and _attr(ctrl, "Name") != name:
            pass
        elif control_type and _attr(ctrl, "ControlTypeName") != control_type:
            pass
        else:
            # 任一非空字段命中即视为目标（拾取结果至少有 name 或 automationId 之一）
            if automation_id or name or control_type:
                return ctrl

        try:
            children = ctrl.GetChildren()
        except Exception:
            return None
        for child in children:
            hit = self._find(child, name, automation_id, control_type, depth + 1, counter)
            if hit is not None:
                return hit
        return None

    def _click(self, ctrl: Any) -> None:
        """点击控件：优先 UIA Click（真实鼠标），失败回退中心坐标 + SendInput。"""
        try:
            ctrl.Click()
            return
        except Exception as click_err:  # noqa: BLE001
            last_err = click_err
        # 回退：取可点击点或包围盒中心
        point = None
        try:
            p = ctrl.GetClickablePoint()
            if p is not None and getattr(p, "x", None) is not None:
                point = (int(p.x), int(p.y))
        except Exception:
            point = None
        if point is None:
            try:
                rect = _rect_to_box(ctrl.BoundingRectangle)
                if rect is None:
                    raise RuntimeError("元素包围盒无效")
                left, top, right, bottom = rect
                point = ((left + right) // 2, (top + bottom) // 2)
            except Exception as box_err:  # noqa: BLE001
                raise RuntimeError(
                    f"点击元素失败：{last_err}; 且无法取可点击点：{box_err}"
                ) from box_err
        self._send_click(*point)

    @staticmethod
    def _send_click(x: int, y: int) -> None:
        user32 = ctypes.windll.user32
        user32.SetCursorPos(int(x), int(y))
        MOUSEEVENTF_LEFTDOWN = 0x0002
        MOUSEEVENTF_LEFTUP = 0x0004
        user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
