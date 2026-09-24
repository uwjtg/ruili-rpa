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
