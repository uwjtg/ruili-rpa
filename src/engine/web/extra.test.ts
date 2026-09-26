import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import { registerWebExtraCommands } from './extra'
import type { WebSession } from './session'
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

function fakeSession(): WebSession & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    isRunning: () => true,
    start: async () => {},
    close: async () => {},
    goto: async () => {},
    click: async () => {},
    fill: async (sel, val) => { calls.push(`fill:${sel}=${val}`) },
    scroll: async () => {},
    pressKey: async () => {},
    getText: async () => '',
    getTitle: async () => '测试标题',
    waitFor: async () => {},
    eval: async (fn: string, arg?: unknown) => {
      calls.push(`eval:${fn} arg=${JSON.stringify(arg)}`)
      if (fn.includes('location.href')) return 'https://example.com/'
      if (fn.includes('querySelector')) return arg === '#exists'
      return 'ok'
    },
    startPagePick: async () => ({} as any),
    startWebRecord: async () => {},
    stopWebRecord: async () => [] as any
  }
}

describe('web extra 指令注册', () => {
  it('注册 9 条', () => {
    const reg = new CommandRegistry()
    registerWebExtraCommands(reg, { session: fakeSession() })
    expect(reg.list()).toHaveLength(9)
  })
})

describe('web extra 行为', () => {
  it('webGetTitle / webGetUrl', async () => {
    const reg = new CommandRegistry()
    const s = fakeSession()
    registerWebExtraCommands(reg, { session: s })
    const { ctx, vars } = makeCtx()
    await reg.get('webGetTitle')!.runner(ctx, { resultVar: 't' }, step)
    expect(vars.get('t')).toBe('测试标题')
    await reg.get('webGetUrl')!.runner(ctx, { resultVar: 'u' }, step)
    expect(vars.get('u')).toBe('https://example.com/')
  })

  it('webGoBack/Forward/Refresh 都调 eval', async () => {
    const reg = new CommandRegistry()
    const s = fakeSession()
    registerWebExtraCommands(reg, { session: s })
    const { ctx } = makeCtx()
    await reg.get('webGoBack')!.runner(ctx, {}, step)
    await reg.get('webGoForward')!.runner(ctx, {}, step)
    await reg.get('webRefresh')!.runner(ctx, {}, step)
    expect(s.calls.filter((c) => c.startsWith('eval:')).length).toBe(3)
  })

  it('webCheckElement', async () => {
    const reg = new CommandRegistry()
    registerWebExtraCommands(reg, { session: fakeSession() })
    const { ctx, vars } = makeCtx()
    await reg.get('webCheckElement')!.runner(ctx, { selector: '#exists', resultVar: 'b' }, step)
    expect(vars.get('b')).toBe(true)
  })

  it('webClearInput', async () => {
    const reg = new CommandRegistry()
    const s = fakeSession()
    registerWebExtraCommands(reg, { session: s })
    const { ctx } = makeCtx()
    await reg.get('webClearInput')!.runner(ctx, { selector: '#q' }, step)
    expect(s.calls).toContain('fill:#q=')
  })
})
