import { describe, expect, it, afterEach } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import { registerMailCommands, setMailAccountProvider, type MailerLike, type MailAccount } from './mail'
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

function fakeMailer(): MailerLike & { sent: unknown[] } {
  const sent: unknown[] = []
  return {
    sent,
    async send(opts) { sent.push(opts); return { messageId: '<test-123@x>' } }
  }
}

describe('mail 指令注册', () => {
  it('注册 2 条', () => {
    const reg = new CommandRegistry()
    registerMailCommands(reg, { mailer: fakeMailer() })
    expect(reg.list().map((c) => c.id).sort()).toEqual(['sendMail', 'sendMailViaEnv', 'sendMailSaved'].sort())
  })
})

describe('sendMail', () => {
  it('把参数组装成邮件并调 mailer.send', async () => {
    const reg = new CommandRegistry()
    const mailer = fakeMailer()
    registerMailCommands(reg, { mailer })
    const { ctx, vars } = makeCtx()
    vars.set('name', 'Alice')
    await reg.get('sendMail')!.runner(ctx, {
      host: 'smtp.example.com', port: 465, secure: true,
      user: 'u', pass: 'p', from: 'me@x.com',
      to: 'a@x.com,b@x.com', subject: '你好',
      text: '你好 ${name}', attachments: '/tmp/a.pdf, /tmp/b.csv'
    }, step)
    expect(mailer.sent).toHaveLength(1)
    const opts = mailer.sent[0] as any
    expect(opts.host).toBe('smtp.example.com')
    expect(opts.to).toBe('a@x.com,b@x.com')
    expect(opts.text).toBe('你好 Alice')
    expect(opts.attachments).toEqual(['/tmp/a.pdf', '/tmp/b.csv'])
  })
})

describe('sendMailViaEnv', () => {
  const OLD = { ...process.env }
  it('读环境变量发邮件', async () => {
    process.env.RUI_MAIL_HOST = 'smtp.env.com'
    process.env.RUI_MAIL_USER = 'envuser'
    process.env.RUI_MAIL_PASS = 'envpass'
    process.env.RUI_MAIL_FROM = 'env@x.com'
    const reg = new CommandRegistry()
    const mailer = fakeMailer()
    registerMailCommands(reg, { mailer })
    const { ctx } = makeCtx()
    await reg.get('sendMailViaEnv')!.runner(ctx, { to: 'to@x.com', subject: 's', text: 'b' }, step)
    expect(mailer.sent).toHaveLength(1)
    const opts = mailer.sent[0] as any
    expect(opts.host).toBe('smtp.env.com')
    expect(opts.user).toBe('envuser')
    expect(opts.from).toBe('env@x.com')
  })
  it('缺环境变量抛错', async () => {
    delete process.env.RUI_MAIL_HOST
    const reg = new CommandRegistry()
    registerMailCommands(reg, { mailer: fakeMailer() })
    const { ctx } = makeCtx()
    await expect(
      reg.get('sendMailViaEnv')!.runner(ctx, { to: 'a@x.com', subject: 's', text: 'b' }, step)
    ).rejects.toThrow(/RUI_MAIL_HOST/)
  })
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('RUI_MAIL_')) delete (process.env as any)[k]
    }
    Object.assign(process.env, OLD)
  })
})

describe('sendMailSaved', () => {
  it('用 provider 注入的已存账号发信（密码不进参数）', async () => {
    const acc: MailAccount = {
      host: 'smtp.saved.com', port: 465, secure: true,
      user: 'saved@x.com', pass: 'SECRET', from: 'Saved <saved@x.com>'
    }
    setMailAccountProvider(() => acc)
    const reg = new CommandRegistry()
    const mailer = fakeMailer()
    registerMailCommands(reg, { mailer })
    const { ctx } = makeCtx()
    await reg.get('sendMailSaved')!.runner(ctx, { to: 'to@x.com', subject: 'hi', text: 'body' }, step)
    expect(mailer.sent).toHaveLength(1)
    const opts = mailer.sent[0] as any
    expect(opts.host).toBe('smtp.saved.com')
    expect(opts.user).toBe('saved@x.com')
    expect(opts.pass).toBe('SECRET')
    expect(opts.from).toBe('Saved <saved@x.com>')
    expect(opts.to).toBe('to@x.com')
  })
  it('未配置账号时抛错', async () => {
    setMailAccountProvider(() => null)
    const reg = new CommandRegistry()
    registerMailCommands(reg, { mailer: fakeMailer() })
    const { ctx } = makeCtx()
    await expect(
      reg.get('sendMailSaved')!.runner(ctx, { to: 'a@x.com', subject: 's', text: 'b' }, step)
    ).rejects.toThrow(/未配置邮件账号/)
  })
})