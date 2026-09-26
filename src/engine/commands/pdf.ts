/**
 * PDF 指令（M7 切片 18）：基于 pdf-lib。
 *
 * 清单（2 条）：
 *  pdfMerge          合并多个 PDF 为一个
 *  pdfExtractPages   从 PDF 提取指定页（1 起，逗号分隔或范围 1-3）
 */

import { PDFDocument } from 'pdf-lib'
import * as fsp from 'node:fs/promises'
import path from 'node:path'
import type { RegisteredCommand } from './registry'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

/** 解析 "1,3,5-7" → [0,2,4,5,6]（0 起索引） */
function parsePages(spec: string, total: number): number[] {
  const out = new Set<number>()
  for (const part of spec.split(',')) {
    const p = part.trim()
    if (!p) continue
    const range = p.match(/^(\d+)\s*-\s*(\d+)$/)
    if (range) {
      const a = Math.max(1, Number(range[1]))
      const b = Math.min(total, Number(range[2]))
      for (let i = a; i <= b; i++) out.add(i - 1)
    } else if (/^\d+$/.test(p)) {
      const n = Number(p)
      if (n >= 1 && n <= total) out.add(n - 1)
    }
  }
  return [...out].sort((a, b) => a - b)
}

export function registerPdfCommands(registry: RegistryLike): void {
  registry.register({
    id: 'pdfMerge',
    name: '合并 PDF',
    group: 'PDF',
    icon: 'file',
    params: [
      { key: 'inputs', label: '输入 PDF 路径（逗号分隔）', type: 'text' },
      { key: 'output', label: '输出路径', type: 'text' }
    ],
    summary: (p) => `合并 → ${str(p.output)}`,
    runner: async (ctx, p) => {
      const inputs = ctx.interpolate(str(p.inputs)).split(',').map((s) => s.trim()).filter(Boolean)
      const output = ctx.interpolate(str(p.output))
      const merged = await PDFDocument.create()
      for (const file of inputs) {
        const bytes = await fsp.readFile(file)
        const src = await PDFDocument.load(bytes)
        const pages = await merged.copyPages(src, src.getPageIndices())
        pages.forEach((pg) => merged.addPage(pg))
      }
      const out = await merged.save()
      await fsp.mkdir(path.dirname(output), { recursive: true })
      await fsp.writeFile(output, out)
      ctx.log('success', `已合并 ${inputs.length} 个 PDF → ${output}（${merged.getPageCount()} 页）`)
      return output
    }
  })

  registry.register({
    id: 'pdfExtractPages',
    name: '提取 PDF 页面',
    group: 'PDF',
    icon: 'scissors',
    params: [
      { key: 'input', label: '输入 PDF', type: 'text' },
      { key: 'pages', label: '页码（1 起，如 1,3,5-7）', type: 'text' },
      { key: 'output', label: '输出路径', type: 'text' }
    ],
    summary: (p) => `${str(p.input)} 页 ${str(p.pages)}`,
    runner: async (ctx, p) => {
      const input = ctx.interpolate(str(p.input))
      const output = ctx.interpolate(str(p.output))
      const spec = ctx.interpolate(str(p.pages))
      const bytes = await fsp.readFile(input)
      const src = await PDFDocument.load(bytes)
      const indices = parsePages(spec, src.getPageCount())
      const out = await PDFDocument.create()
      const copied = await out.copyPages(src, indices)
      copied.forEach((pg) => out.addPage(pg))
      const saved = await out.save()
      await fsp.mkdir(path.dirname(output), { recursive: true })
      await fsp.writeFile(output, saved)
      ctx.log('success', `已提取 ${indices.length} 页 → ${output}`)
      return output
    }
  })
}
