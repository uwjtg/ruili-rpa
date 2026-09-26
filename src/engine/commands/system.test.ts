import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import { registerSystemCommands, type SystemLike } from './system'
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

function fakeSystem(): SystemLike & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    clipboardReadText: () => { calls.push('readClip'); return 'clip-content' },
    clipboardWriteText: (t) => calls.push(`writeClip:${t}`),
    showMessageBox: async () => { calls.push('msgbox'); return 0 },
    showConfirm: async () => { calls.push('confirm'); return true },
    showOpenFile: async () => { calls.push('open'); return 'C:/pick/file.txt' },
    showSaveFile: async () => { calls.push('save'); return 'C:/out/out.txt' },
    beep: () => calls.push('beep')
  }
}

const step = undefined as any

describe('system 指令注册', () => {
  it('注册 9 条', () => {
    const reg = new CommandRegistry()
    registerSystemCommands(reg, { system: fakeSystem() })
    expect(reg.list().map((c) => c.id).sort()).toEqual([
      'beep', 'clipboardCopy', 'clipboardPaste',
      'showConfirm', 'showError', 'showInfo', 'showOpenFile', 'showSaveFile',
      'sleep'
    ].sort())
  })
})

describe('剪贴板', () => {
  it('clipboardCopy / clipboardPaste', async () => {
    const reg = new CommandRegistry()
    const sys = fakeSystem()
    registerSystemCommands(reg, { system: sys })
    const { ctx, vars } = makeCtx()
    vars.set('name', 'World')
    await reg.get('clipboardCopy')!.runner(ctx, { text: 'hi ${name}' }, step)
    expect(sys.calls).toContain('writeClip:hi World')
    await reg.get('clipboardPaste')!.runner(ctx, { resultVar: 'out' }, step)
    expect(vars.get('out')).toBe('clip-content')
  })
})

describe('对话框', () => {
  it('showInfo / showError 调用 system', async () => {
    const reg = new CommandRegistry()
    const sys = fakeSystem()
    registerSystemCommands(reg, { system: sys })
    const { ctx } = makeCtx()
    await reg.get('showInfo')!.runner(ctx, { title: 'T', message: 'M' }, step)
    await reg.get('showError')!.runner(ctx, { title: 'E', message: 'bad' }, step)
    expect(sys.calls.filter((c) => c === 'msgbox')).toHaveLength(2)
  })

  it('showConfirm 把 bool 写变量', async () => {
    const reg = new CommandRegistry()
    registerSystemCommands(reg, { system: fakeSystem() })
    const { ctx, vars } = makeCtx()
    await reg.get('showConfirm')!.runner(ctx, { title: 'T', message: 'M', resultVar: 'ok' }, step)
    expect(vars.get('ok')).toBe(true)
  })

  it('showOpenFile / showSaveFile', async () => {
    const reg = new CommandRegistry()
    registerSystemCommands(reg, { system: fakeSystem() })
    const { ctx, vars } = makeCtx()
    await reg.get('showOpenFile')!.runner(ctx, { title: '选', resultVar: 'p1' }, step)
    expect(vars.get('p1')).toBe('C:/pick/file.txt')
    await reg.get('showSaveFile')!.runner(ctx, { title: '存', defaultName: 'a.txt', resultVar: 'p2' }, step)
    expect(vars.get('p2')).toBe('C:/out/out.txt')
  })
})

describe('sleep / beep', () => {
  it('sleep 真等', async () => {
    const reg = new CommandRegistry()
    registerSystemCommands(reg, { system: fakeSystem() })
    const { ctx } = makeCtx()
    const t0 = Date.now()
    await reg.get('sleep')!.runner(ctx, { ms: 50 }, step)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(45)
  })

  it('beep 调用 system', async () => {
    const reg = new CommandRegistry()
    const sys = fakeSystem()
    registerSystemCommands(reg, { system: sys })
    const { ctx } = makeCtx()
    await reg.get('beep')!.runner(ctx, {}, step)
    expect(sys.calls).toContain('beep')
  })
})
