/**
 * 邮件发送指令（M7 切片 16）：基于 nodemailer SMTP。
 *
 * 清单（2 条）：
 *  sendMail          发送邮件（支持文本/HTML/附件）
 *  sendMailViaEnv    从环境变量读 SMTP 配置再发（RUI_MAIL_HOST/PORT/USER/PASS/FROM）
 *
 * 账号密码走参数或环境变量，不入库；用户可在参数面板填，或设环境变量。
 */

import nodemailer, { type Transporter } from 'nodemailer'
import type { RegisteredCommand } from './registry'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}
function bool(v: unknown, fallback = false): boolean {
  if (v == null || v === '') return fallback
  return Boolean(v)
}

/** 可注入的邮件发送接口（测试 mock 用） */
export interface MailerLike {
  send(opts: {
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
    from: string
    to: string
    subject: string
    text?: string
    html?: string
    attachments?: string[]
  }): Promise<{ messageId?: string }>
}

/** 默认实现：真调 nodemailer */
const defaultMailer: MailerLike = {
  async send(opts) {
    const transporter: Transporter = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.secure,
      auth: opts.user ? { user: opts.user, pass: opts.pass } : undefined
    })
    const info = await transporter.sendMail({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: (opts.attachments ?? []).map((path) => ({ path }))
    })
    return { messageId: info.messageId }
  }
}

/** 运行时解析出的已配置邮件账号（密码已解密，由主进程注入）。 */
export interface MailAccount {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

let accountProvider: () => MailAccount | null = () => null

/** 主进程注入：从 safeStorage 解密后的邮件账号解析器。 */
export function setMailAccountProvider(fn: () => MailAccount | null): void {
  accountProvider = fn
}

export interface MailCommandsDeps {
  mailer?: MailerLike
}

export function registerMailCommands(
  registry: RegistryLike,
  deps: MailCommandsDeps = {}
): void {
  const mailer = deps.mailer ?? defaultMailer

  registry.register({
    id: 'sendMailSaved',
    name: '发送邮件（用已保存账号）',
    group: '邮件',
    icon: 'mail',
    params: [
      { key: 'to', label: '收件人（逗号分隔）', type: 'text' },
      { key: 'subject', label: '主题', type: 'text' },
      { key: 'text', label: '正文（纯文本）', type: 'text' },
      { key: 'attachments', label: '附件路径（逗号分隔，可选）', type: 'text' }
    ],
    summary: (p) => `邮件(已存账号) -> ${str(p.to)}`,
    runner: async (ctx, p) => {
      const acc = accountProvider()
      if (!acc || !acc.host || !acc.user) {
        throw new Error('未配置邮件账号：请到设置填写 SMTP 账号（密码加密保存）')
      }
      const attachments = str(p.attachments)
        ? str(p.attachments).split(',').map((s) => s.trim()).filter(Boolean)
        : []
      const info = await mailer.send({
        host: acc.host,
        port: acc.port,
        secure: acc.secure,
        user: acc.user,
        pass: acc.pass,
        from: acc.from,
        to: ctx.interpolate(str(p.to)),
        subject: ctx.interpolate(str(p.subject)),
        text: ctx.interpolate(str(p.text)),
        attachments
      })
      ctx.log('success', `邮件已发送 ${info.messageId ?? ''}`)
      return info
    }
  })

  registry.register({
    id: 'sendMail',
    name: '发送邮件（SMTP）',
    group: '邮件',
    icon: 'mail',
    params: [
      { key: 'host', label: 'SMTP 服务器', type: 'text' },
      { key: 'port', label: '端口', type: 'number', default: 465 },
      { key: 'secure', label: 'SSL/TLS', type: 'boolean', default: true },
      { key: 'user', label: '账号', type: 'text' },
      { key: 'pass', label: '密码/授权码', type: 'text' },
      { key: 'from', label: '发件人', type: 'text' },
      { key: 'to', label: '收件人（逗号分隔）', type: 'text' },
      { key: 'subject', label: '主题', type: 'text' },
      { key: 'text', label: '正文（纯文本）', type: 'text' },
      { key: 'html', label: '正文（HTML，可选）', type: 'text' },
      { key: 'attachments', label: '附件路径（逗号分隔，可选）', type: 'text' }
    ],
    summary: (p) => `邮件 → ${str(p.to)}`,
    runner: async (ctx, p) => {
      const attachments = str(p.attachments)
        ? str(p.attachments).split(',').map((s) => s.trim()).filter(Boolean)
        : []
      const info = await mailer.send({
        host: ctx.interpolate(str(p.host)),
        port: Number(p.port ?? 465),
        secure: bool(p.secure, true),
        user: ctx.interpolate(str(p.user)),
        pass: ctx.interpolate(str(p.pass)),
        from: ctx.interpolate(str(p.from)),
        to: ctx.interpolate(str(p.to)),
        subject: ctx.interpolate(str(p.subject)),
        text: p.html ? undefined : ctx.interpolate(str(p.text)),
        html: p.html ? ctx.interpolate(str(p.html)) : undefined,
        attachments
      })
      ctx.log('success', `邮件已发送 ${info.messageId ?? ''}`)
      return info
    }
  })

  registry.register({
    id: 'sendMailViaEnv',
    name: '发送邮件（读环境变量配置）',
    group: '邮件',
    icon: 'mail',
    params: [
      { key: 'to', label: '收件人', type: 'text' },
      { key: 'subject', label: '主题', type: 'text' },
      { key: 'text', label: '正文', type: 'text' }
    ],
    summary: (p) => `邮件(env) → ${str(p.to)}`,
    runner: async (ctx, p) => {
      const host = process.env.RUI_MAIL_HOST ?? ''
      const port = Number(process.env.RUI_MAIL_PORT ?? 465)
      const user = process.env.RUI_MAIL_USER ?? ''
      const pass = process.env.RUI_MAIL_PASS ?? ''
      const from = process.env.RUI_MAIL_FROM ?? user
      if (!host || !user) {
        throw new Error('未设置 RUI_MAIL_HOST / RUI_MAIL_USER 环境变量')
      }
      const info = await mailer.send({
        host, port, secure: true, user, pass, from,
        to: ctx.interpolate(str(p.to)),
        subject: ctx.interpolate(str(p.subject)),
        text: ctx.interpolate(str(p.text))
      })
      ctx.log('success', `邮件已发送 ${info.messageId ?? ''}`)
      return info
    }
  })
}
