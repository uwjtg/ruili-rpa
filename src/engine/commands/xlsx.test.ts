import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CommandRegistry } from '../commands/registry'
import { registerXlsxCommands } from './xlsx'
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

describe('xlsx 指令注册', () => {
  it('注册 3 条', () => {
    const reg = new CommandRegistry()
    registerXlsxCommands(reg)
    expect(reg.list().map((c) => c.id).sort()).toEqual(['xlsxListSheets', 'xlsxReadSheet', 'xlsxWriteSheet'].sort())
  })
})

describe('xlsx 读写回环', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'rui-xlsx-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('写后读回，sheet 列表正确', async () => {
    const reg = new CommandRegistry()
    registerXlsxCommands(reg)
    const { ctx, vars } = makeCtx()
    vars.set('rows', [['姓名', '年龄'], ['张三', 30], ['李四', 25]])
    const file = path.join(dir, 'a.xlsx')
    await reg.get('xlsxWriteSheet')!.runner(ctx, { path: file, sheet: '人员', rowsVar: 'rows', overwrite: true }, step)
    expect(existsSync(file)).toBe(true)
    await reg.get('xlsxListSheets')!.runner(ctx, { path: file, resultVar: 'sheets' }, step)
    expect(vars.get('sheets')).toEqual(['人员'])
    await reg.get('xlsxReadSheet')!.runner(ctx, { path: file, sheet: '人员', resultVar: 'back' }, step)
    const back = vars.get('back') as unknown[][]
    expect(back[0]).toEqual(['姓名', '年龄'])
    expect(back[1][0]).toBe('张三')
    expect(Number(back[1][1])).toBe(30)
  })
})
