/**
 * 关于区块（M6-6）：右侧「设置」页签最底部。
 *
 * 显示当前版本号、检查更新按钮、查看崩溃日志按钮。
 * 不重复 LLM/阈值设置——那些已有专门面板。
 */
import { useState } from 'react'
import type { JSX } from 'react'

const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8
}

const LABEL: React.CSSProperties = { fontSize: 12, color: '#51565D' }

const BTN: React.CSSProperties = {
  height: 26,
  padding: '0 10px',
  border: '1px solid #D8DADD',
  borderRadius: 6,
  background: '#fff',
  color: '#1F2329',
  fontSize: 12,
  cursor: 'pointer'
}

export default function AboutPanel(): JSX.Element {
  const ruili = window.ruili
  const [msg, setMsg] = useState('')

  async function openCrashLog(): Promise<void> {
    if (!ruili?.crash?.openLog) return
    const r = await ruili.crash.openLog()
    setMsg(r.ok ? '✓ 已打开 crash.log' : `⚠ ${r.error ?? '打开失败'}`)
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #E5E6EB' }}>
      <div style={{ fontSize: 12, color: '#51565D', marginBottom: 10 }}>关于</div>

      <div style={ROW}>
        <span style={LABEL}>版本</span>
        <span style={{ fontSize: 12, color: '#1F2329', fontWeight: 600 }}>
          v{ruili?.appVersion ?? '0.0.0'}
        </span>
      </div>

      <div style={ROW}>
        <span style={LABEL}>检查更新</span>
        <button
          onClick={() => ruili?.updater?.check()}
          style={BTN}
        >
          立即检查
        </button>
      </div>

      <div style={ROW}>
        <span style={LABEL}>崩溃日志</span>
        <button onClick={() => void openCrashLog()} style={BTN}>
          查看 crash.log
        </button>
      </div>

      {msg ? (
        <div style={{ fontSize: 11, marginTop: 6, color: msg.startsWith('⚠') ? '#E64340' : '#1DBF73' }}>
          {msg}
        </div>
      ) : null}
    </div>
  )
}
