import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { FlowSummary } from '../../../shared/flow-protocol'

/** 计划任务摘要（与 preload TaskSummary 对齐） */
interface TaskSummary {
  id: string
  flowId: string
  name: string
  triggerType: 'cron' | 'interval' | 'hotkey' | 'file'
  cronExpr: string
  intervalMs: number
  hotkey: string
  watchPath: string
  enabled: boolean
  lastRunAt: number | null
  nextRunAt: number | null
  runCount: number
}

/**
 * 触发器·计划任务（M5 调度切片）：从占位改为真实列表。
 * 新建任务选一个已保存流程 + cron 表达式 / 固定间隔；开关即时启停并重建定时器。
 */
export default function TriggersView(): JSX.Element {
  const ruili = window.ruili
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [flows, setFlows] = useState<FlowSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 新建表单
  const [showForm, setShowForm] = useState(false)
  const [flowId, setFlowId] = useState('')
  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState<'cron' | 'interval' | 'hotkey' | 'file'>('cron')
  const [cronExpr, setCronExpr] = useState('0 9 * * *')
  const [intervalMin, setIntervalMin] = useState(15)
  const [hotkey, setHotkey] = useState('Control+Shift+R')
  const [watchPath, setWatchPath] = useState('')

  const refresh = useCallback(async () => {
    if (!ruili?.tasks) return
    setLoading(true)
    const [t, f] = await Promise.all([ruili.tasks.list(), ruili.flow.list()])
    if (t.ok) setTasks(t.items)
    else setError(t.error)
    if (f.ok) {
      setFlows(f.items)
      if (!flowId && f.items[0]) setFlowId(f.items[0].id)
    }
    setLoading(false)
  }, [ruili, flowId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function createTask(): Promise<void> {
    if (!ruili?.tasks) return
    if (!flowId) { setError('请选择一个流程'); return }
    const res = await ruili.tasks.create({
      flowId,
      name: name.trim() || '未命名任务',
      triggerType,
      cronExpr: triggerType === 'cron' ? cronExpr : undefined,
      intervalMs: triggerType === 'interval' ? Math.max(1, intervalMin) * 60_000 : undefined,
      hotkey: triggerType === 'hotkey' ? hotkey : undefined,
      watchPath: triggerType === 'file' ? watchPath : undefined
    })
    if (res.ok) {
      setShowForm(false)
      setName('')
      void refresh()
    } else {
      setError(res.error)
    }
  }

  async function toggle(id: string, on: boolean): Promise<void> {
    if (!ruili?.tasks) return
    const r = await ruili.tasks.toggle(id, on)
    if (r.ok) void refresh()
    else setError(r.error)
  }

  async function remove(id: string): Promise<void> {
    if (!ruili?.tasks) return
    if (!window.confirm('确定删除这个计划任务吗？')) return
    const r = await ruili.tasks.remove(id)
    if (r.ok) void refresh()
    else setError(r.error)
  }

  function fmt(ts: number | null): string {
    if (!ts) return '—'
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  function desc(t: TaskSummary): string {
    if (t.triggerType === 'cron') return `cron: ${t.cronExpr}`
    if (t.triggerType === 'hotkey') return `快捷键: ${t.hotkey || '—'}`
    if (t.triggerType === 'file') return `监听目录: ${t.watchPath || '—'}`
    return `每 ${Math.round(t.intervalMs / 60000)} 分钟`
  }

  return (
    <div style={{ padding: 20, overflow: 'auto', height: '100%', background: '#F2F3F5' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1F2329' }}>触发器 · 计划任务</h2>
          <div style={{ fontSize: 12, color: '#8A8F99', marginTop: 2 }}>
            共 {tasks.length} 个任务 · 到点自动运行指定流程
          </div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            marginLeft: 'auto', height: 32, padding: '0 16px', borderRadius: 6,
            border: 'none', background: '#E64340', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}
        >
          {showForm ? '收起' : '+ 新建任务'}
        </button>
      </div>

      {error ? (
        <div style={{ color: '#E64340', fontSize: 13, padding: 12, background: '#FDECEC', borderRadius: 6, marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      {showForm ? (
        <div style={{ background: '#fff', border: '1px solid #E5E6EB', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2329', marginBottom: 12 }}>新建计划任务</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ fontSize: 12, color: '#51565D' }}>
              流程
              <select value={flowId} onChange={(e) => setFlowId(e.target.value)}
                style={{ width: '100%', height: 30, marginTop: 4, borderRadius: 6, border: '1px solid #D8DADD', padding: '0 8px' }}>
                {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: '#51565D' }}>
              任务名
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="留空用流程名"
                style={{ width: '100%', height: 30, marginTop: 4, borderRadius: 6, border: '1px solid #D8DADD', padding: '0 8px' }} />
            </label>
            <label style={{ fontSize: 12, color: '#51565D' }}>
              触发方式
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as 'cron' | 'interval' | 'hotkey' | 'file')}
                style={{ width: '100%', height: 30, marginTop: 4, borderRadius: 6, border: '1px solid #D8DADD', padding: '0 8px' }}>
                <option value="cron">cron 表达式</option>
                <option value="interval">固定间隔</option>
                <option value="hotkey">快捷键</option>
                <option value="file">文件监听</option>
              </select>
            </label>
            {triggerType === 'cron' ? (
              <label style={{ fontSize: 12, color: '#51565D' }}>
                cron 表达式（分 时 日 月 周）
                <input value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} placeholder="0 9 * * *"
                  style={{ width: '100%', height: 30, marginTop: 4, borderRadius: 6, border: '1px solid #D8DADD', padding: '0 8px' }} />
              </label>
            ) : null}
            {triggerType === 'interval' ? (
              <label style={{ fontSize: 12, color: '#51565D' }}>
                间隔（分钟）
                <input type="number" value={intervalMin} min={1} onChange={(e) => setIntervalMin(Number(e.target.value))}
                  style={{ width: '100%', height: 30, marginTop: 4, borderRadius: 6, border: '1px solid #D8DADD', padding: '0 8px' }} />
              </label>
            ) : null}
            {triggerType === 'hotkey' ? (
              <label style={{ fontSize: 12, color: '#51565D' }}>
                快捷键（Electron 加速器格式）
                <input value={hotkey} onChange={(e) => setHotkey(e.target.value)} placeholder="Control+Shift+R"
                  style={{ width: '100%', height: 30, marginTop: 4, borderRadius: 6, border: '1px solid #D8DADD', padding: '0 8px' }} />
              </label>
            ) : null}
            {triggerType === 'file' ? (
              <label style={{ fontSize: 12, color: '#51565D' }}>
                监听目录（新文件出现时触发）
                <input value={watchPath} onChange={(e) => setWatchPath(e.target.value)} placeholder="C:\Users\你\Downloads"
                  style={{ width: '100%', height: 30, marginTop: 4, borderRadius: 6, border: '1px solid #D8DADD', padding: '0 8px' }} />
              </label>
            ) : null}
          </div>
          <button onClick={() => void createTask()}
            style={{ marginTop: 12, height: 30, padding: '0 16px', borderRadius: 6, border: 'none', background: '#E64340', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
            创建
          </button>
        </div>
      ) : null}

      {loading ? (
        <div style={{ color: '#8A8F99', fontSize: 13, padding: 24 }}>加载中…</div>
      ) : tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', background: '#fff', borderRadius: 10, border: '1px dashed #D8DADD' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1F2329' }}>还没有计划任务</div>
          <div style={{ fontSize: 12, color: '#8A8F99', marginTop: 6 }}>
            点击右上角「新建任务」，选一个流程并设置 cron 或间隔
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tasks.map((t) => (
            <div key={t.id} style={{ background: '#fff', border: '1px solid #E5E6EB', borderRadius: 8, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#E8F0FE', color: '#2F80ED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                ⏰
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2329' }}>{t.name}</div>
                <div style={{ fontSize: 11, color: '#8A8F99', marginTop: 2 }}>
                  {desc(t)} · 已跑 {t.runCount} 次 · 上次 {fmt(t.lastRunAt)} · 下次 {fmt(t.nextRunAt)}
                </div>
              </div>
              <button onClick={() => void toggle(t.id, !t.enabled)}
                style={{
                  height: 24, width: 44, borderRadius: 99, border: 'none', cursor: 'pointer',
                  background: t.enabled ? '#E64340' : '#D8DADD', position: 'relative'
                }}
                aria-label="启停">
                <span style={{
                  position: 'absolute', top: 3, left: t.enabled ? 23 : 3,
                  width: 18, height: 18, borderRadius: 99, background: '#fff', transition: 'left .15s'
                }} />
              </button>
              <button onClick={() => void remove(t.id)}
                style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #FDECEC', background: '#fff', color: '#E64340', fontSize: 12, cursor: 'pointer' }}>
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
