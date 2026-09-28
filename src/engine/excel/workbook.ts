/**
 * Excel 会话抽象（阶段 3 · 真实链路 POC）。
 *
 * 主轨用 exceljs（MIT，纯 JS，不启动 Office 进程）做后台读写；
 * COM 高保真轨（驱动真实 Office/WPS）留待后续阶段。
 * 指令依赖 `ExcelSession` 接口，便于单测注入假实现。
 */

import ExcelJS from 'exceljs'

export interface ExcelSession {
  /** 新建空白工作簿 */
  create(): void
  /** 打开已有 .xlsx */
  open(path: string): Promise<void>
  /** 写单元格（row/col 从 1 开始） */
  writeCell(sheet: string, row: number, col: number, value: unknown): void
  /** 写一行（values 从 col=1 开始顺序写入） */
  writeRow(sheet: string, row: number, values: unknown[]): void
  /** 读单元格 */
  readCell(sheet: string, row: number, col: number): Promise<unknown>
  /** 另存为（不存在则新建） */
  saveAs(path: string): Promise<void>
  /** O1：对区域应用样式（A1:C3 风格的区域；bold/size/color/fill/align/border） */
  styleRange(sheet: string, range: string, style: Record<string, unknown>): void
  /** O1：设置列宽（col 从 1 开始） */
  setColumnWidth(sheet: string, col: number, width: number): void
  isOpen(): boolean
  close(): void
}

export class RealExcelSession implements ExcelSession {
  private wb: ExcelJS.Workbook | null = null

  isOpen(): boolean {
    return this.wb !== null
  }

  create(): void {
    this.wb = new ExcelJS.Workbook()
    // 预置一个 Sheet1，符合用户直觉
    this.wb.addWorksheet('Sheet1')
  }

  async open(path: string): Promise<void> {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(path)
    this.wb = wb
  }

  private ensureSheet(name: string): ExcelJS.Worksheet {
    if (!this.wb) throw new Error('工作簿未打开，请先「新建 Excel」或「打开 Excel」')
    let ws = this.wb.getWorksheet(name)
    if (!ws) ws = this.wb.addWorksheet(name)
    return ws
  }

  writeCell(sheet: string, row: number, col: number, value: unknown): void {
    const ws = this.ensureSheet(sheet)
    ws.getRow(row).getCell(col).value = value as ExcelJS.CellValue
  }

  writeRow(sheet: string, row: number, values: unknown[]): void {
    const ws = this.ensureSheet(sheet)
    const excelRow = ws.getRow(row)
    values.forEach((v, idx) => {
      excelRow.getCell(idx + 1).value = v as ExcelJS.CellValue
    })
    excelRow.commit()
  }

  async readCell(sheet: string, row: number, col: number): Promise<unknown> {
    const ws = this.ensureSheet(sheet)
    const v = ws.getRow(row).getCell(col).value
    if (v == null) return null
    // exceljs 富文本/超链接/公式对象：取最朴素的值
    if (typeof v === 'object') {
      const obj = v as unknown as Record<string, unknown>
      if ('text' in obj) return obj.text
      if ('result' in obj) return obj.result
      if ('richText' in obj) {
        const rich = obj.richText as Array<{ text: string }>
        return rich.map((r) => r.text).join('')
      }
    }
    return v
  }

  async saveAs(path: string): Promise<void> {
    if (!this.wb) throw new Error('工作簿未打开，无法保存')
    await this.wb.xlsx.writeFile(path)
  }

  /** 把 A1 / B3 这样的坐标拆成 {row,col}（col 为数字） */
  private static refToRowCol(ref: string): { row: number; col: number } {
    const m = ref.trim().match(/^([A-Z]+)(\d+)$/)
    if (!m) throw new Error(`无法解析单元格坐标：${ref}`)
    let col = 0
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
    return { row: Number(m[2]), col }
  }

  styleRange(sheet: string, range: string, style: Record<string, unknown>): void {
    const ws = this.ensureSheet(sheet)
    // 支持单格 A1 或区间 A1:C3
    const [a, b] = range.split(':')
    const start = RealExcelSession.refToRowCol(a)
    const end = b ? RealExcelSession.refToRowCol(b) : start
    const bold = Boolean(style.bold)
    const size = style.size ? Number(style.size) : undefined
    const color = typeof style.color === 'string' ? style.color : undefined
    const fill = typeof style.fill === 'string' ? style.fill : undefined
    const align = typeof style.align === 'string' ? style.align : undefined
    const border = Boolean(style.border)
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.col; c <= end.col; c++) {
        const cell = ws.getRow(r).getCell(c)
        const font: Record<string, unknown> = {}
        if (bold) font.bold = true
        if (size) font.size = size
        if (color) font.color = { argb: color }
        if (Object.keys(font).length) cell.font = { ...(cell.font ?? {}), ...font } as ExcelJS.PartialStyle['font']
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } } as ExcelJS.PartialStyle['fill']
        if (align) cell.alignment = { ...(cell.alignment ?? {}), horizontal: align } as ExcelJS.PartialStyle['alignment']
        if (border) {
          const side = { style: 'thin', color: { argb: 'FFBFBFBF' } }
          cell.border = {
            top: side, left: side, bottom: side, right: side
          } as ExcelJS.PartialStyle['border']
        }
      }
    }
  }

  setColumnWidth(sheet: string, col: number, width: number): void {
    const ws = this.ensureSheet(sheet)
    ws.getColumn(col).width = width
  }

  close(): void {
    this.wb = null
  }
}

let defaultExcel: ExcelSession = new RealExcelSession()

export function getExcelSession(): ExcelSession {
  return defaultExcel
}

export function setExcelSessionForTesting(session: ExcelSession): void {
  defaultExcel = session
}
