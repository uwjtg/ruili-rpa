/**
 * Excel 读写指令（阶段 3 · 真实链路）。
 *
 * 主轨 exceljs（纯 JS，不启动 Office）；COM 轨留待后续。
 * 单测注入假会话。
 *
 * 指令清单：
 *  1. excelCreate      新建工作簿
 *  2. excelOpen        打开 .xlsx
 *  3. excelWriteCell   写单元格
 *  4. excelReadCell    读单元格 → 变量
 *  5. excelSave         保存到路径
 */

import type { RegisteredCommand } from '../commands/registry'
import { getExcelSession, type ExcelSession } from './workbook'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

export interface ExcelCommandsDeps {
  session?: ExcelSession
}

export function registerExcelCommands(
  registry: RegistryLike,
  deps: ExcelCommandsDeps = {}
): void {
  const session = deps.session ?? getExcelSession()

  registry.register({
    id: 'excelCreate',
    name: '新建 Excel',
    group: 'Excel',
    icon: 'sheet',
    params: [],
    summary: () => '新建空白工作簿（Sheet1）',
    runner: async (ctx) => {
      session.create()
      ctx.log('success', '已新建空白工作簿')
      return true
    }
  })

  registry.register({
    id: 'excelOpen',
    name: '打开 Excel',
    group: 'Excel',
    icon: 'folder',
    params: [{ key: 'path', label: '文件路径', type: 'text' }],
    summary: (p) => `打开 ${str(p.path)}`,
    runner: async (ctx, p) => {
      const path = ctx.interpolate(str(p.path))
      await session.open(path)
      ctx.log('success', `已打开 ${path}`)
      return true
    }
  })

  registry.register({
    id: 'excelWriteCell',
    name: '写单元格',
    group: 'Excel',
    icon: 'pencil',
    params: [
      { key: 'sheet', label: '工作表', type: 'text', default: 'Sheet1' },
      { key: 'row', label: '行号（从1）', type: 'number' },
      { key: 'col', label: '列号（从1）', type: 'number' },
      { key: 'value', label: '值', type: 'text', placeholder: '支持 ${变量}' }
    ],
    summary: (p) =>
      `${str(p.sheet)}!R${str(p.row)}C${str(p.col)} = ${str(p.value)}`,
    runner: async (ctx, p) => {
      const sheet = ctx.interpolate(str(p.sheet, 'Sheet1'))
      const row = Number(p.row)
      const col = Number(p.col)
      const raw = ctx.interpolate(str(p.value))
      const value = raw === '' ? '' : Number.isNaN(Number(raw)) ? raw : Number(raw)
      session.writeCell(sheet, row, col, value)
      ctx.log('success', `已写入 ${sheet}!R${row}C${col}`)
      return true
    }
  })

  registry.register({
    id: 'excelReadCell',
    name: '读单元格',
    group: 'Excel',
    icon: 'search',
    params: [
      { key: 'sheet', label: '工作表', type: 'text', default: 'Sheet1' },
      { key: 'row', label: '行号（从1）', type: 'number' },
      { key: 'col', label: '列号（从1）', type: 'number' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    summary: (p) =>
      `读 ${str(p.sheet)}!R${str(p.row)}C${str(p.col)} → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const sheet = ctx.interpolate(str(p.sheet, 'Sheet1'))
      const row = Number(p.row)
      const col = Number(p.col)
      const resultVar = str(p.resultVar)
      const value = await session.readCell(sheet, row, col)
      ctx.setVar(resultVar, value)
      ctx.log('success', `读取 ${sheet}!R${row}C${col} = ${String(value)} → ${resultVar}`)
      return value
    }
  })

  registry.register({
    id: 'excelWriteRow',
    name: '写一行',
    group: 'Excel',
    icon: 'list',
    params: [
      { key: 'sheet', label: '工作表', type: 'text', default: 'Sheet1' },
      { key: 'row', label: '行号（从1）', type: 'number' },
      {
        key: 'values',
        label: '一行值（JSON 数组）',
        type: 'text',
        placeholder: '例如 ["标题", 123] 支持 ${变量}'
      }
    ],
    summary: (p) => `${str(p.sheet)}!第${str(p.row)}行 = ${str(p.values)}`,
    runner: async (ctx, p) => {
      const sheet = ctx.interpolate(str(p.sheet, 'Sheet1'))
      const row = Number(p.row)
      const raw = ctx.interpolate(str(p.values))
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        throw new Error(`values 不是合法 JSON 数组：${raw}`)
      }
      if (!Array.isArray(parsed)) {
        throw new Error(`values 必须是 JSON 数组，得到：${raw}`)
      }
      // 尽力把数字串转成 number
      const values = parsed.map((v) =>
        typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v
      )
      session.writeRow(sheet, row, values)
      ctx.log('success', `已写入 ${sheet}!第${row}行（${values.length} 列）`)
      return values
    }
  })

  registry.register({
    id: 'excelSave',
    name: '保存 Excel',
    group: 'Excel',
    icon: 'save',
    params: [{ key: 'path', label: '保存路径', type: 'text' }],
    summary: (p) => `保存到 ${str(p.path)}`,
    runner: async (ctx, p) => {
      const path = ctx.interpolate(str(p.path))
      await session.saveAs(path)
      ctx.log('success', `已保存 ${path}`)
      return path
    }
  })
}
