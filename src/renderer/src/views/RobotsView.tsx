import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { RunWireEvent } from '../../../shared/run-protocol'

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

/** 运行中的实时项（M5-10）：flow-start 建、log 追加、flow-end 后落库并刷新历史 */
interface LiveRun {
  flowName: string
  startedAt: number
  entries: RunLogEntryRow[]
}

const LEVEL_COLOR: Record<string, string> = {
  error: '#E64340',
  warn: '#ED7B2F',
  info: '#1F2329',
  debug: '#8A8F99'
}

/**
 * 机器人·执行记录（M5-3；M5-10 增强实时流）：
 *  - 历史从 logs 表按 run_id 聚合；
 *  - 同时订阅 run:event，调度/设计器触发运行时顶部实时显示「运行中」项，
 *    日志流式追加，flow-end 后自动刷新历史落库项。
 */
export default function RobotsView(): JSX.Element {
  const ruili = window.ruili
  const [items, setItems] = useState<RunHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [entries, setEntries] = useState<RunLogEntryRow[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [flowFilter, setFlowFilter] = useState<string>('all')
  const [live, setLive] = useState<LiveRun | null>(null)
  const liveRef = useRef<LiveRun | null>(null)
  // M5-12：AI 解释错误
  const [explainRunId, setExplainRunId] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [explainText, setExplainText] = useState('')
  const [explainErr, setExplainErr] = useState('')
  liveRef.current = live

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

  // M5-10：订阅运行事件流。RobotsView 挂载期间，任何触发源（设计器/调度/热键/文件）
  // 开始运行都会在顶部出现实时项，日志边跑边出；结束后刷新历史。
  useEffect(() => {
    if (!ruili?.run?.onEvent) return
    const off = ruili.run.onEvent((e: RunWireEvent) => {
      if (e.type === 'flow-start') {
        setLive({ flowName: e.flowName, startedAt: Date.now(), entries: [] })
      } else if (e.type === 'log') {
        const cur = liveRef.current
        if (cur) {
          setLive({ ...cur, entries: [...cur.entries, { level: e.level, message: e.message, ts: Date.now() }] })
        }
      } else if (e.type === 'flow-end') {
        setLive(null)
        void refresh()
      }
    })
    return off
  }, [ruili, refresh])

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
    setExplainRunId(null)
    setExplainText('')
    setExplainErr('')
  }

  async function askExplain(runId: string): Promise<void> {
    if (!ruili?.llm?.explainError) return
    setExplaining(true)
    setExplainRunId(runId)
    setExplainText('')
    setExplainErr('')
    const r = await ruili.llm.explainError(runId)
    setExplaining(false)
    if (r.ok) setExplainText(r.explanation ?? '')
    else setExplainErr(r.error ?? '解释失败')
  }

  async function clearHistory(): Promise<void> {
    if (!ruili?.runs) return
    if (!window.confirm('确定清空全部运行记录吗？此操作不可恢复。')) return
    const res = await ruili.runs.clear()
    if (res.ok) void refresh()
    else setError(res.error)
  }

  const flowOptions = Array.from(new Map(items.map((r) => [r.flowId ?? '', r.flowName ?? '未保存'])).entries())
  const shown = flowFilter === 'all' ? items : items.filter((r) => (r.flowId ?? '') === flowFilter)

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

  function renderEntries(list: RunLogEntryRow[]): JSX.Element {
    if (list.length === 0) return <div style={{ fontSize: 12, color: '#8A8F99' }}>无日志</div>
    return (
      <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'Consolas, monospace' }}>
        {list.map((e, i) => (
          <div key={i}>
            <span style={{ color: '#B4B9C0' }}>{fmt(e.ts)} </span>
            <span style={{ color: LEVEL_COLOR[e.level] ?? '#1F2329' }}>[{e.level}]</span>{' '}
            {e.message}
          </div>
        ))}
      </pre>
    )
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
        <select value={flowFilter} onChange={(e) => setFlowFilter(e.target.value)}
          style={{ marginLeft: 'auto', height: 32, borderRadius: 6, border: '1px solid #D8DADD', background: '#fff', color: '#1F2329', fontSize: 13, padding: '0 8px' }}>
          <option value="all">全部流程</option>
          {flowOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <button
          onClick={() => void clearHistory()}
          style={{ marginLeft: 8, height: 32, padding: '0 16px', borderRadius: 6, border: '1px solid #FDECEC', background: '#fff', color: '#E64340', fontSize: 13, cursor: 'pointer' }}
        >
          清空
        </button>
        <button
          onClick={() => void refresh()}
          style={{ marginLeft: 8, height: 32, padding: '0 16px', borderRadius: 6, border: '1px solid #D8DADD', background: '#fff', color: '#1F2329', fontSize: 13, cursor: 'pointer' }}
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
      ) : !live && shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', background: '#fff', borderRadius: 10, border: '1px dashed #D8DADD' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1F2329' }}>还没有运行记录</div>
          <div style={{ fontSize: 12, color: '#8A8F99', marginTop: 6 }}>
            在应用管理里跑一个流程，结束后会出现在这里
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {live ? (
            <div key="__live__" style={{ background: '#fff', border: '1px solid #B7C9FF', borderRadius: 8, overflow: 'hidden', boxShadow: '0 0 0 2px #E8F0FF' }}>
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, color: '#2F80ED' }}>●</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2329' }}>{live.flowName || '未保存流程'}</span>
                  <span style={{ marginLeft: 10, fontSize: 11, color: '#8A8F99' }}>{fmt(live.startedAt)}</span>
                </div>
                <span style={{ fontSize: 11, color: '#8A8F99' }}>{live.entries.length} 条 · 进行中</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#E8F0FF', color: '#2F80ED', fontWeight: 600 }}>running</span>
              </div>
              <div style={{ borderTop: '1px solid #F0F1F2', background: '#FAFBFC', padding: '8px 14px' }}>
                {renderEntries(live.entries)}
              </div>
            </div>
          ) : null}
          {shown.map((r) => (
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
                  ) : (
                    renderEntries(entries)
                  )}
                  {(r.status === 'error' || r.status === 'failed') ? (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #E5E6EB' }}>
                      {explainRunId === r.runId && explaining ? (
                        <div style={{ fontSize: 12, color: '#8A8F99' }}>AI 分析中…</div>
                      ) : explainRunId === r.runId && explainText ? (
                        <div style={{ fontSize: 12, lineHeight: 1.6, background: '#F5F2FF', border: '1px solid #D9CCFF', borderRadius: 6, padding: 8 }}>
                          <div style={{ fontWeight: 600, color: '#7C5CFC', marginBottom: 4 }}>AI 解释</div>
                          {explainText}
                        </div>
                      ) : explainRunId === r.runId && explainErr ? (
                        <div style={{ fontSize: 12, color: '#E64340' }}>⚠ {explainErr}</div>
                      ) : (
                        <button
                          onClick={() => void askExplain(r.runId)}
                          style={{ height: 28, padding: '0 12px', border: '1px solid #D9CCFF', borderRadius: 6, background: '#fff', color: '#7C5CFC', fontSize: 12, cursor: 'pointer' }}
                        >
                          ✦ AI 解释此错误
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
