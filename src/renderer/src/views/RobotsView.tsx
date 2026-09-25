import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'

interface RunHistoryItem {
  runId: string
  flowId: string | null
  flowName: string | null
  status: string
  durationMs: number | null
  startedAt: number
  endedAt: number
  entryCount: number
}
interface RunLogEntryRow {
  level: string
  message: string
  ts: number
}

const LEVEL_COLOR: Record<string, string> = {
  error: '#E64340',
  warn: '#ED7B2F',
  info: '#1F2329',
  debug: '#8A8F99'
}

/**
 * 机器人·执行记录（M5-3）：从 logs 表按 run_id 聚合展示历史。
 * 点击一行展开当次运行的日志明细。
 */
export default function RobotsView(): JSX.Element {
  const ruili = window.ruili
  const [items, setItems] = useState<RunHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [entries, setEntries] = useState<RunLogEntryRow[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)

  const refresh = useCallback(async () => {
    if (!ruili?.runs) return
    setLoading(true)
    const res = await ruili.runs.history(100)
    if (res.ok) setItems(res.items)
    else setError(res.error)
    setLoading(false)
  }, [ruili])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function toggle(runId: string): Promise<void> {
    if (!ruili?.runs) return
    if (openId === runId) {
      setOpenId(null)
      return
    }
    setOpenId(runId)
    setLoadingEntries(true)
    const res = await ruili.runs.entries(runId)
    setEntries(res.ok ? res.items : [])
    setLoadingEntries(false)
  }

  function fmt(ts: number): string {
    const d = new Date(ts)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }
  function fmtDur(ms: number | null): string {
    if (ms == null) return '—'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }
  function statusColor(s: string): string {
    if (s === 'completed' || s === 'ok') return '#1DBF73'
    if (s === 'error' || s === 'failed') return '#E64340'
    if (s === 'cancelled') return '#8A8F99'
    return '#2F80ED'
  }

  return (
    <div style={{ padding: 20, overflow: 'auto', height: '100%', background: '#F2F3F5' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1F2329' }}>机器人 · 执行记录</h2>
          <div style={{ fontSize: 12, color: '#8A8F99', marginTop: 2 }}>
            最近 {items.length} 次运行 · 点击展开日志
          </div>
        </div>
        <button
          onClick={() => void refresh()}
          style={{ marginLeft: 'auto', height: 32, padding: '0 16px', borderRadius: 6, border: '1px solid #D8DADD', background: '#fff', color: '#1F2329', fontSize: 13, cursor: 'pointer' }}
        >
          刷新
        </button>
      </div>

      {error ? (
        <div style={{ color: '#E64340', fontSize: 13, padding: 12, background: '#FDECEC', borderRadius: 6, marginBottom: 12 }}>
          加载失败：{error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ color: '#8A8F99', fontSize: 13, padding: 24 }}>加载中…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', background: '#fff', borderRadius: 10, border: '1px dashed #D8DADD' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1F2329' }}>还没有运行记录</div>
          <div style={{ fontSize: 12, color: '#8A8F99', marginTop: 6 }}>
            在应用管理里跑一个流程，结束后会出现在这里
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((r) => (
            <div key={r.runId} style={{ background: '#fff', border: '1px solid #E5E6EB', borderRadius: 8, overflow: 'hidden' }}>
              <div onClick={() => void toggle(r.runId)} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <span style={{ fontSize: 14 }}>{openId === r.runId ? '▼' : '▶'}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2329' }}>
                    {r.flowName ?? '未保存流程'}
                  </span>
                  <span style={{ marginLeft: 10, fontSize: 11, color: '#8A8F99' }}>{fmt(r.startedAt)}</span>
                </div>
                <span style={{ fontSize: 11, color: '#8A8F99' }}>{r.entryCount} 条 · {fmtDur(r.durationMs)}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: statusColor(r.status) + '1A', color: statusColor(r.status), fontWeight: 600 }}>
                  {r.status}
                </span>
              </div>
              {openId === r.runId ? (
                <div style={{ borderTop: '1px solid #F0F1F2', background: '#FAFBFC', padding: '8px 14px' }}>
                  {loadingEntries ? (
                    <div style={{ fontSize: 12, color: '#8A8F99' }}>日志加载中…</div>
                  ) : entries.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#8A8F99' }}>无日志</div>
                  ) : (
                    <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'Consolas, monospace' }}>
                      {entries.map((e, i) => (
                        <div key={i}>
                          <span style={{ color: '#B4B9C0' }}>{fmt(e.ts)} </span>
                          <span style={{ color: LEVEL_COLOR[e.level] ?? '#1F2329' }}>[{e.level}]</span>{' '}
                          {e.message}
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
