import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import { registerImapCommands, type ImapLike } from './imap'
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
    interpolate: (t) => t.replace(/\$\{(\w+)\}/g, (_m, n) => String(vars.get(n) ?? ''))
  }
  return { ctx, vars, logs }
}
const step = undefined as any

function fakeImap(): ImapLike & { calls: string[]; mails: Array<Record<string, unknown>> } {
  const calls: string[] = []
  const mails = [
    { uid: 1, subject: 'hi', from: 'a@x.com', to: 'me@x.com', date: '2026-09-26T00:00:00Z', preview: 'hello' },
    { uid: 2, subject: 're', from: 'b@x.com', to: 'me@x.com', date: '2026-09-26T01:00:00Z', preview: 'world' }
  ]
  return {
    calls,
    mails,
    async connect(opts) { calls.push(`connect:${opts.user}@${opts.host}:${opts.port}`) },
    async fetchUnseen(limit) { return mails.slice(0, limit) },
    async disconnect() { calls.push('disconnect') }
  }
}

describe('imap 指令注册', () => {
  it('注册 3 条', () => {
    const reg = new CommandRegistry()
    registerImapCommands(reg, { imap: fakeImap() })
    expect(reg.list()).toHaveLength(3)
  })
})

describe('imap 行为', () => {
  it('connect → fetch → disconnect 链路', async () => {
    const reg = new CommandRegistry()
    const f = fakeImap()
    registerImapCommands(reg, { imap: f })
    const { ctx, vars } = makeCtx()
    await reg.get('imapConnect')!.runner(ctx, { host: 'imap.qq.com', port: 993, secure: true, user: 'me@qq.com', pass: 'xxx' }, step)
    expect(f.calls[0]).toContain('me@qq.com@imap.qq.com:993')
    await reg.get('imapFetchUnseen')!.runner(ctx, { limit: 1, bodyChars: 100, resultVar: 'mails' }, step)
    const got = vars.get('mails') as any[]
    expect(got).toHaveLength(1)
    expect(got[0].subject).toBe('hi')
    await reg.get('imapDisconnect')!.runner(ctx, {}, step)
    expect(f.calls).toContain('disconnect')
  })
})
