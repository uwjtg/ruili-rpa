/**
 * 元素库页签（M3 切片 2/3）。
 *
 * 展示 SQLite elements 表中的 picked 元素（主进程在拾取成功时自动入库，按
 * 签名去重）。每条元素可「插入步骤」（append 一条 pickElement 步骤，target 用
 * 该元素完整签名——回放走选择器回退链）、「校验」（dry-run 只定位不点击，
 * 上报命中策略）或「删除」。
 */

import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { ElementRecord } from '../../../../shared/elements'
import type { PickedElement } from '../../../../shared/desktop-pick'

interface ElementPanelProps {
  /** 插入一条 pickElement 步骤（target 用元素签名 JSON） */
  onInsert: (element: PickedElement) => void
}

/** 校验状态：pending=校验中；ok=定位成功（含策略）；fail=未定位到（附逐级报告） */
type VerifyState = {
  state: 'pending' | 'ok' | 'fail'
  strategy?: string
  trace?: string[]
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}

export default function ElementPanel({
  onInsert
}: ElementPanelProps): JSX.Element {
  const ruili = window.ruili
  const [items, setItems] = useState<ElementRecord[]>([])
  const [error, setError] = useState('')
  const [verify, setVerify] = useState<Record<string, VerifyState>>({})

  const refresh = useCallback(() => {
    if (!ruili?.elements) return
    void ruili.elements.list().then((res) => {
      if (!res.ok) {
        setError(res.error)
        return
      }
      setError('')
      setItems(res.items)
    })
  }, [ruili])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function remove(id: string): Promise<void> {
    if (!ruili?.elements) return
    const res = await ruili.elements.delete(id)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  /** 元素库「校验」：sidecar dry-run 只定位不点击，展示命中策略（M3 切片 3） */
  async function verifyElement(id: string): Promise<void> {
    if (!ruili?.elements?.verify) return
    setVerify((prev) => ({ ...prev, [id]: { state: 'pending' } }))
    const r = await ruili.elements.verify(id)
    setVerify((prev) => ({
      ...prev,
      [id]:
        r.ok && r.found
          ? { state: 'ok', strategy: r.strategy ?? 'strict' }
          : { state: 'fail', trace: r.trace ?? [] }
    }))
  }

  if (!ruili?.elements) {
    return <div style={{ padding: 12, color: '#B0B6BF', fontSize: 12 }}>元素库不可用</div>
  }

  return (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#51565D' }}>
          元素库（{items.length}）
        </span>
        <button
          onClick={refresh}
          style={{
            border: '1px solid #D8DADD',
            background: '#fff',
            borderRadius: 6,
            height: 22,
            padding: '0 8px',
            fontSize: 11,
            color: '#51565D',
            cursor: 'pointer'
          }}
        >
          刷新
        </button>
      </div>
      {error ? <div style={{ color: '#E64340', fontSize: 12 }}>{error}</div> : null}
      {items.length === 0 ? (
        <div style={{ color: '#B0B6BF', fontSize: 12, lineHeight: 1.7 }}>
          暂无元素。点工具栏「拾取」后，拾取到的元素会自动加入这里（相同元素去重）。
        </div>
      ) : (
        items.map((it) => (
          <div
            key={it.id}
            style={{
              border: '1px solid #E5E6EB',
              borderRadius: 6,
              padding: '6px 8px',
              background: '#fff'
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#1F2329',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={it.label}
            >
              {it.label}
            </div>
            <div style={{ fontSize: 11, color: '#8A8F99', marginTop: 2, lineHeight: 1.5 }}>
              <span style={{ color: '#7C5CFC' }}>{it.signature.controlType || '未知控件'}</span>
              {it.signature.windowTitle ? ` · ${it.signature.windowTitle}` : ''}
              {it.signature.automationId ? ` · #${it.signature.automationId}` : ''}
            </div>
            <div style={{ fontSize: 11, color: '#B0B6BF', marginTop: 2 }}>
              拾取于 {fmt(it.updatedAt)}
            </div>
            {verify[it.id]?.state === 'ok' ? (
              <div style={{ fontSize: 11, color: '#1DBF73', marginTop: 2 }}>
                校验通过（定位策略：{verify[it.id].strategy}）
              </div>
            ) : verify[it.id]?.state === 'fail' ? (
              <div style={{ fontSize: 11, color: '#E64340', marginTop: 2 }}>
                校验失败：当前无法定位该元素
                {verify[it.id].trace && verify[it.id].trace!.length > 0 ? (
                  <div
                    style={{
                      marginTop: 3,
                      padding: '4px 6px',
                      background: '#FDECEC',
                      borderRadius: 4,
                      color: '#C0392B',
                      lineHeight: 1.6,
                      fontFamily: 'Consolas, "Cascadia Code", monospace',
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    {verify[it.id].trace!.join('\n')}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                onClick={() => onInsert(it.signature)}
                style={{
                  flex: 1,
                  border: '1px solid #7C5CFC',
                  background: '#F1EDFF',
                  color: '#7C5CFC',
                  borderRadius: 6,
                  height: 24,
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                插入步骤
              </button>
              <button
                onClick={() => void verifyElement(it.id)}
                disabled={verify[it.id]?.state === 'pending'}
                style={{
                  border: '1px solid #2F80ED',
                  background: '#EBF3FE',
                  color: '#2F80ED',
                  borderRadius: 6,
                  height: 24,
                  padding: '0 10px',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {verify[it.id]?.state === 'pending' ? '校验中…' : '校验'}
              </button>
              <button
                onClick={() => void remove(it.id)}
                style={{
                  border: '1px solid #FDECEC',
                  background: '#FDECEC',
                  color: '#E64340',
                  borderRadius: 6,
                  height: 24,
                  padding: '0 10px',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
