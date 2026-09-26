import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CommandRegistry } from '../commands/registry'
import { registerCsvCommands } from './csv'
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

describe('csv 指令注册', () => {
  it('注册 5 条', () => {
    const reg = new CommandRegistry()
    registerCsvCommands(reg)
    expect(reg.list().map((c) => c.id).sort()).toEqual([
      'csvObjectsToRows', 'csvParseText', 'csvReadFile', 'csvRowsToObjects', 'csvWriteFile'
    ].sort())
  })
})

describe('csvParseText', () => {
  it('简单 CSV', async () => {
    const reg = new CommandRegistry()
    registerCsvCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('csvParseText')!.runner(ctx, { text: 'a,b,c\n1,2,3', resultVar: 'rows' }, step)
    expect(vars.get('rows')).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('带引号和逗号', async () => {
    const reg = new CommandRegistry()
    registerCsvCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('csvParseText')!.runner(ctx, { text: 'name,note\n"张,三","say ""hi"""', resultVar: 'rows' }, step)
    expect(vars.get('rows')).toEqual([['name', 'note'], ['张,三', 'say "hi"']])
  })
})

describe('rows ↔ objects', () => {
  it('rowsToObjects', async () => {
    const reg = new CommandRegistry()
    registerCsvCommands(reg)
    const { ctx, vars } = makeCtx()
    vars.set('rows', [['a', 'b'], ['1', '2']])
    await reg.get('csvRowsToObjects')!.runner(ctx, { rowsVar: 'rows', resultVar: 'objs' }, step)
    expect(vars.get('objs')).toEqual([{ a: '1', b: '2' }])
  })

  it('objectsToRows', async () => {
    const reg = new CommandRegistry()
    registerCsvCommands(reg)
    const { ctx, vars } = makeCtx()
    vars.set('objs', [{ a: 1, b: 'x' }, { a: 2, b: 'y' }])
    await reg.get('csvObjectsToRows')!.runner(ctx, { objectsVar: 'objs', resultVar: 'rows' }, step)
    expect(vars.get('rows')).toEqual([['a', 'b'], [1, 'x'], [2, 'y']])
  })
})

describe('csvReadFile / csvWriteFile', () => {
  let dir: string
  const tmp = () => { dir = mkdtempSync(path.join(tmpdir(), 'rui-csv-')) }
  const cleanup = () => rmSync(dir, { recursive: true, force: true })

  it('写后读回', async () => {
    tmp()
    try {
      const reg = new CommandRegistry()
      registerCsvCommands(reg)
      const { ctx, vars } = makeCtx()
      vars.set('rows', [['name', 'age'], ['张三', '30'], ['李四', '25']])
      const file = path.join(dir, 'out.csv')
      await reg.get('csvWriteFile')!.runner(ctx, { path: file, rowsVar: 'rows', bom: true }, step)
      const raw = readFileSync(file, 'utf-8')
      expect(raw.charCodeAt(0)).toBe(0xFEFF)
      await reg.get('csvReadFile')!.runner(ctx, { path: file, resultVar: 'back' }, step)
      expect(vars.get('back')).toEqual([['name', 'age'], ['张三', '30'], ['李四', '25']])
    } finally { cleanup() }
  })

  it('字段含逗号自动加引号', async () => {
    tmp()
    try {
      const reg = new CommandRegistry()
      registerCsvCommands(reg)
      const { ctx, vars } = makeCtx()
      vars.set('rows', [['note'], ['含,逗号']])
      const file = path.join(dir, 'q.csv')
      await reg.get('csvWriteFile')!.runner(ctx, { path: file, rowsVar: 'rows', bom: false }, step)
      const raw = readFileSync(file, 'utf-8')
      expect(raw).toContain('"含,逗号"')
    } finally { cleanup() }
  })
})
