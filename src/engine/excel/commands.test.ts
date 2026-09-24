import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import { registerExcelCommands } from './commands'
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

function fakeSession() {
  return {
    create: vi.fn(),
    open: vi.fn(async () => {}),
    writeCell: vi.fn(),
    writeRow: vi.fn(),
    readCell: vi.fn(async () => '读取值'),
    saveAs: vi.fn(async () => {}),
    isOpen: () => true,
    close: vi.fn()
  }
}

describe('excel 指令（stub 会话）', () => {
  it('注册 6 条 Excel 指令', () => {
    const reg = new CommandRegistry()
    registerExcelCommands(reg, { session: fakeSession() })
    expect(
      reg.list().map((c) => c.id).sort()
    ).toEqual(
      [
        'excelCreate',
        'excelOpen',
        'excelReadCell',
        'excelSave',
        'excelWriteCell',
        'excelWriteRow'
      ].sort()
    )
  })

  it('excelWriteCell 把数字串转成 number 并写入', async () => {
    const session = fakeSession()
    const reg = new CommandRegistry()
    registerExcelCommands(reg, { session })
    const { ctx } = makeCtx()

    const cmd = reg.get('excelWriteCell')!
    await cmd.runner(
      ctx,
      { sheet: 'Sheet1', row: 2, col: 3, value: '299' },
      { id: 's1', cmdId: 'excelWriteCell', params: {} }
    )
    expect(session.writeCell).toHaveBeenCalledWith('Sheet1', 2, 3, 299)
  })

  it('excelReadCell 把结果写入变量', async () => {
    const session = fakeSession()
    const reg = new CommandRegistry()
    registerExcelCommands(reg, { session })
    const { ctx, vars } = makeCtx()

    const cmd = reg.get('excelReadCell')!
    await cmd.runner(
      ctx,
      { sheet: 'Sheet1', row: 1, col: 1, resultVar: 'a1' },
      { id: 's2', cmdId: 'excelReadCell', params: {} }
    )
    expect(session.readCell).toHaveBeenCalledWith('Sheet1', 1, 1)
    expect(vars.get('a1')).toBe('读取值')
  })

  it('excelWriteRow 解析 JSON 数组并把数字串转 number', async () => {
    const session = fakeSession()
    const reg = new CommandRegistry()
    registerExcelCommands(reg, { session })
    const { ctx } = makeCtx()

    const cmd = reg.get('excelWriteRow')!
    await cmd.runner(
      ctx,
      { sheet: 'Sheet1', row: 3, values: '["结果标题", 2]' },
      { id: 's3', cmdId: 'excelWriteRow', params: {} }
    )
    expect(session.writeRow).toHaveBeenCalledWith('Sheet1', 3, ['结果标题', 2])
  })

  it('excelWriteRow 对非法 JSON 数组抛错', async () => {
    const session = fakeSession()
    const reg = new CommandRegistry()
    registerExcelCommands(reg, { session })
    const { ctx } = makeCtx()

    const cmd = reg.get('excelWriteRow')!
    await expect(
      cmd.runner(
        ctx,
        { sheet: 'Sheet1', row: 1, values: 'not-json' },
        { id: 's4', cmdId: 'excelWriteRow', params: {} }
      )
    ).rejects.toThrow(/JSON 数组/)
  })
})
