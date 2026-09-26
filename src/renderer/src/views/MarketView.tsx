import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import {
  OFFICIAL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  countTemplateSteps,
  type TemplateInfo
} from '@shared/templates'

/** 分类图标底色（与设计 token 对齐） */
const CATEGORY_COLOR: Record<string, string> = {
  入门示例: '#E8F0FE',
  网页自动化: '#F1EDFF',
  Excel表格: '#E7F8F0',
  桌面自动化: '#FFF4E6',
  图像OCR: '#FDECEC',
  实用工具: '#EEF0F3'
}

const CATEGORY_TEXT: Record<string, string> = {
  入门示例: '#2F80ED',
  网页自动化: '#7C5CFC',
  Excel表格: '#0E9F5D',
  桌面自动化: '#C46211',
  图像OCR: '#E64340',
  实用工具: '#51565D'
}

/**
 * 市场视图（M5 切片 23）：内置官方模板画廊。
 * 「使用模板」= 把模板 FlowDoc 经 flow.save() 另存为新流程，再跳编辑器打开。
 */
export default function MarketView(): JSX.Element {
  const ruili = window.ruili
  const navigate = useNavigate()
  const [cat, setCat] = useState<string>('全部')
  const [kw, setKw] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string>('')

  const cats = useMemo(() => ['全部', ...TEMPLATE_CATEGORIES], [])

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase()
    return OFFICIAL_TEMPLATES.filter((t) => {
      if (cat !== '全部' && t.category !== cat) return false
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      )
    })
  }, [cat, kw])

  async function useTemplate(t: TemplateInfo): Promise<void> {
    if (!ruili?.flow) {
      setError('流程存储不可用')
      return
    }
    setBusyId(t.id)
    setError('')
    try {
      const res = await ruili.flow.save(t.flow)
      if (res.ok) {
        navigate(`/editor?flowId=${res.id}`)
      } else {
        setError(res.error ?? '使用模板失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId('')
    }
  }

  return (
    <div style={{ padding: 20, overflow: 'auto', height: '100%', background: '#F2F3F5' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1F2329' }}>
            官方模板
          </h2>
          <div style={{ fontSize: 12, color: '#8A8F99', marginTop: 2 }}>
            共 {OFFICIAL_TEMPLATES.length} 个官方模板 · 点「使用」复制一份到我的应用，再按需要改
          </div>
        </div>
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 10, top: 8, color: '#8A8F99', display: 'inline-flex' }}>
            <Icon name="search" size={14} />
          </span>
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索模板…"
            style={{
              height: 32,
              width: 220,
              padding: '0 12px 0 32px',
              borderRadius: 6,
              border: '1px solid #D8DADD',
              fontSize: 13,
              outline: 'none',
              background: '#fff'
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 16
        }}
      >
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            style={{
              height: 28,
              padding: '0 14px',
              borderRadius: 999,
              border: cat === c ? '1px solid #7C5CFC' : '1px solid #E5E6EB',
              background: cat === c ? '#F1EDFF' : '#fff',
              color: cat === c ? '#7C5CFC' : '#51565D',
              fontSize: 12,
              fontWeight: cat === c ? 600 : 400,
              cursor: 'pointer'
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {error ? (
        <div
          style={{
            color: '#E64340',
            fontSize: 13,
            padding: 12,
            background: '#FDECEC',
            borderRadius: 6,
            marginBottom: 12
          }}
        >
          {error}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '80px 20px',
            background: '#fff',
            borderRadius: 10,
            border: '1px dashed #D8DADD'
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1F2329' }}>没有匹配的模板</div>
          <div style={{ fontSize: 12, color: '#8A8F99', marginTop: 6 }}>
            换个关键词，或清空筛选条件试试
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12
          }}
        >
          {filtered.map((t) => (
            <div
              key={t.id}
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
                    background: CATEGORY_COLOR[t.category] ?? '#EEF0F3',
                    color: CATEGORY_TEXT[t.category] ?? '#51565D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <Icon name={t.icon} size={18} strokeWidth={1.8} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#1F2329',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {t.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#8A8F99' }}>
                    {countTemplateSteps(t)} 步 · {t.category}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#51565D', lineHeight: 1.5, minHeight: 36 }}>
                {t.description}
              </div>
              <button
                type="button"
                disabled={busyId === t.id}
                onClick={() => void useTemplate(t)}
                style={{
                  height: 28,
                  borderRadius: 6,
                  border: 'none',
                  background: busyId === t.id ? '#B0B6BF' : '#E64340',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: busyId === t.id ? 'default' : 'pointer'
                }}
              >
                {busyId === t.id ? '正在创建…' : '使用模板'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
