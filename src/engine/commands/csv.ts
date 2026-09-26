/**
 * CSV 指令（M7 切片 12）：零依赖 CSV 解析/生成 + 文件读写。
 *
 * 自实现 RFC 4180 子集：支持引号包裹、字段内逗号、双引号转义("")、CRLF/LF。
 * 不引入 papaparse 等新依赖。
 *
 * 清单（5 条）：
 *  csvParseText   把 CSV 字符串解析成二维数组（string[][]）
 *  csvReadFile    读 CSV 文件 → 二维数组（变量）
 *  csvRowsToObjects  二维数组（首行表头）→ 对象数组
 *  csvObjectsToRows   对象数组 → 二维数组（含表头行）
 *  csvWriteFile   把二维数组写成 CSV 文件
 */

import * as fsp from 'node:fs/promises'
import path from 'node:path'
import type { RegisteredCommand } from './registry'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

/** 解析一行 CSV（可能跨行），返回 [fields, consumedChars] */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(field); field = ''; i++; continue }
    if (ch === '\r') { i++; continue }
    if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; continue }
    field += ch; i++
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  // 去掉末尾完全空行
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

/** 把一个字段按 RFC 4180 转义（含逗号/引号/换行则加引号） */
function esc(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export function registerCsvCommands(registry: RegistryLike): void {
  registry.register({
    id: 'csvParseText',
    name: '解析 CSV 文本',
    group: '数据处理',
    icon: 'file-text',
    params: [
      { key: 'text', label: 'CSV 文本', type: 'text' },
      { key: 'resultVar', label: '结果变量（二维数组）', type: 'text' }
    ],
    summary: (p) => `parseCsv(${str(p.text).slice(0, 20)})`,
    runner: async (ctx, p) => {
      const text = ctx.interpolate(str(p.text))
      const rows = parseCsv(text)
      ctx.setVar(str(p.resultVar), rows)
      return rows
    }
  })

  registry.register({
    id: 'csvReadFile',
    name: '读 CSV 文件',
    group: '文件',
    icon: 'file',
    params: [
      { key: 'path', label: 'CSV 文件路径', type: 'text' },
      { key: 'resultVar', label: '结果变量（二维数组）', type: 'text' }
    ],
    summary: (p) => `读 ${str(p.path)}`,
    runner: async (ctx, p) => {
      const filePath = ctx.interpolate(str(p.path))
      const text = (await fsp.readFile(filePath, 'utf-8')).replace(new RegExp('^' + String.fromCharCode(0xFEFF)), '')
      const rows = parseCsv(text)
      ctx.setVar(str(p.resultVar), rows)
      ctx.log('success', `${filePath} → ${rows.length} 行`)
      return rows
    }
  })

  registry.register({
    id: 'csvRowsToObjects',
    name: 'CSV 行转对象',
    group: '数据处理',
    icon: 'arrow-right',
    params: [
      { key: 'rowsVar', label: '二维数组变量', type: 'text' },
      { key: 'resultVar', label: '结果变量（对象数组）', type: 'text' }
    ],
    summary: (p) => `rows→objects(${str(p.rowsVar)})`,
    runner: async (ctx, p) => {
      const rowsVar = str(p.rowsVar)
      const rows = ctx.getVar<string[][]>(rowsVar)
      if (!Array.isArray(rows) || rows.length < 1) {
        ctx.setVar(str(p.resultVar), [])
        return []
      }
      const header = rows[0]
      const out = rows.slice(1).map((r) => {
        const o: Record<string, string> = {}
        header.forEach((h, i) => { o[h] = r[i] ?? '' })
        return o
      })
      ctx.setVar(str(p.resultVar), out)
      return out
    }
  })

  registry.register({
    id: 'csvObjectsToRows',
    name: '对象转 CSV 行',
    group: '数据处理',
    icon: 'arrow-left',
    params: [
      { key: 'objectsVar', label: '对象数组变量', type: 'text' },
      { key: 'resultVar', label: '结果变量（二维数组，含表头）', type: 'text' }
    ],
    summary: (p) => `objects→rows(${str(p.objectsVar)})`,
    runner: async (ctx, p) => {
      const objectsVar = str(p.objectsVar)
      const arr = ctx.getVar<Array<Record<string, unknown>>>(objectsVar)
      if (!Array.isArray(arr) || arr.length === 0) {
        ctx.setVar(str(p.resultVar), [])
        return []
      }
      const header = Object.keys(arr[0])
      const rows: unknown[][] = [header, ...arr.map((o) => header.map((h) => o[h]))]
      ctx.setVar(str(p.resultVar), rows)
      return rows
    }
  })

  registry.register({
    id: 'csvWriteFile',
    name: '写 CSV 文件',
    group: '文件',
    icon: 'file-edit',
    params: [
      { key: 'path', label: '输出路径', type: 'text' },
      { key: 'rowsVar', label: '二维数组变量', type: 'text' },
      { key: 'bom', label: '加 UTF-8 BOM（Excel 识别）', type: 'boolean', default: true }
    ],
    summary: (p) => `写 ${str(p.path)}`,
    runner: async (ctx, p) => {
      const filePath = ctx.interpolate(str(p.path))
      const rows = ctx.getVar<unknown[][]>(str(p.rowsVar)) ?? []
      const csv = toCsv(rows as unknown[][])
      const out = (p.bom === false ? '' : String.fromCharCode(0xFEFF)) + csv
      await fsp.mkdir(path.dirname(filePath), { recursive: true })
      await fsp.writeFile(filePath, out, 'utf-8')
      ctx.log('success', `已写 ${filePath}（${rows.length} 行）`)
      return filePath
    }
  })
}
