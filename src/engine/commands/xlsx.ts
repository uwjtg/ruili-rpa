/**
 * Excel (.xlsx) 指令（M7 切片 19）：基于 exceljs（纯 Node，不需要装 Office）。
 *
 * 与现有 src/engine/excel/commands.ts（走 Python sidecar COM 自动化真 Excel）互补：
 * 那套要求机器装 Office；这套纯读写文件，跨平台。
 *
 * 清单（3 条）：
 *  xlsxReadSheet     读工作表 → 二维数组
 *  xlsxWriteSheet    把二维数组写入工作表（新建或覆盖）
 *  xlsxListSheets    列出所有 sheet 名
 */

import ExcelJS from 'exceljs'
import * as fsp from 'node:fs/promises'
import path from 'node:path'
import type { RegisteredCommand } from './registry'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

export function registerXlsxCommands(registry: RegistryLike): void {
  registry.register({
    id: 'xlsxListSheets',
    name: '列出工作表',
    group: 'Excel',
    icon: 'table',
    params: [
      { key: 'path', label: 'xlsx 路径', type: 'text' },
      { key: 'resultVar', label: '结果变量（列表）', type: 'text' }
    ],
    summary: (p) => `sheets(${str(p.path)})`,
    runner: async (ctx, p) => {
      const file = ctx.interpolate(str(p.path))
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.readFile(file)
      const names = wb.worksheets.map((ws) => ws.name)
      ctx.setVar(str(p.resultVar), names)
      return names
    }
  })

  registry.register({
    id: 'xlsxReadSheet',
    name: '读取工作表为二维数组',
    group: 'Excel',
    icon: 'file',
    params: [
      { key: 'path', label: 'xlsx 路径', type: 'text' },
      { key: 'sheet', label: '工作表名（空=第一个）', type: 'text' },
      { key: 'resultVar', label: '结果变量（二维数组）', type: 'text' }
    ],
    summary: (p) => `读 ${str(p.sheet) || '第一个'}`,
    runner: async (ctx, p) => {
      const file = ctx.interpolate(str(p.path))
      const sheetName = ctx.interpolate(str(p.sheet))
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.readFile(file)
      const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0]
      if (!ws) throw new Error(`工作表不存在: ${sheetName}`)
      const rows: unknown[][] = []
      ws.eachRow((row) => {
                const arr: unknown[] = []
        row.eachCell({ includeEmpty: true }, (cell) => { arr.push(cell.value as any) })
        rows.push(arr)
      })
      ctx.setVar(str(p.resultVar), rows)
      ctx.log('success', `${file} → ${rows.length} 行`)
      return rows
    }
  })

  registry.register({
    id: 'xlsxWriteSheet',
    name: '写入工作表',
    group: 'Excel',
    icon: 'file-edit',
    params: [
      { key: 'path', label: 'xlsx 路径（不存在则新建）', type: 'text' },
      { key: 'sheet', label: '工作表名', type: 'text', default: 'Sheet1' },
      { key: 'rowsVar', label: '二维数组变量', type: 'text' },
      { key: 'overwrite', label: '覆盖现有工作表', type: 'boolean', default: true }
    ],
    summary: (p) => `写 ${str(p.sheet)}`,
    runner: async (ctx, p) => {
      const file = ctx.interpolate(str(p.path))
      const sheetName = ctx.interpolate(str(p.sheet, 'Sheet1'))
      const rows = ctx.getVar<unknown[][]>(str(p.rowsVar)) ?? []
      await fsp.mkdir(path.dirname(file), { recursive: true })
      const wb = new ExcelJS.Workbook()
      try {
        await wb.xlsx.readFile(file)
      } catch {
        /* 文件不存在，新建 */
      }
      let ws = wb.getWorksheet(sheetName)
      if (ws && p.overwrite !== false) {
        wb.removeWorksheet(ws.id)
        ws = wb.addWorksheet(sheetName)
      } else if (!ws) {
        ws = wb.addWorksheet(sheetName)
      }
      for (const row of rows) {
        ws.addRow(row)
      }
      await wb.xlsx.writeFile(file)
      ctx.log('success', `已写 ${file} / ${sheetName}（${rows.length} 行）`)
      return file
    }
  })
}
