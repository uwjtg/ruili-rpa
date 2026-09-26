import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CommandRegistry } from '../commands/registry'
import { registerDocxCommands } from './docx'
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

describe('docx 指令注册', () => {
  it('注册 2 条', () => {
    const reg = new CommandRegistry()
    registerDocxCommands(reg)
    expect(reg.list().map((c) => c.id).sort()).toEqual(['docxCreateTable', 'docxCreateText'].sort())
  })
})

describe('docxCreateText', () => {
  it('生成有效 docx 文件（PK 魔数）', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rui-docx-'))
    try {
      const reg = new CommandRegistry()
      registerDocxCommands(reg)
      const { ctx } = makeCtx()
      const out = path.join(dir, 'a.docx')
      await reg.get('docxCreateText')!.runner(ctx, { path: out, title: '报告', lines: '第一段\n第二段' }, step)
      expect(existsSync(out)).toBe(true)
      const buf = readFileSync(out)
      // docx 是 zip，魔数 PK\x03\x04
      expect(buf[0]).toBe(0x50)
      expect(buf[1]).toBe(0x4b)
      expect(buf.length).toBeGreaterThan(500)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('docxCreateTable', () => {
  it('生成表格文档', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rui-docx2-'))
    try {
      const reg = new CommandRegistry()
      registerDocxCommands(reg)
      const { ctx, vars } = makeCtx()
      vars.set('rows', [['姓名', '年龄'], ['张三', '30'], ['李四', '25']])
      const out = path.join(dir, 'b.docx')
      await reg.get('docxCreateTable')!.runner(ctx, { path: out, rowsVar: 'rows', header: true }, step)
      expect(existsSync(out)).toBe(true)
      const buf = readFileSync(out)
      expect(buf[0]).toBe(0x50)
      expect(buf.length).toBeGreaterThan(500)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
