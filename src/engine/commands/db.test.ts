import { describe, expect, it, beforeEach } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import { registerDbCommands, setDbDriverProvider, type DbLike } from './db'
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
    interpolate: (t) => t
  }
  return { ctx, vars, logs }
}
const step = undefined as any

/** 假驱动：内存表 */
function fakeDb(): DbLike {
  const rows = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
  return {
    async query() {
      return rows
    },
    async execute() {
      return { changes: 3, lastInsertRowid: 42 }
    },
    async close() {}
  }
}

describe('db 指令注册', () => {
  beforeEach(() => setDbDriverProvider(null))

  it('注册 4 条', () => {
    const reg = new CommandRegistry()
    registerDbCommands(reg, { factory: async () => fakeDb() })
    expect(reg.list().map((c) => c.id).sort()).toEqual(
      ['dbConnect', 'dbClose', 'dbExecute', 'dbQuery'].sort()
    )
  })

  it('connect -> query -> 结果进变量', async () => {
    const reg = new CommandRegistry()
    registerDbCommands(reg, { factory: async () => fakeDb() })
    const { ctx, vars } = makeCtx()
    await reg.get('dbConnect')!.runner(ctx, { provider: 'sqlite' }, step)
    await reg.get('dbQuery')!.runner(ctx, { sql: 'SELECT * FROM t', resultVar: 'rows' }, step)
    expect(vars.get('rows')).toEqual([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }])
  })

  it('未连接就 query 抛错', async () => {
    setDbDriverProvider(null)
    const reg = new CommandRegistry()
    registerDbCommands(reg)
    const { ctx } = makeCtx()
    await expect(
      reg.get('dbQuery')!.runner(ctx, { sql: 'SELECT 1', resultVar: 'r' }, step)
    ).rejects.toThrow(/尚未连接/)
  })

  it('execute 返回影响行数', async () => {
    const reg = new CommandRegistry()
    registerDbCommands(reg, { factory: async () => fakeDb() })
    const { ctx } = makeCtx()
    await reg.get('dbConnect')!.runner(ctx, { provider: 'sqlite' }, step)
    const r = (await reg.get('dbExecute')!.runner(ctx, { sql: 'DELETE FROM t' }, step)) as { changes: number }
    expect(r.changes).toBe(3)
  })

  it('close 后再次 query 抛错', async () => {
    const reg = new CommandRegistry()
    registerDbCommands(reg, { factory: async () => fakeDb() })
    const { ctx } = makeCtx()
    await reg.get('dbConnect')!.runner(ctx, { provider: 'sqlite' }, step)
    await reg.get('dbClose')!.runner(ctx, {}, step)
    await expect(
      reg.get('dbQuery')!.runner(ctx, { sql: 'SELECT 1' }, step)
    ).rejects.toThrow(/尚未连接/)
  })
})
