import { useEffect, useState } from 'react'
import type { JSX } from 'react'

const INPUT: React.CSSProperties = {
  height: 28,
  width: '100%',
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid #D8DADD',
  fontSize: 12,
  boxSizing: 'border-box',
  outline: 'none'
}

const BTN: React.CSSProperties = {
  height: 26,
  padding: '0 12px',
  border: 'none',
  borderRadius: 6,
  background: '#E64340',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer'
}

/**
 * 邮件账号配置（M7-30）：SMTP 发信账号。
 * 密码经主进程 safeStorage（DPAPI）加密落盘，渲染端只回 hasPassword，拿不到明文。
 * 配置后可用「发送邮件（用已保存账号）」指令发信，不必每步填密码。
 */
export default function MailAccountPanel(): JSX.Element {
  const ruili = window.ruili
  const [host, setHost] = useState('')
  const [port, setPort] = useState('465')
  const [secure, setSecure] = useState(true)
  const [user, setUser] = useState('')
  const [from, setFrom] = useState('')
  const [pass, setPass] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void (async () => {
      if (!ruili?.mail) return
      const a = await ruili.mail.getAccount()
      setHost(a.host)
      setPort(String(a.port))
      setSecure(a.secure)
      setUser(a.user)
      setFrom(a.from)
      setHasPassword(a.hasPassword)
    })()
  }, [ruili])

  async function save(): Promise<void> {
    if (!ruili?.mail) return
    const r = await ruili.mail.saveAccount({
      host: host.trim(),
      port: Number(port) || 465,
      secure,
      user: user.trim(),
      from: from.trim(),
      pass: pass || undefined
    })
    if (r.ok) {
      setHasPassword(true)
      setPass('')
      setMsg('✓ 已保存（密码加密存储）')
    } else {
      setMsg(`⚠ ${r.error ?? '保存失败'}`)
    }
  }

  return (
    <div style={{ marginTop: 16, padding: '12px 12px', background: '#fff', border: '1px solid #E5E6EB', borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#1F2329', marginBottom: 10 }}>邮件账号（SMTP）</div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#8A8F99', marginBottom: 3 }}>SMTP 服务器</div>
        <input style={INPUT} value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.qq.com / smtp.163.com" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#8A8F99', marginBottom: 3 }}>端口</div>
          <input style={INPUT} value={port} onChange={(e) => setPort(e.target.value)} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#51565D', paddingTop: 18 }}>
          <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
          SSL/TLS
        </label>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#8A8F99', marginBottom: 3 }}>账号（发信邮箱）</div>
        <input style={INPUT} value={user} onChange={(e) => setUser(e.target.value)} placeholder="you@example.com" />
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#8A8F99', marginBottom: 3 }}>
          密码 / 授权码 {hasPassword ? '（已设置，留空保留）' : ''}
        </div>
        <input
          style={INPUT}
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder={hasPassword ? '••••••••' : 'QQ/163 用授权码'}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#8A8F99', marginBottom: 3 }}>发件人显示（可选）</div>
        <input style={INPUT} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="默认同账号" />
      </div>

      <button type="button" onClick={() => void save()} style={BTN}>保存账号</button>
      {msg ? (
        <div style={{ fontSize: 11, marginTop: 6, color: msg.startsWith('⚠') ? '#E64340' : '#0E9F5D' }}>{msg}</div>
      ) : null}
    </div>
  )
}
