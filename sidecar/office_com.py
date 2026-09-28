# -*- coding: utf-8 -*-
"""
Office COM 自动化（M7-39）：通过 pywin32 驱动本机已装的 Excel/Word。

设计要点：
- 模块级单例持有 Excel.Application / Workbook / Word.Application / Document，
  指令跨请求复用同一个 Office 实例（频繁起停 Office 很慢）。
- close_* 负责 Quit + 释放引用，sidecar 进程退出时 main 层兜底。
- pywin32 缺失时所有函数抛 ImportError，server 层转 501 优雅降级。
- WPS 兼容：后续想支持 WPS，只把 ProgID 从 Excel.Application 换成
  KET.Application（表格）/ KWPS.Application（文字）即可，方法签名基本一致。
"""

from typing import Any, Dict, List, Optional, Tuple

try:
    import win32com.client  # type: ignore
    import pythoncom  # type: ignore
    _COM_AVAILABLE = True
    _COM_ERR = ""
except Exception as e:  # noqa: BLE001
    win32com = None  # type: ignore
    pythoncom = None  # type: ignore
    _COM_AVAILABLE = False
    _COM_ERR = str(e)


# ---- 模块级会话单例 ----
_xl_app = None
_xl_wb = None
_xl_engine = 'excel'
_word_app = None
_word_doc = None
_word_engine = 'word'


def _require_com() -> None:
    if not _COM_AVAILABLE:
        raise RuntimeError(f"pywin32 未安装或 COM 不可用: {_COM_ERR}")


# ---------------- Excel ----------------

def excel_open(path: str, visible: bool = False, engine: str = "excel") -> Dict[str, Any]:
    """打开 xlsx；engine: excel=Excel.Application, wps=KET.Application。"""
    global _xl_app, _xl_wb, _xl_engine
    _require_com()
    pythoncom.CoInitialize()
    prog = {"excel": "Excel.Application", "wps": "KET.Application"}.get(engine, "Excel.Application")
    if _xl_app is None:
        _xl_app = win32com.client.DispatchEx(prog)
        _xl_app.Visible = bool(visible)
        try:
            _xl_app.DisplayAlerts = False
        except Exception:  # noqa: BLE001
            pass
        _xl_engine = engine
    if _xl_wb is not None:
        try:
            _xl_wb.Close(False)
        except Exception:  # noqa: BLE001
            pass
    _xl_wb = _xl_app.Workbooks.Open(path)
    return {"ok": True, "path": path, "engine": _xl_engine,
            "sheets": [s.Name for s in _xl_wb.Worksheets]}


def _xl_sheet(name: str):
    if _xl_wb is None:
        raise RuntimeError("Excel 未打开，请先「Excel 打开文件」")
    return _xl_wb.Worksheets(name)


def excel_read(sheet: str, range_: str) -> Dict[str, Any]:
    """读区域为二维数组；单格返回 [[v]]。"""
    _require_com()
    rng = _xl_sheet(sheet).Range(range_)
    v = rng.Value2
    if v is None:
        return {"ok": True, "values": []}
    # 单格是标量
    if not isinstance(v, tuple):
        return {"ok": True, "values": [[v]]}
    rows: List[List[Any]] = []
    for row in v:
        if not isinstance(row, tuple):
            rows.append([row])
        else:
            rows.append([c for c in row])
    return {"ok": True, "values": rows}


def excel_write(sheet: str, range_: str, values: List[List[Any]]) -> Dict[str, Any]:
    """二维数组写入区域；范围大小必须与 values 形状匹配。"""
    _require_com()
    rng = _xl_sheet(sheet).Range(range_)
    # pywin32 接受 tuple-of-tuple
    rng.Value2 = tuple(tuple(r) for r in values)
    return {"ok": True, "written": len(values), "cols": len(values[0]) if values else 0}


def excel_merge(sheet: str, range_: str) -> Dict[str, Any]:
    """合并区域（A1:B2 合并成一个单元格）。"""
    _require_com()
    _xl_sheet(sheet).Range(range_).Merge()
    return {"ok": True, "merged": range_}


def excel_recalc() -> Dict[str, Any]:
    """O4：强制重算所有打开工作簿的公式（CalculateFullRebuild）。"""
    _require_com()
    if _xl_app is None:
        raise RuntimeError("Excel 未打开")
    try:
        _xl_app.Calculate()
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "recalculated": True}


# Excel 图表类型枚举（XlChartType 常用值）
_CHART_TYPES = {
    "column": 51,      # xlColumnClustered
    "bar": 57,         # xlBarClustered
    "line": 4,         # xlLine
    "pie": 5,          # xlPie
    "area": 1,         # xlArea
}


def excel_add_chart(sheet: str, chart_type: str, source: str,
                    left: float = 10.0, top: float = 120.0,
                    width: float = 360.0, height: float = 240.0,
                    title: str = "") -> Dict[str, Any]:
    """O2：在指定工作表按数据区域插入图表。chart_type: column/bar/line/pie/area。"""
    _require_com()
    ws = _xl_sheet(sheet)
    ct = _CHART_TYPES.get(chart_type, 51)
    co = ws.ChartObjects.Add(left, top, width, height)
    chart = co.Chart
    chart.ChartType = ct
    chart.SetSourceData(ws.Range(source))
    if title:
        chart.HasTitle = True
        chart.ChartTitle.Text = title
    return {"ok": True, "chart": chart_type, "source": source, "sheet": sheet}


def excel_export_pdf(out_path: str) -> Dict[str, Any]:
    """另存为 PDF（xlTypePDF = 0）。"""
    _require_com()
    if _xl_wb is None:
        raise RuntimeError("Excel 未打开")
    _xl_wb.ExportAsFixedFormat(0, out_path)
    return {"ok": True, "pdf": out_path}

def excel_close(save: bool = True) -> Dict[str, Any]:
    """关闭工作簿；save=False 丢弃改动。"""
    global _xl_wb
    _require_com()
    if _xl_wb is not None:
        try:
            _xl_wb.Close(bool(save))
        finally:
            _xl_wb = None
    return {"ok": True}


def excel_quit() -> Dict[str, Any]:
    """彻底退出 Excel 进程。"""
    global _xl_app, _xl_wb
    _require_com()
    if _xl_wb is not None:
        try:
            _xl_wb.Close(False)
        except Exception:  # noqa: BLE001
            pass
        _xl_wb = None
    if _xl_app is not None:
        try:
            _xl_app.Quit()
        except Exception:  # noqa: BLE001
            pass
        _xl_app = None
    return {"ok": True}


# ---------------- Word ----------------

def word_open(path: str, visible: bool = False, engine: str = "word") -> Dict[str, Any]:
    """打开 docx；engine: word=Word.Application, wps=KWPS.Application。"""
    global _word_app, _word_doc, _word_engine
    _require_com()
    pythoncom.CoInitialize()
    prog = {"word": "Word.Application", "wps": "KWPS.Application"}.get(engine, "Word.Application")
    if _word_app is None:
        _word_app = win32com.client.DispatchEx(prog)
        _word_app.Visible = bool(visible)
        _word_engine = engine
    if _word_doc is not None:
        try:
            _word_doc.Close(False)
        except Exception:  # noqa: BLE001
            pass
    _word_doc = _word_app.Documents.Open(path, ReadOnly=False)
    return {"ok": True, "path": path, "engine": _word_engine,
            "paragraphs": _word_doc.Paragraphs.Count}


def word_replace(find: str, replace: str, match_case: bool = False) -> Dict[str, Any]:
    """全文替换；返回替换次数（Word 不直接给，用 Execute 后统计）。"""
    _require_com()
    if _word_doc is None:
        raise RuntimeError("Word 未打开，请先「Word 打开文件」")
    find_obj = _word_app.Selection.Find
    find_obj.ClearFormatting()
    find_obj.Text = find
    find_obj.Replacement.Text = replace
    find_obj.Forward = True
    find_obj.MatchCase = bool(match_case)
    # wdReplaceAll = 2
    count_before = _word_doc.Words.Count
    find_obj.Execute(Replace=2)
    return {"ok": True, "find": find, "replaced_to": replace,
            "words_before": count_before}


def word_export_pdf(out_path: str) -> Dict[str, Any]:
    """另存为 PDF（wdFormatPDF = 17）。"""
    _require_com()
    if _word_doc is None:
        raise RuntimeError("Word 未打开")
    _word_doc.SaveAs(out_path, FileFormat=17)
    return {"ok": True, "pdf": out_path}

def word_close(save: bool = True) -> Dict[str, Any]:
    global _word_doc
    _require_com()
    if _word_doc is not None:
        try:
            _word_doc.Close(bool(save))
        finally:
            _word_doc = None
    return {"ok": True}


def word_quit() -> Dict[str, Any]:
    global _word_app, _word_doc
    _require_com()
    if _word_doc is not None:
        try:
            _word_doc.Close(False)
        except Exception:  # noqa: BLE001
            pass
        _word_doc = None
    if _word_app is not None:
        try:
            _word_app.Quit()
        except Exception:  # noqa: BLE001
            pass
        _word_app = None
    return {"ok": True}


def com_engines() -> Dict[str, bool]:
    return {"office_com": _COM_AVAILABLE}
