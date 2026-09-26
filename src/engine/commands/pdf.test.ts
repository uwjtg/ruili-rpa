import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { CommandRegistry } from '../commands/registry'
import { registerPdfCommands } from './pdf'
import type { RunContext } from '../core/context'

function makeCtx(): { ctx: RunContext; vars: Map<string, unknown>; logs: string[] } {
  const vars = new Map<string, unknown>()
  const logs: string[] = []
  const ctx: RunContext = {
    getVar: <T,>(n: string) => vars.get(n) as T | undefined,
    setVar: (n, v) => vars.set(n, v),
    log: (level, msg) => logs.push(`[${level}] ${msg}`),
    execChildren: async () => {},
    isCancelled: () => false,
    interpolate: (t) =>
      t.replace(/\$\{(\w+)\}/g, (_m, n) => String(vars.get(n) ?? ''))
  }
  return { ctx, vars, logs }
}
const step = undefined as any

async function makePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([300, 300])
    p.drawText(`Page ${i + 1}`, { x: 50, y: 150, size: 24, font, color: rgb(0, 0, 0) })
  }
  return Buffer.from(await doc.save())
}

describe('pdf 指令注册', () => {
  it('注册 2 条', () => {
    const reg = new CommandRegistry()
    registerPdfCommands(reg)
    expect(reg.list().map((c) => c.id).sort()).toEqual(['pdfExtractPages', 'pdfMerge'].sort())
  })
})

describe('pdfMerge', () => {
  it('合并两个 PDF 页数相加', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rui-pdf-'))
    try {
      const a = path.join(dir, 'a.pdf')
      const b = path.join(dir, 'b.pdf')
      writeFileSync(a, await makePdf(2))
      writeFileSync(b, await makePdf(3))
      const out = path.join(dir, 'merged.pdf')
      const reg = new CommandRegistry()
      registerPdfCommands(reg)
      const { ctx } = makeCtx()
      await reg.get('pdfMerge')!.runner(ctx, { inputs: `${a},${b}`, output: out }, step)
      expect(existsSync(out)).toBe(true)
      const doc = await PDFDocument.load(readFileSync(out))
      expect(doc.getPageCount()).toBe(5)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('pdfExtractPages', () => {
  it('按页码和范围提取', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rui-pdf2-'))
    try {
      const src = path.join(dir, 'src.pdf')
      writeFileSync(src, await makePdf(5))
      const out = path.join(dir, 'extracted.pdf')
      const reg = new CommandRegistry()
      registerPdfCommands(reg)
      const { ctx } = makeCtx()
      await reg.get('pdfExtractPages')!.runner(ctx, { input: src, pages: '1,3,5-5', output: out }, step)
      const doc = await PDFDocument.load(readFileSync(out))
      expect(doc.getPageCount()).toBe(3)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
