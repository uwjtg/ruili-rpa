import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import { registerWebCommands } from './commands'
import type { RunContext } from '../core/context'

/** 构造一个最小可运行的 RunContext */
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
    start: vi.fn(async () => {}),
    goto: vi.fn(async () => {}),
    click: vi.fn(async () => {}),
    fill: vi.fn(async () => {}),
    getText: vi.fn(async () => '提取到的文本'),
    getTitle: vi.fn(async () => '页面标题'),
    waitFor: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    isRunning: () => true
  }
}

describe('web 指令（stub 会话）', () => {
  it('注册 7 条网页指令', () => {
    const reg = new CommandRegistry()
    registerWebCommands(reg, { session: fakeSession() })
    expect(reg.list().map((c) => c.id).sort()).toEqual(
      [
        'webCloseBrowser',
        'webClick',
        'webExtractText',
        'webInput',
        'webOpenBrowser',
        'webOpenUrl',
        'webWaitFor'
      ].sort()
    )
  })

  it('webOpenUrl 调用 goto 并把标题写入变量', async () => {
    const session = fakeSession()
    const reg = new CommandRegistry()
    registerWebCommands(reg, { session })
    const { ctx, vars } = makeCtx()

    const cmd = reg.get('webOpenUrl')!
    await cmd.runner(ctx, { url: 'https://example.com', titleVar: 'pageTitle' }, {
      id: 's1',
      cmdId: 'webOpenUrl',
      params: {}
    })
    expect(session.goto).toHaveBeenCalledWith('https://example.com')
    expect(vars.get('pageTitle')).toBe('页面标题')
  })

  it('webInput 支持变量插值', async () => {
    const session = fakeSession()
    const reg = new CommandRegistry()
    registerWebCommands(reg, { session })
    const { ctx, vars } = makeCtx()
    vars.set('kw', '锐流')

    const cmd = reg.get('webInput')!
    await cmd.runner(
      ctx,
      { selector: '#q', value: '搜索 ${kw}' },
      { id: 's2', cmdId: 'webInput', params: {} }
    )
    expect(session.fill).toHaveBeenCalledWith('#q', '搜索 锐流')
  })

  it('webExtractText 把文本写入结果变量', async () => {
    const session = fakeSession()
    const reg = new CommandRegistry()
    registerWebCommands(reg, { session })
    const { ctx, vars } = makeCtx()

    const cmd = reg.get('webExtractText')!
    await cmd.runner(
      ctx,
      { selector: 'h1', resultVar: 'title' },
      { id: 's3', cmdId: 'webExtractText', params: {} }
    )
    expect(session.getText).toHaveBeenCalledWith('h1')
    expect(vars.get('title')).toBe('提取到的文本')
  })

  it('webWaitFor 调用 session.waitFor 并传超时', async () => {
    const session = fakeSession()
    const reg = new CommandRegistry()
    registerWebCommands(reg, { session })
    const { ctx } = makeCtx()

    const cmd = reg.get('webWaitFor')!
    await cmd.runner(
      ctx,
      { selector: '#result', timeoutMs: 3000 },
      { id: 's4', cmdId: 'webWaitFor', params: {} }
    )
    expect(session.waitFor).toHaveBeenCalledWith('#result', 3000)
  })
})
