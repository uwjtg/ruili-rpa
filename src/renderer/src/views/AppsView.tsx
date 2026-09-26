import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FlowSummary } from '../../../shared/flow-protocol'

/**
 * 应用视图（M2 切片 2）：从演示占位改为真实 SQLite 流程列表。
 * 卡片「编辑」进编辑器加载对应流程（/editor?flowId=xxx）；「新建」开空白流程；
 * 悬停出删除。运行入口（点卡片直接跑）留待 M4 机器人模式。
 */
export default function AppsView(): JSX.Element {
  const ruili = window.ruili
  const navigate = useNavigate()
  const [items, setItems] = useState<FlowSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    if (!ruili?.flow) return
    setLoading(true)
    const res = await ruili.flow.list()
    if (res.ok) {
      setItems(res.items)
      setError('')
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [ruili])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function removeFlow(id: string, name: string): Promise<void> {
    if (!ruili?.flow) return
    if (!window.confirm(`确定删除应用「${name}」吗？此操作不可恢复。`)) return
    const res = await ruili.flow.delete(id)
    if (res.ok) void refresh()
    else setError(res.error)
  }

  /** M5-24：导入一个 .json 流程包 → 另存为新流程 */
  async function importFlowPackage(): Promise<void> {
    if (!ruili?.flow?.importFlow) return
    setError('')
    setNotice('')
    const res = await ruili.flow.importFlow()
    if (!res.ok) {
      if (res.error !== '已取消') setError(res.error)
      return
    }
    const saved = await ruili.flow.save(res.flow)
    if (saved.ok) {
      setNotice(`已导入「${res.flow.name}」`)
      void refresh()
    } else {
      setError(saved.error ?? '导入保存失败')
    }
  }

  /** M5-24：导出单个流程为 .json */
  async function exportFlow(id: string): Promise<void> {
    if (!ruili?.flow?.exportFlow) return
    setError('')
    setNotice('')
    const res = await ruili.flow.exportFlow(id)
    if (res.ok) setNotice(`已导出到：${res.path}`)
    else if (res.error !== '已取消') setError(res.error)
  }

  function fmtTime(ts: number): string {
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div style={{ padding: 20, overflow: 'auto', height: '100%', background: '#F2F3F5' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1F2329' }}>应用管理</h2>
          <div style={{ fontSize: 12, color: '#8A8F99', marginTop: 2 }}>
            共 {items.length} 个应用 · 数据来自本地 SQLite
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => void importFlowPackage()}
            style={{
              height: 32,
              padding: '0 16px',
              borderRadius: 6,
              border: '1px solid #D8DADD',
              background: '#fff',
              color: '#1F2329',
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            导入流程
          </button>
          <button
            onClick={() => navigate('/market')}
            style={{
              height: 32,
              padding: '0 16px',
              borderRadius: 6,
              border: '1px solid #D8DADD',
              background: '#fff',
              color: '#1F2329',
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            从模板新建
          </button>
          <button
            onClick={() => navigate('/editor')}
            style={{
              height: 32,
              padding: '0 16px',
              borderRadius: 6,
              border: 'none',
              background: '#E64340',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            + 新建应用
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ color: '#E64340', fontSize: 13, padding: 12, background: '#FDECEC', borderRadius: 6 }}>
          加载失败：{error}
        </div>
      ) : null}

      {notice ? (
        <div style={{ color: '#0E9F5D', fontSize: 13, padding: 12, background: '#E7F8F0', borderRadius: 6, marginBottom: 12 }}>
          {notice}
        </div>
      ) : null}

      {loading ? (
        <div style={{ color: '#8A8F99', fontSize: 13, padding: 24 }}>加载中…</div>
      ) : items.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '80px 20px',
            background: '#fff',
            borderRadius: 10,
            border: '1px dashed #D8DADD'
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1F2329' }}>还没有应用</div>
          <div style={{ fontSize: 12, color: '#8A8F99', marginTop: 6 }}>
            点击右上角「新建应用」创建第一个流程，或在编辑器里保存后自动出现在这里
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12
          }}
        >
          {items.map((app) => (
            <div
              key={app.id}
              style={{
                background: '#fff',
                border: '1px solid #E5E6EB',
                borderRadius: 8,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                transition: 'border-color .15s, box-shadow .15s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#F1EDFF',
                    color: '#7C5CFC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 14,
                    flexShrink: 0
                  }}
                >
                  {app.name.slice(0, 1)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2329', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {app.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#8A8F99' }}>
                    {app.stepCount} 步 · 编辑于 {fmtTime(app.updatedAt)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => navigate(`/editor?flowId=${app.id}`)}
                  style={{
                    flex: 1,
                    height: 28,
                    borderRadius: 6,
                    border: '1px solid #D8DADD',
                    background: '#fff',
                    color: '#1F2329',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  编辑
                </button>
                <button
                  onClick={() => navigate(`/editor?flowId=${app.id}&autorun=1`)}
                  style={{
                    flex: 1,
                    height: 28,
                    borderRadius: 6,
                    border: 'none',
                    background: '#1DBF73',
                    color: '#fff',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  运行
                </button>
                <button
                  onClick={() => void exportFlow(app.id)}
                  style={{
                    height: 28,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #E5E6EB',
                    background: '#fff',
                    color: '#51565D',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  导出
                </button>
                <button
                  onClick={() => void removeFlow(app.id, app.name)}
                  style={{
                    height: 28,
                    padding: '0 10px',
                    borderRadius: 6,
                    border: '1px solid #FDECEC',
                    background: '#fff',
                    color: '#E64340',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
