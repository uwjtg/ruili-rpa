import { describe, expect, it, vi } from 'vitest'
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
    stopWebRecord: async () => [] as any,
    locateFirst: vi.fn(async (cands: string[]) => cands[0] ?? null)
  }
}

describe('web extra 指令注册', () => {
  it('注册 9 条', () => {
    const reg = new CommandRegistry()
    registerWebExtraCommands(reg, { session: fakeSession() })
    expect(reg.list()).toHaveLength(10)
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

describe('webClickSmart 回退链', () => {
  it('按特征构造候选并点击第一个命中项', async () => {
    const reg = new CommandRegistry()
    const session = fakeSession()
    registerWebExtraCommands(reg, { session })
    const { ctx } = makeCtx()
    await reg.get('webClickSmart')!.runner(ctx, {
      featuresJson: '{"id":"loginBtn","ariaLabel":"登录"}',
      cssPath: 'div.box > button'
    }, step)
    const lf = session.locateFirst as unknown as ReturnType<typeof vi.fn>
    expect(lf).toHaveBeenCalled()
    const cands = lf.mock.calls[0][0] as string[]
    expect(cands[0]).toBe('#loginBtn')
  })

  it('全部未命中抛错', async () => {
    const reg = new CommandRegistry()
    const session = fakeSession()
    ;(session.locateFirst as any).mockResolvedValue(null)
    registerWebExtraCommands(reg, { session })
    const { ctx } = makeCtx()
    await expect(
      reg.get('webClickSmart')!.runner(ctx, { featuresJson: '', cssPath: 'x' }, step)
    ).rejects.toThrow(/回退链全部未命中/)
  })
})