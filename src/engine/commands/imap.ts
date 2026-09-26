/**
 * IMAP 收邮件指令（M7 切片 25）。
 *
 * 依赖 imapflow（纯 Node，MIT）。与已有 nodemailer（SMTP 发信）互补。
 *
 * 清单（3 条）：
 *  imapConnect        连接 IMAP 服务器并登录
 *  imapFetchUnseen    拉未读邮件（返回头信息+正文前 N 字符）
 *  imapDisconnect     断开
 *
 * 会话管理：模块级单例 client，connect 后存起来，fetch/disconnect 复用。
 * 测试注入 fake。
 */

import type { RegisteredCommand } from './registry'
import { ImapFlow } from 'imapflow'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}
function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** 最小 IMAP 客户端接口（测试可注入 fake） */
export interface ImapLike {
  connect(opts: {
    host: string; port: number; secure: boolean; user: string; pass: string
  }): Promise<void>
  fetchUnseen(limit: number, bodyChars: number): Promise<Array<Record<string, unknown>>>
  disconnect(): Promise<void>
}

/** 真 IMAPFlow 实现（懒构造） */
class RealImapClient implements ImapLike {
  private client: InstanceType<typeof ImapFlow> | null = null
  async connect(opts: {
    host: string; port: number; secure: boolean; user: string; pass: string
  }): Promise<void> {
    this.client = new ImapFlow({
      host: opts.host,
      port: opts.port,
      secure: opts.secure,
      auth: { user: opts.user, pass: opts.pass },
      logger: false
    })
    await this.client.connect()
  }
  async fetchUnseen(limit: number, bodyChars: number): Promise<Array<Record<string, unknown>>> {
    if (!this.client) throw new Error('未连接')
    const client = this.client
    const lock = await client.getMailboxLock('INBOX')
    try {
      const out: Array<Record<string, unknown>> = []
      for await (const msg of client.fetch(
        { seen: false },
        { envelope: true, source: true, uid: true }
      )) {
        if (out.length >= limit) break
        const env = (msg as any).envelope || {}
        const source: string = (msg as any).source?.toString?.('utf8') ?? ''
        out.push({
          uid: (msg as any).uid,
          subject: env.subject ?? '',
          from: env.from?.[0]?.address ?? '',
          to: env.to?.[0]?.address ?? '',
          date: env.date ? new Date(env.date).toISOString() : '',
          preview: source.slice(0, bodyChars)
        })
      }
      return out
    } finally {
      lock.release()
    }
  }
  async disconnect(): Promise<void> {
    try { await this.client?.logout() } catch { /* ignore */ }
    this.client = null
  }
}

let singleton: ImapLike | null = null

export function setImapSingleton(c: ImapLike | null): void {
  singleton = c
}

export interface ImapCommandsDeps {
  imap?: ImapLike
}

export function registerImapCommands(
  registry: RegistryLike,
  deps: ImapCommandsDeps = {}
): void {
  const getClient = (): ImapLike => {
    if (deps.imap) return deps.imap
    if (!singleton) singleton = new RealImapClient()
    return singleton
  }

  registry.register({
    id: 'imapConnect',
    name: '连接 IMAP 邮箱',
    group: '邮件',
    icon: 'mail',
    params: [
      { key: 'host', label: 'IMAP 主机', type: 'text', placeholder: 'imap.qq.com' },
      { key: 'port', label: '端口', type: 'number', default: 993 },
      { key: 'secure', label: 'SSL/TLS', type: 'boolean', default: true },
      { key: 'user', label: '邮箱账号', type: 'text' },
      { key: 'pass', label: '授权码/密码', type: 'text' }
    ],
    summary: (p) => `${str(p.user)}@${str(p.host)}`,
    runner: async (ctx, p) => {
      const host = ctx.interpolate(str(p.host))
      const port = num(p.port, 993)
      const secure = p.secure !== false
      const user = ctx.interpolate(str(p.user))
      const pass = ctx.interpolate(str(p.pass))
      await getClient().connect({ host, port, secure, user, pass })
      ctx.log('success', `已连接 ${user}@${host}`)
      return true
    }
  })

  registry.register({
    id: 'imapFetchUnseen',
    name: '拉未读邮件',
    group: '邮件',
    icon: 'mail-open',
    params: [
      { key: 'limit', label: '最多拉几封', type: 'number', default: 10 },
      { key: 'bodyChars', label: '正文前 N 字符', type: 'number', default: 500 },
      { key: 'resultVar', label: '结果变量（列表）', type: 'text', default: 'mails' }
    ],
    summary: (p) => `未读 ×${String(p.limit)} → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const limit = Math.max(1, num(p.limit, 10))
      const bodyChars = Math.max(0, num(p.bodyChars, 500))
      const mails = await getClient().fetchUnseen(limit, bodyChars)
      ctx.setVar(str(p.resultVar, 'mails'), mails)
      ctx.log('success', `拉到 ${mails.length} 封未读`)
      return mails
    }
  })

  registry.register({
    id: 'imapDisconnect',
    name: '断开 IMAP',
    group: '邮件',
    icon: 'log-out',
    params: [],
    summary: () => 'imap logout',
    runner: async () => {
      await getClient().disconnect()
      return true
    }
  })
}
