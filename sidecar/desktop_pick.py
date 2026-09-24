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
import time
import tkinter as tk
from typing import Any, Callable, Dict, Optional

_ole32 = ctypes.windll.ole32

# 线程级 COM 初始化标记（HTTP 处理线程首次碰 UIA 前必须 CoInitializeEx）
_com_local = threading.local()


def ensure_com_thread() -> None:
    """确保当前线程已初始化 COM（幂等；ThreadingHTTPServer 工作线程复用，只初一次）。"""
    if getattr(_com_local, "init", False):
        return
    try:
        _ole32.CoInitializeEx(None, 0)  # COINIT_APARTMENTTHREADED
        _com_local.init = True
    except Exception:
        pass

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
WM_MOUSEWHEEL = 0x020A
VK_ESCAPE = 0x1B
GWL_EXSTYLE = -20
WS_EX_TRANSPARENT = 0x00000020
WS_EX_LAYERED = 0x00080000

# ---- SendInput / 滚轮常量（录制回放 typeText / scroll） ----
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
MOUSEEVENTF_WHEEL = 0x0800

# ---- 录制聚合阈值（M3 切片 3） ----
CLICK_DEBOUNCE_MS = 350   # 双击/连点防抖：间隔内的同位置点击合并为一次
CLICK_DEBOUNCE_PX = 10
TYPING_GAP_MS = 800       # 键盘输入分段：停顿超过该时长视为新输入段
SCROLL_GAP_MS = 400       # 滚动聚合：间隔内的同位置滚动 delta 累加
COORDS_CLICK_SIZE = 8     # 坐标兜底点击框边长（UIA 解析不到可用元素时）

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


# ---- 键盘字符转换 / 窗口 PID（录制） ----
_user32.GetKeyboardState.argtypes = [ctypes.POINTER(ctypes.c_ubyte)]
_user32.GetKeyboardState.restype = ctypes.c_int
_user32.ToUnicode.argtypes = [
    ctypes.c_uint,
    ctypes.c_uint,
    ctypes.POINTER(ctypes.c_ubyte),
    ctypes.c_wchar_p,
    ctypes.c_int,
    ctypes.c_uint,
]
_user32.ToUnicode.restype = ctypes.c_int
_user32.WindowFromPoint.argtypes = [POINT]
_user32.WindowFromPoint.restype = ctypes.c_void_p
_user32.GetWindowThreadProcessId.argtypes = [
    ctypes.c_void_p,
    ctypes.POINTER(ctypes.c_ulong),
]
_user32.GetWindowThreadProcessId.restype = ctypes.c_ulong
_user32.GetForegroundWindow.restype = ctypes.c_void_p
_user32.GetSystemMetrics.argtypes = [ctypes.c_int]
_user32.GetSystemMetrics.restype = ctypes.c_int

# ---- 前台置顶（M3 切片 13：坐标兜底点击前把目标窗口置前） ----
SW_RESTORE = 9
_user32.SetForegroundWindow.argtypes = [ctypes.c_void_p]
_user32.SetForegroundWindow.restype = ctypes.c_int
_user32.IsIconic.argtypes = [ctypes.c_void_p]
_user32.IsIconic.restype = ctypes.c_int
_user32.ShowWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]
_user32.ShowWindow.restype = ctypes.c_int
_user32.AttachThreadInput.argtypes = [ctypes.c_ulong, ctypes.c_ulong, ctypes.c_int]
_user32.AttachThreadInput.restype = ctypes.c_int

# ---- SendInput（typeText Unicode 输入） ----
class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", ctypes.c_ushort),
        ("wScan", ctypes.c_ushort),
        ("dwFlags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", ctypes.c_void_p),
    ]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", ctypes.c_long),
        ("dy", ctypes.c_long),
        ("mouseData", ctypes.c_ulong),
        ("dwFlags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", ctypes.c_void_p),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", ctypes.c_ulong),
        ("wParamL", ctypes.c_ushort),
        ("wParamH", ctypes.c_ushort),
    ]


class _INPUTUNION(ctypes.Union):
    _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT), ("hi", HARDWAREINPUT)]


class INPUT(ctypes.Structure):
    _anonymous_ = ("u",)
    _fields_ = [("type", ctypes.c_ulong), ("u", _INPUTUNION)]


_user32.SendInput.argtypes = [
    ctypes.c_uint,
    ctypes.POINTER(INPUT),
    ctypes.c_int,
]
_user32.SendInput.restype = ctypes.c_uint


# ---- pressKey / 录制非文本键（M3 切片 4） ----
# 录制聚合：非文本键 vk → 标准名（按下产生一条 pressKey 指令）
VK_TO_NAME = {
    0x08: "Backspace",
    0x09: "Tab",
    0x0D: "Enter",
    0x1B: "Escape",
    0x20: "Space",
    0x21: "PageUp",
    0x22: "PageDown",
    0x23: "End",
    0x24: "Home",
    0x25: "Left",
    0x26: "Up",
    0x27: "Right",
    0x28: "Down",
    0x2D: "Insert",
    0x2E: "Delete",
}
for _i in range(12):
    VK_TO_NAME[0x70 + _i] = f"F{_i + 1}"  # F1..F12

# 录制聚合：这些修饰键与随后主键组合为快捷键（Shift 透明——大小写由 vk_to_char 处理）
_SHORTCUT_MOD_VKS = {0x11: "Control", 0x12: "Alt", 0x5B: "Win", 0x5C: "Win"}

# pressKey 指令解析：标准键名 → vk（含别名；不区分大小写）
KEY_NAME_TO_VK = {
    "backspace": 0x08,
    "tab": 0x09,
    "enter": 0x0D,
    "return": 0x0D,
    "esc": 0x1B,
    "escape": 0x1B,
    "space": 0x20,
    "pageup": 0x21,
    "pagedown": 0x22,
    "end": 0x23,
    "home": 0x24,
    "left": 0x25,
    "up": 0x26,
    "right": 0x27,
    "down": 0x28,
    "insert": 0x2D,
    "delete": 0x2E,
    "shift": 0x10,
    "ctrl": 0x11,
    "control": 0x11,
    "alt": 0x12,
    "win": 0x5B,
}
for _i in range(12):
    KEY_NAME_TO_VK[f"f{_i + 1}"] = 0x70 + _i


def _recorder_vk_name(vk: int) -> Optional[str]:
    """录制时把按键 vk 映射为标准名；字母/数字/未知返回 None。"""
    name = VK_TO_NAME.get(vk)
    if name:
        return name
    if 0x41 <= vk <= 0x5A:  # A-Z
        return chr(vk).lower()
    if 0x30 <= vk <= 0x39:  # 0-9
        return chr(vk)
    return None


def _parse_key_combo(keys: str) -> list:
    """
    解析按键组合（"Enter" / "Control+A" / "Ctrl+Shift+S"）为有序 vk 列表：
    前面的为修饰键（按下不立即释放），最后一个为主键。未知键名抛 ValueError。
    """
    parts = [p.strip().lower() for p in keys.split("+") if p.strip()]
    if not parts:
        raise ValueError("empty_keys")
    vks = []
    for name in parts:
        if name in KEY_NAME_TO_VK:
            vks.append(KEY_NAME_TO_VK[name])
        elif len(name) == 1 and "a" <= name <= "z":
            vks.append(0x41 + ord(name) - ord("a"))
        elif len(name) == 1 and "0" <= name <= "9":
            vks.append(0x30 + ord(name) - ord("0"))
        else:
            raise ValueError(f"unknown_key:{name}")
    return vks


class _HookThread(threading.Thread):
    """
    全局钩子专用线程：自带 GetMessage 消息循环驱动 WH_MOUSE_LL / WH_KEYBOARD_LL。

    钩子回调只在安装线程的消息循环里被系统调用，且会尝试进入 Python（ctypes
    回调需要 GIL）。若装在 tk mainloop 线程，回调会在 Tcl 释放 GIL 的间隙触发
    导致崩溃（PyEval_RestoreThread）。独立线程 + 纯 GetMessageW 循环让回调
    始终在 Python 持有 GIL 的上下文中执行——安全。

    回调不触碰 tkinter；事件经线程安全队列交给消费方（tk 线程轮询 / 录制器 stop 时 drain）。

    两种模式（M3 切片 1/3）：
      - pick（默认）：拾取模式。鼠标左键/右键、Esc 被吞掉（防止误触下层应用），
        推送 ("move", x, y) / ("click", x, y) / ("cancel",)。
      - record：录制模式。观察不吞输入——目标应用正常收到全部操作；推送带时间戳的
        ("click", ts, x, y) / ("scroll", ts, x, y, delta) / ("key", ts, vk, scan, flags)。
    """

    WM_QUIT = 0x0012

    def __init__(
        self,
        mode: str = "pick",
        resolve_sig: Optional[Callable[[int, int], Optional[Dict[str, Any]]]] = None,
    ) -> None:
        super().__init__(name="record-hooks" if mode == "record" else "pick-hooks", daemon=True)
        self._mode = mode
        self._resolve_sig = resolve_sig
        self._ready = threading.Event()
        self._queue: list = []
        self._lock = threading.Lock()
        self._hook_mouse: Optional[int] = None
        self._hook_kbd: Optional[int] = None
        self._mouse_ref: Optional[HOOKPROC] = None
        self._kbd_ref: Optional[HOOKPROC] = None

    def run(self) -> None:
        # 钩子线程内做 UIA（录制事件时解析元素签名）必须初始化 COM
        _ole32.CoInitializeEx(None, 0)  # COINIT_APARTMENTTHREADED
        try:
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
        finally:
            _ole32.CoUninitialize()

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
                if self._mode == "record":
                    # 录制不需要 move 流（减少队列噪音），直接透传
                    return _user32.CallNextHookEx(
                        self._hook_mouse, n_code, w_param, l_param
                    )
                pt = ctypes.cast(l_param, ctypes.POINTER(MSLLHOOKSTRUCT)).contents.pt
                self.push(("move", pt.x, pt.y))
            elif w_param == WM_LBUTTONDOWN:
                pt = ctypes.cast(l_param, ctypes.POINTER(MSLLHOOKSTRUCT)).contents.pt
                if self._mode == "record":
                    # 录制观察不吞输入：目标应用正常收到点击；签名在事件发生时解析
                    # （stop 聚合时开始菜单等 UI 状态可能已变，元素必须按点击瞬间取）
                    sig = None
                    if self._resolve_sig is not None:
                        try:
                            sig = self._resolve_sig(int(pt.x), int(pt.y))
                        except Exception:
                            sig = None
                    self.push(("click", time.monotonic(), pt.x, pt.y, sig))
                    return _user32.CallNextHookEx(
                        self._hook_mouse, n_code, w_param, l_param
                    )
                self.push(("click", pt.x, pt.y))
                return 1  # 吞掉左键事件：防止误触下层应用
            elif w_param == WM_RBUTTONDOWN:
                if self._mode == "record":
                    # 右键透传（可能是用户正常操作）；录制不产生右键指令
                    return _user32.CallNextHookEx(
                        self._hook_mouse, n_code, w_param, l_param
                    )
                self.push(("cancel",))
                return 1
            elif w_param == WM_MOUSEWHEEL and self._mode == "record":
                ms = ctypes.cast(l_param, ctypes.POINTER(MSLLHOOKSTRUCT)).contents
                delta = (ms.mouseData >> 16) & 0xFFFF
                if delta >= 0x8000:
                    delta -= 0x10000  # 高字带符号（正=向上滚动）
                sig = None
                if self._resolve_sig is not None:
                    try:
                        sig = self._resolve_sig(int(ms.pt.x), int(ms.pt.y))
                    except Exception:
                        sig = None
                self.push(
                    ("scroll", time.monotonic(), ms.pt.x, ms.pt.y, delta, sig)
                )
                return _user32.CallNextHookEx(
                    self._hook_mouse, n_code, w_param, l_param
                )
        return _user32.CallNextHookEx(self._hook_mouse, n_code, w_param, l_param)

    def _kbd_proc(self, n_code: int, w_param: int, l_param: int) -> int:
        if n_code >= 0 and w_param == WM_KEYDOWN:
            kb = ctypes.cast(l_param, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
            if self._mode == "record":
                # 录制观察不吞输入：目标应用正常收到按键；附事件发生时的前台 PID
                # （聚合在 stop 时进行，那时用户可能已回到自身应用——必须用事件时前台判定过滤）
                self.push(
                    (
                        "key",
                        time.monotonic(),
                        kb.vkCode,
                        kb.scanCode,
                        kb.flags,
                        _foreground_pid(),
                    )
                )
                return _user32.CallNextHookEx(
                    self._hook_kbd, n_code, w_param, l_param
                )
            if kb.vkCode == VK_ESCAPE:
                self.push(("cancel",))
                return 1  # 吞掉 Esc，避免误触下层应用
        return _user32.CallNextHookEx(self._hook_kbd, n_code, w_param, l_param)


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


def vk_to_char(vk: int, scan: int, flags: int = 0) -> str:
    """
    把按键事件转换为可打印字符（ToUnicode + 当前键盘状态，识别 Shift/大小写/布局）。

    非字符键（Enter/Backspace/功能键/快捷键组合）返回空串——录制聚合层据此
    区分"文本键"与"控制键"。死键（dead key）返回空串（POC 不追补重音字符）。
    """
    if vk <= 0:
        return ""
    buf = ctypes.create_unicode_buffer(8)
    state = (ctypes.c_ubyte * 256)()
    if not _user32.GetKeyboardState(state):
        return ""
    n = _user32.ToUnicode(vk, scan, state, buf, 8, flags)
    if n <= 0:
        return ""
    return buf.value[:n]


def _window_pid_at(x: int, y: int) -> int:
    """屏幕坐标 (x, y) 处窗口的 PID；无窗口返回 0。"""
    try:
        hwnd = _user32.WindowFromPoint(POINT(int(x), int(y)))
    except Exception:
        return 0
    if not hwnd:
        return 0
    pid = ctypes.c_ulong(0)
    _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return int(pid.value)


def _foreground_pid() -> int:
    """前台窗口的 PID；无前台窗口返回 0。"""
    try:
        hwnd = _user32.GetForegroundWindow()
    except Exception:
        return 0
    if not hwnd:
        return 0
    pid = ctypes.c_ulong(0)
    _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return int(pid.value)


def _safe_str(v: Any) -> str:
    return "" if v is None else str(v)


def _safe_attr(ctrl: Any, attr: str) -> str:
    """容错提取控件属性为字符串；缺失/异常返回空串。"""
    try:
        return _safe_str(getattr(ctrl, attr))
    except Exception:
        return ""


def _native_window_handle(ctrl: Any) -> int:
    """取 UIA 控件自带的窗口句柄（M3 切片 13：标题重新定位窗口根后用于置前）；
    缺失/异常返回 0。"""
    try:
        return int(ctrl.NativeWindowHandle or 0)
    except Exception:
        return 0


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
    top_ctrl = None
    try:
        top_ctrl = ctrl.GetTopLevelControl()
    except Exception:
        top_ctrl = None
    try:
        window_handle = int(ctrl.NativeWindowHandle or 0)
    except Exception:
        window_handle = 0
    # 子控件自身没有窗口句柄时，取其顶层窗口句柄（拾取结果需要定位到所在窗口）
    if window_handle <= 0 and top_ctrl is not None:
        try:
            window_handle = int(top_ctrl.NativeWindowHandle or 0)
        except Exception:
            pass

    box: Dict[str, int] = {"x": 0, "y": 0, "width": 0, "height": 0}
    try:
        rect = ctrl.BoundingRectangle
        if rect is not None:
            box = _box(rect)
    except Exception:
        pass

    # M3 切片 7：记录时顶层窗口矩形，回放坐标兜底时据此把旧包围盒换算到窗口新偏移
    win_box: Dict[str, int] = {"x": 0, "y": 0, "width": 0, "height": 0}
    if top_ctrl is not None:
        try:
            wr = top_ctrl.BoundingRectangle
            if wr is not None:
                win_box = _box(wr)
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
        "windowBoundingBox": win_box,
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
    def locate_element(self, target: Dict[str, Any]) -> Dict[str, Any]:
        """
        选择器回退链定位（不点击，供元素库「校验」与录制/回放 dry-run）。
        返回 {"found", "strategy", "control", "box", "trace"}：
          - found=True + strategy=strict/property/ancestor/index：control 为 UIA 控件；
          - found=True + strategy=coords：box 为命中包围盒（坐标兜底）；
          - found=False：全部策略落空且无有效坐标；
          - trace: 逐级定位报告（窗口→strict→property→ancestor→index→coords），
            供元素库「校验失败原因」展示（M3 切片 4）。
        旧 target（无 windowTitle/index/ancestor 字段）自动跳过对应策略，行为兼容。
        """
        ensure_com_thread()
        handle = int(target.get("windowHandle") or 0)
        name = _safe_str(target.get("name"))
        automation_id = _safe_str(target.get("automationId"))
        control_type = _safe_str(target.get("controlType"))
        window_title = _safe_str(target.get("windowTitle"))
        index = int(target.get("index") or -1)
        ancestor = target.get("ancestor") or []
        if not isinstance(ancestor, list):
            ancestor = []

        box = self._valid_box(target.get("boundingBox"))
        trace: list = []

        # 0) 定位窗口根：优先 windowHandle；句柄缺失/失效 → windowTitle → name
        root = None
        root_handle = 0  # M3 切片 13：实际解析成功的窗口句柄（坐标兜底点击前置顶用）
        if handle > 0:
            try:
                root = self._control_from_handle(handle)
                root_handle = handle
                trace.append(f"窗口句柄 {handle} 解析成功")
            except ElementNotFoundError:
                trace.append(f"窗口句柄 {handle} 失效（可能窗口已关闭）")
        if root is None:
            root = self._find_window(
                self._root_control(), window_title or name, 0, [0]
            )
            if root is not None:
                root_handle = _native_window_handle(root)
                trace.append(f"按窗口标题「{window_title or name}」定位成功")
            elif window_title or name:
                trace.append(f"按窗口标题「{window_title or name}」未找到窗口")
            else:
                trace.append("无窗口句柄/标题特征，直接尝试坐标兜底")
        if root is None:
            # 窗口都找不到（被关闭/句柄失效）：只剩坐标兜底
            if box is not None:
                trace.append("窗口未找到 → 坐标兜底命中")
                return {"found": True, "strategy": "coords", "control": None, "box": box, "trace": trace, "window_handle": 0}
            trace.append("窗口未找到且无有效坐标 → 全部策略落空")
            return {"found": False, "strategy": "none", "control": None, "box": None, "trace": trace, "window_handle": 0}

        has_features = bool(automation_id or name or control_type)

        # 1) 严格属性
        found = self._find_strict(root, name, automation_id, control_type, 0, [0])
        if found is not None:
            trace.append("严格属性命中")
            return {"found": True, "strategy": "strict", "control": found, "box": None, "trace": trace, "window_handle": root_handle}
        trace.append("严格属性未命中" if has_features else "严格属性：无可匹配特征，跳过")

        # 2) 宽松属性（任一非空特征命中，容忍特征漂移）
        found = self._find_loose(root, name, automation_id, control_type, 0, [0])
        if found is not None:
            trace.append("宽松属性命中")
            return {"found": True, "strategy": "property", "control": found, "box": None, "trace": trace, "window_handle": root_handle}
        trace.append("宽松属性未命中" if has_features else "宽松属性：无可匹配特征，跳过")

        # 3) ancestor 链
        if ancestor:
            found = self._find_by_ancestor(
                root, ancestor, name, automation_id, control_type, 0, [0]
            )
            if found is not None:
                trace.append("祖先链命中")
                return {"found": True, "strategy": "ancestor", "control": found, "box": None, "trace": trace, "window_handle": root_handle}
            trace.append("祖先链未命中")
        else:
            trace.append("祖先链：无特征，跳过")

        # 4) index
        if index >= 0:
            found = self._find_by_index(
                root, ancestor, index, name, automation_id, control_type, 0, [0]
            )
            if found is not None:
                trace.append(f"序号定位命中（children[{index}]）")
                return {"found": True, "strategy": "index", "control": found, "box": None, "trace": trace, "window_handle": root_handle}
            trace.append(f"序号定位未命中（children[{index}]）")
        else:
            trace.append("序号：未知(-1)，跳过")

        # 5) 坐标兜底（M3 切片 7：窗口移动后按窗口当前位置换算偏移）
        if box is not None:
            remapped, moved = self._remap_coords_box(root, target.get("windowBoundingBox"), box)
            if moved:
                trace.append("坐标兜底命中（按窗口当前位置换算偏移后点击）")
            else:
                trace.append("坐标兜底命中（使用拾取时包围盒）")
            return {"found": True, "strategy": "coords", "control": None, "box": remapped, "trace": trace, "window_handle": root_handle}
        trace.append("坐标兜底：无有效包围盒 → 全部策略落空")
        return {"found": False, "strategy": "none", "control": None, "box": None, "trace": trace, "window_handle": 0}

    def _bring_foreground(self, hwnd: int) -> bool:
        """M3 切片 13：把窗口句柄对应的窗口置前台（坐标兜底点击前置，避免被遮挡点空）。

        Windows 前台锁限制：调用进程非前台时 SetForegroundWindow 可能被拒；先
        AttachThreadInput 把当前线程输入附加到前台线程再置前；最小化窗口先还原。
        任何失败静默返回 False（不阻断坐标兜底点击本身）。
        """
        if not hwnd:
            return False
        try:
            user32 = ctypes.windll.user32
            if user32.IsIconic(hwnd):
                user32.ShowWindow(hwnd, SW_RESTORE)
            fg = user32.GetForegroundWindow()
            cur_thread = ctypes.windll.kernel32.GetCurrentThreadId()
            fg_thread = 0
            if fg:
                fg_thread = user32.GetWindowThreadProcessId(fg, None)
            attached = False
            if fg_thread and fg_thread != cur_thread:
                attached = bool(
                    user32.AttachThreadInput(cur_thread, fg_thread, True)
                )
            user32.SetForegroundWindow(hwnd)
            if attached:
                user32.AttachThreadInput(cur_thread, fg_thread, False)
            return True
        except Exception:
            return False

    def click_element(self, target: Dict[str, Any], retries: int = 2, retry_delay: float = 0.3) -> str:
        """
        按选择器回退链定位 UIA 控件并点击其中心，返回命中的策略名。

        定位逻辑见 locate_element（strict → property → ancestor → index → coords）；
        全部落空且无有效坐标抛 ElementNotFoundError；点击失败抛 RuntimeError。

        回放稳定性（M3 切片 5）：
          - 每次尝试都重跑 locate_element——窗口句柄失效时 locate 会按 windowTitle
            重取窗口根，天然实现「重取窗口句柄」；
          - 未命中则等 retry_delay 秒后重试，最多 retries 次（应对目标应用尚在加载、
            元素暂未就绪的瞬态）；
          - 全部失败抛 ElementNotFoundError，消息附带逐级 trace 便于排查。
        """
        trace: list = []
        for attempt in range(retries + 1):
            hit = self.locate_element(target)
            trace = list(hit.get("trace") or [])
            if hit["found"]:
                if hit["control"] is not None:
                    self._click(hit["control"])
                else:
                    # M3 切片 13：坐标兜底点击前把目标窗口置前，避免被遮挡点空
                    win_handle = hit.get("window_handle") or 0
                    if win_handle:
                        self._bring_foreground(win_handle)
                    self._click_box_center(hit["box"])
                return hit["strategy"]
            if attempt < retries:
                time.sleep(retry_delay)
        raise ElementNotFoundError(
            "未找到元素（重试 {} 次后仍落空）：{}".format(retries, " | ".join(trace))
        )

    @staticmethod
    def _valid_box(raw: Any) -> Optional[Dict[str, int]]:
        """规整 target.boundingBox 为有效包围盒；无效（非 dict / 无尺寸）返回 None。"""
        if not isinstance(raw, dict):
            return None
        try:
            x = int(raw.get("x") or 0)
            y = int(raw.get("y") or 0)
            w = int(raw.get("width") or 0)
            h = int(raw.get("height") or 0)
        except Exception:
            return None
        if w <= 0 or h <= 0:
            return None
        return {"x": x, "y": y, "width": w, "height": h}

    @staticmethod
    def _box_from_ctrl(ctrl: Any) -> Optional[Dict[str, int]]:
        """读 UIA 控件的 BoundingRectangle 为 {x,y,width,height}；失败返回 None。"""
        try:
            rect = ctrl.BoundingRectangle
            if rect is None:
                return None
            left, top = int(rect.left), int(rect.top)
            right, bottom = int(rect.right), int(rect.bottom)
            return {"x": left, "y": top, "width": right - left, "height": bottom - top}
        except Exception:
            return None

    def _remap_coords_box(self, root: Any, recorded_win_box: Any, element_box: Dict[str, int]):
        """M3 切片 7：窗口移动后，把拾取时的元素包围盒按窗口当前位置换算到新偏移。
        返回 (新box, 是否真的发生了平移)；缺记录窗口矩形/当前窗口无效/未移动时原样返回。"""
        try:
            rwb = self._valid_box(recorded_win_box)
            if not rwb or rwb["width"] <= 0 or rwb["height"] <= 0:
                return element_box, False
            cur = self._box_from_ctrl(root)
            if not cur or cur["width"] <= 0:
                return element_box, False
            dx = cur["x"] - rwb["x"]
            dy = cur["y"] - rwb["y"]
            if dx == 0 and dy == 0:
                return element_box, False
            return (
                {
                    "x": int(element_box["x"]) + dx,
                    "y": int(element_box["y"]) + dy,
                    "width": int(element_box["width"]),
                    "height": int(element_box["height"]),
                },
                True,
            )
        except Exception:
            return element_box, False

    def _click_box_center(self, box: Dict[str, int]) -> None:
        """坐标兜底：包围盒中心直接点击。"""
        self._send_click(
            int(box["x"]) + int(box["width"]) // 2,
            int(box["y"]) + int(box["height"]) // 2,
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

    # ---------- 录制回放：typeText / scroll（M3 切片 3） ----------
    def type_text(self, text: str) -> None:
        """按 Unicode 逐字符发送键盘输入（SendInput KEYEVENTF_UNICODE，布局无关）。"""
        for ch in text:
            self._send_unicode(ch)

    @staticmethod
    def _send_unicode(ch: str) -> None:
        """SendInput 单个 Unicode 字符（wVk=0 + wScan=ord(ch) + KEYEVENTF_UNICODE）。"""
        if not ch:
            return
        n = ord(ch)
        for flags in (KEYEVENTF_UNICODE, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP):
            inp = INPUT()
            inp.type = 1  # INPUT_KEYBOARD
            inp.ki = KEYBDINPUT(0, n, flags, 0, None)
            sent = _user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
            if sent == 0:
                raise RuntimeError(
                    f"SendInput 失败 code={ctypes.get_last_error()} (char={ch!r})"
                )

    def scroll(
        self,
        target: Optional[Dict[str, Any]],
        delta: int,
        x: Optional[int] = None,
        y: Optional[int] = None,
    ) -> None:
        """
        在目标控件中心（有 target 且可定位）或屏幕坐标 (x, y) 处发送鼠标滚轮 delta。
        delta 正=向上滚动（与 WM_MOUSEWHEEL 符号一致）。
        """
        cx, cy = x, y
        if target:
            hit = self.locate_element(target)
            if hit["found"]:
                box = None
                if hit["control"] is not None:
                    try:
                        rect = _rect_to_box(hit["control"].BoundingRectangle)
                    except Exception:
                        rect = None
                    if rect is not None:
                        box = {
                            "x": rect[0],
                            "y": rect[1],
                            "width": rect[2] - rect[0],
                            "height": rect[3] - rect[1],
                        }
                if box is None and hit["box"] is not None:
                    box = hit["box"]
                if box is not None:
                    cx = int(box["x"]) + int(box["width"]) // 2
                    cy = int(box["y"]) + int(box["height"]) // 2
        if cx is not None and cy is not None:
            ctypes.windll.user32.SetCursorPos(int(cx), int(cy))
        self._send_wheel(int(delta))

    @staticmethod
    def _send_wheel(delta: int) -> None:
        """发送鼠标滚轮事件（mouse_event MOUSEEVENTF_WHEEL，delta 带符号）。"""
        ctypes.windll.user32.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, int(delta), 0)

    @staticmethod
    def _send_click(x: int, y: int) -> None:
        user32 = ctypes.windll.user32
        user32.SetCursorPos(int(x), int(y))
        MOUSEEVENTF_LEFTDOWN = 0x0002
        MOUSEEVENTF_LEFTUP = 0x0004
        user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)

    # ---------- 录制回放：pressKey（M3 切片 4） ----------
    def press_key(self, keys: str) -> None:
        """
        按下并释放一个按键/组合键（SendInput）。
        keys 形如 "Enter" / "Control+A" / "Ctrl+Shift+S"：修饰键先按下不释放，
        主键按下+释放，再逆序释放修饰键。
        """
        vks = _parse_key_combo(keys)
        for vk in vks[:-1]:
            self._send_key(vk, up=False)
        self._send_key(vks[-1], up=False)
        self._send_key(vks[-1], up=True)
        for vk in reversed(vks[:-1]):
            self._send_key(vk, up=True)

    # ---------- M3 切片 6：窗口句柄 → 进程 PID（圈定录制范围） ----------
    @staticmethod
    def window_pid(hwnd: int) -> int:
        """顶层窗口句柄 → 所属进程 PID（GetWindowThreadProcessId）。失败返回 0。"""
        pid = ctypes.wintypes.DWORD(0)
        if not hwnd:
            return 0
        _user32.GetWindowThreadProcessId(int(hwnd), ctypes.byref(pid))
        return int(pid.value)

    @staticmethod
    def _send_key(vk: int, up: bool) -> None:
        flags = KEYEVENTF_KEYUP if up else 0
        inp = INPUT()
        inp.type = 1  # INPUT_KEYBOARD
        inp.ki = KEYBDINPUT(vk, 0, flags, 0, None)
        sent = _user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
        if sent == 0:
            raise RuntimeError(
                f"SendInput 按键失败 code={ctypes.get_last_error()} (vk={vk:#x})"
            )


def _coords_signature(x: int, y: int) -> Dict[str, Any]:
    """点击时 UIA 解析不到可用元素 → 坐标兜底签名（回放走回退链最后一级 coords）。"""
    half = COORDS_CLICK_SIZE // 2
    return {
        "windowHandle": 0,
        "automationId": "",
        "name": "",
        "controlType": "",
        "className": "",
        "boundingBox": {
            "x": x - half,
            "y": y - half,
            "width": COORDS_CLICK_SIZE,
            "height": COORDS_CLICK_SIZE,
        },
    }


def _resolve_signature(uia: Any, x: int, y: int) -> Optional[Dict[str, Any]]:
    """屏幕坐标处 UIA 元素签名；叶控件不可用（空特征 / 无尺寸 / 超大包围盒）时
    向上找最近可用祖先（任务栏按钮等叶控件常为空白子元素，父级才有 name）。
    录制钩子回调在事件发生时调用（保证 UI 状态与事件一致），聚合层兜底再调。"""
    try:
        ctrl = uia.ControlFromPoint(x, y)
    except Exception:
        return None
    if ctrl is None:
        return None
    try:
        sw = int(_user32.GetSystemMetrics(0) or 1)
        sh = int(_user32.GetSystemMetrics(1) or 1)
    except Exception:
        sw = sh = 1
    for _depth in range(4):
        sig = element_to_dict(ctrl)
        box = sig["boundingBox"]
        usable = (
            box["width"] > 0
            and box["height"] > 0
            and (sig["name"] or sig["automationId"] or sig["controlType"])
            and not (box["width"] * box["height"] >= sw * sh * 0.6)
        )
        if usable:
            return sig
        try:
            parent = ctrl.GetParentControl()
        except Exception:
            return None
        if parent is None:
            return None
        ctrl = parent
    return None


class DesktopRecorder:
    """
    智能录制（M3 切片 3）：复用 _HookThread（record 模式，观察不吞输入），把
    点击 / 键盘输入 / 滚动事件流按阈值聚合为指令序列：

      click  → pickElement（UIA 解析出可用元素 → 完整签名；否则坐标兜底签名）
      input  → typeText（连续可打印字符按 TYPING_GAP_MS 聚段；非文本键截断）
      scroll → scroll（WM_MOUSEWHEEL 按 SCROLL_GAP_MS 聚合，delta 累加）

    指令与元素库共用 PickedElement 签名（主进程 saveElement 去重），录制即入库。
    录制不拦截输入：目标应用正常收到全部操作（与拾取模式相反）。
    测试可注入 uia / char_for_key / window_pid_at / foreground_pid。
    """

    def __init__(
        self,
        uia: Any = None,
        char_for_key: Optional[Callable[[int, int, int], str]] = None,
        window_pid_at: Optional[Callable[[int, int], int]] = None,
        foreground_pid: Optional[Callable[[], int]] = None,
    ) -> None:
        import uiautomation as default_uia  # type: ignore

        self.uia = uia if uia is not None else default_uia
        self.char_for_key = (
            char_for_key if char_for_key is not None else vk_to_char
        )
        self.window_pid_at = (
            window_pid_at if window_pid_at is not None else _window_pid_at
        )
        self.foreground_pid = (
            foreground_pid if foreground_pid is not None else _foreground_pid
        )
        self._hook: Optional[_HookThread] = None
        self._lock = threading.Lock()
        self._recording = False
        self._app_pid = 0
        self._target_pid = 0  # M3 切片 6：圈定录制目标窗口进程（只保留该 PID 的事件）
        self._t0 = 0.0
        # M3 切片 8：聚合阈值可配置（默认模块常量；start 时可被 thresholds 覆盖）
        self._thr = {
            "click_debounce_ms": CLICK_DEBOUNCE_MS,
            "click_debounce_px": CLICK_DEBOUNCE_PX,
            "typing_gap_ms": TYPING_GAP_MS,
            "scroll_gap_ms": SCROLL_GAP_MS,
        }

    # ---------- 状态 / 生命周期 ----------
    def _apply_thresholds(self, thresholds: Any) -> None:
        """把调用方传入的聚合阈值覆盖进 self._thr；非法/缺键静默沿用默认值。"""
        if not isinstance(thresholds, dict):
            return
        for key in self._thr:
            raw = thresholds.get(key)
            if raw is None:
                continue
            try:
                val = int(raw)
            except (TypeError, ValueError):
                continue
            if val < 0:
                continue
            self._thr[key] = val

    def is_recording(self) -> bool:
        return self._recording and self._hook is not None and self._hook.is_alive()

    def start(self, app_pid: int = 0, target_pid: int = 0, thresholds: Optional[dict] = None) -> bool:
        """开启录制（观察模式，不吞输入）。已在录制中返回 False。

        app_pid: 自身进程 PID（其事件一律过滤，避免录到编辑器按钮）；
        target_pid: 圈定的目标窗口进程 PID（M3 切片 6）；非 0 时只保留该 PID 的事件，
          其余窗口/进程的操作一律过滤，消除误录噪声；
        thresholds: 聚合阈值覆盖（M3 切片 8），可含 click_debounce_ms/px、typing_gap_ms、
          scroll_gap_ms；缺失键沿用默认常量。
        """
        with self._lock:
            if self._recording:
                return False
            self._apply_thresholds(thresholds)
            self._t0 = time.monotonic()
            self._app_pid = app_pid
            self._target_pid = target_pid
        hook = _HookThread(
            mode="record", resolve_sig=lambda x, y: self._element_at(int(x), int(y))
        )
        hook.start()
        if not hook.wait_ready(3.0):
            return False
        with self._lock:
            self._hook = hook
            self._recording = True
        return True

    def stop(self) -> Optional[list]:
        """结束录制并聚合事件为指令序列；未在录制返回 None。"""
        with self._lock:
            if not self._recording:
                return None
            self._recording = False
            hook = self._hook
            self._hook = None
        if hook is not None:
            hook.stop()
        events = hook.drain() if hook is not None else []
        return self._aggregate(events)

    # ---------- 事件 → 指令聚合 ----------
    def _aggregate(self, events: list) -> list:
        instructions: list = []
        text_buf: list = []
        text_ts = 0.0
        scroll: Optional[tuple] = None  # (ts, x, y, delta, ev_sig)
        last_click: Optional[tuple] = None  # (ts, x, y)
        held_mods: list = []  # 按住的快捷键修饰键名（Control/Alt/Win；M3 切片 4）

        def seq_id() -> str:
            return f"r{len(instructions) + 1}"

        def flush_text() -> None:
            nonlocal text_buf, text_ts
            if text_buf:
                text = "".join(text_buf)
                instructions.append(
                    {
                        "id": seq_id(),
                        "kind": "type",
                        "cmdId": "typeText",
                        "label": f"输入文本「{text}」",
                        "params": {"text": text},
                        "ts": int((text_ts - self._t0) * 1000),
                    }
                )
                text_buf = []
                text_ts = 0.0

        def flush_scroll() -> None:
            nonlocal scroll
            if scroll is not None:
                ts, x, y, delta, ev_sig = scroll
                sig = ev_sig or self._element_at(x, y)
                instructions.append(
                    {
                        "id": seq_id(),
                        "kind": "scroll",
                        "cmdId": "scroll",
                        "label": f"滚动鼠标（{delta:+}）",
                        "params": {"delta": delta, "target": sig, "x": x, "y": y},
                        "ts": int((ts - self._t0) * 1000),
                    }
                )
                scroll = None

        for ev in events:
            if not ev:
                continue
            kind = ev[0]
            if kind == "click":
                _, ts, x, y = ev[:4]
                # 5 元组携带事件时解析的签名；旧 4 元组（单测）回退到聚合时解析
                ev_sig = ev[4] if len(ev) > 4 else None
                need_pid = bool(self._app_pid or self._target_pid)
                wp = self.window_pid_at(int(x), int(y)) if need_pid else 0
                if self._target_pid and wp != self._target_pid:
                    continue  # 不在目标窗口进程 → 过滤（M3 切片 6 圈定）
                if self._app_pid and wp == self._app_pid:
                    continue  # 点到自己应用（编辑器按钮）→ 过滤杂音
                if (
                    last_click
                    and ts - last_click[0] <= self._thr["click_debounce_ms"] / 1000.0
                    and abs(x - last_click[1]) < self._thr["click_debounce_px"]
                    and abs(y - last_click[2]) < self._thr["click_debounce_px"]
                ):
                    continue  # 双击/连点防抖：合并为一次点击
                last_click = (ts, x, y)
                flush_text()
                flush_scroll()
                sig = ev_sig or self._element_at(int(x), int(y)) or _coords_signature(
                    int(x), int(y)
                )
                label = (
                    sig.get("name")
                    or sig.get("automationId")
                    or sig.get("controlType")
                    or "坐标"
                )
                instructions.append(
                    {
                        "id": seq_id(),
                        "kind": "click",
                        "cmdId": "pickElement",
                        "label": f"点击元素「{label}」",
                        "params": {"target": sig},
                        "ts": int((ts - self._t0) * 1000),
                    }
                )
            elif kind == "key":
                _, ts, vk, scan, flags = ev[:5]
                # 6 元组携带事件时前台 PID；旧 5 元组回退到实时查询（单测注入用）
                need_pid = bool(self._app_pid or self._target_pid)
                fg_pid = ev[5] if len(ev) > 5 else (self.foreground_pid() if need_pid else 0)
                if self._target_pid and fg_pid != self._target_pid:
                    held_mods.clear()
                    continue  # 焦点不在目标窗口进程 → 过滤（M3 切片 6 圈定）
                if self._app_pid and fg_pid == self._app_pid:
                    held_mods.clear()
                    continue  # 输入焦点在自己应用 → 过滤杂音
                flush_scroll()
                vk_i = int(vk)
                # 快捷键修饰键按下（Control/Alt/Win）：记录为按住，不单独产生指令；
                # 随后主键与之组合为一条 pressKey。Shift 透明——大小写由 vk_to_char 处理。
                if vk_i in _SHORTCUT_MOD_VKS:
                    held_mods.append(_SHORTCUT_MOD_VKS[vk_i])
                    continue
                ch = self.char_for_key(vk_i, int(scan), int(flags))
                if ch and ord(ch) >= 32 and not held_mods:
                    # 普通可打印字符（无修饰键）→ 聚合为文本段
                    if text_ts and ts - text_ts > self._thr["typing_gap_ms"] / 1000.0:
                        flush_text()
                    text_buf.append(ch)
                    text_ts = ts
                else:
                    # 非文本键（Enter/Backspace/方向/F键）或 修饰键+字符（快捷键）
                    # → 落盘为一条 pressKey 指令（M3 切片 4：录→存→跑可还原"按 Enter 提交"）
                    flush_text()
                    name = _recorder_vk_name(vk_i)
                    if not name and ch and ord(ch) >= 32:
                        name = ch.lower()  # 修饰键+字符的字符名兜底
                    if name:
                        combo = "+".join([m for m in held_mods if m] + [name])
                        instructions.append(
                            {
                                "id": seq_id(),
                                "kind": "key",
                                "cmdId": "pressKey",
                                "label": f"按键 {combo}",
                                "params": {"keys": combo},
                                "ts": int((ts - self._t0) * 1000),
                            }
                        )
                    held_mods.clear()
            elif kind == "scroll":
                _, ts, x, y, delta = ev[:5]
                # 6 元组携带事件时解析的签名；旧 5 元组（单测）回退到聚合时解析
                ev_sig = ev[5] if len(ev) > 5 else None
                need_pid = bool(self._app_pid or self._target_pid)
                wp = self.window_pid_at(int(x), int(y)) if need_pid else 0
                if self._target_pid and wp != self._target_pid:
                    continue
                if self._app_pid and wp == self._app_pid:
                    continue
                flush_text()
                if (
                    scroll
                    and ts - scroll[0] <= self._thr["scroll_gap_ms"] / 1000.0
                    and abs(x - scroll[1]) < self._thr["click_debounce_px"]
                    and abs(y - scroll[2]) < self._thr["click_debounce_px"]
                ):
                    scroll = (ts, x, y, scroll[3] + delta, scroll[4])
                else:
                    flush_scroll()
                    scroll = (ts, x, y, delta, ev_sig)
        flush_text()
        flush_scroll()
        return instructions

    def _element_at(self, x: int, y: int) -> Optional[Dict[str, Any]]:
        """事件/聚合兜底解析：屏幕坐标处 UIA 元素签名（叶不可用向上找祖先）。"""
        return _resolve_signature(self.uia, x, y)
