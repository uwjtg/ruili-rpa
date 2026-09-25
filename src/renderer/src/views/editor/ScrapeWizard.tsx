/**
 * 数据抓取向导 V1（M4 切片 1）。
 *
 * 三步：
 *  1. 填目标网址 + 示例项选择器 → 「识别相似项」（主进程在已开页面跑兄弟聚类）；
 *  2. 预览识别到的列，勾选/命名要抓的字段（文本 / 链接 / 图片）；
 *  3. 填结果变量名 + 可选 CSV 导出路径 → 「生成并插入流程」。
 *
 * 不做：浏览器内点选高亮拾取（CDP 拾取器属浏览器录制器备选大项）；
 *       示例选择器由用户填写或从开发者工具复制。
 */
import { useState } from 'react'
import type { ScrapeCandidate, ScrapeInspectResult, ScrapeWizardSpec } from '../../../../shared/scrape/spec'

interface FieldRow {
  candidate: ScrapeCandidate
  selected: boolean
  name: string
  attr: string // '' = 文本；否则取该属性
}

interface Props {
  onClose: () => void
  onGenerate: (spec: ScrapeWizardSpec) => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  border: '1px solid #D8DADD',
  borderRadius: 6,
  fontSize: 13
}

const btn: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
  border: '1px solid #D8DADD',
  background: '#fff'
}

export default function ScrapeWizard({ onClose, onGenerate }: Props) {
  const [url, setUrl] = useState('')
  const [sampleSel, setSampleSel] = useState('')
  const [inspecting, setInspecting] = useState(false)
  const [inspectErr, setInspectErr] = useState('')
  const [picking, setPicking] = useState(false)
  const [pickMsg, setPickMsg] = useState('')
  const [result, setResult] = useState<ScrapeInspectResult | null>(null)
  const [rows, setRows] = useState<FieldRow[]>([])
  const [resultVar, setResultVar] = useState('rows')
  const [csvPath, setCsvPath] = useState('')
  const [xlsxPath, setXlsxPath] = useState('')
  const [maxItems, setMaxItems] = useState(0)
  const [nextSel, setNextSel] = useState('')
  const [maxPages, setMaxPages] = useState(1)

  async function onInspect(): Promise<void> {
    setInspectErr('')
    if (!window.ruili?.scrape) return
    if (!sampleSel.trim()) {
      setInspectErr('请填写示例项选择器（如 .product-card）')
      return
    }
    setInspecting(true)
    try {
      const r = await window.ruili.scrape.inspect(sampleSel.trim())
      if (!r.ok) {
        setResult(null)
        setRows([])
        setInspectErr(r.error ?? '识别失败')
        return
      }
      setResult(r)
      // 默认全选文本字段；有 href/src 的默认选对应属性
      const defaults = (r.candidates ?? []).map((c, i) => {
        const attr = c.href ? 'href' : c.src ? 'src' : ''
        const tagHint =
          attr === 'href' ? '链接' : attr === 'src' ? '图片' : c.tag
        return {
          candidate: c,
          selected: true,
          name: `字段${i + 1}_${tagHint}`,
          attr
        }
      })
      setRows(defaults)
    } finally {
      setInspecting(false)
    }
  }

  async function onPick(): Promise<void> {
    if (!window.ruili?.webPick) return
    setPickMsg('')
    setPicking(true)
    try {
      const r = await window.ruili.webPick.start(120000)
      if (!r.ok) { setPickMsg(r.error ?? '点选失败'); return }
      if (r.cancelled) { setPickMsg('已取消'); return }
      setSampleSel(r.selector ?? '')
      setPickMsg('已选中：' + (r.text ?? '').slice(0, 30))
    } finally {
      setPicking(false)
    }
  }

  function onCommit(): void {
    const selected = rows.filter((r) => r.selected && r.name.trim())
    if (!result?.listSelector) {
      setInspectErr('请先识别相似项')
      return
    }
    if (selected.length === 0) {
      setInspectErr('请至少勾选一个字段')
      return
    }
    onGenerate({
      url: url.trim(),
      listSelector: result.listSelector,
      fields: selected.map((r) => ({
        name: r.name.trim(),
        subSelector: r.candidate.selector,
        attr: r.attr || undefined
      })),
      resultVar: (resultVar.trim() || 'rows').replace(/\s+/g, ''),
      csvPath: csvPath.trim(),
      xlsxPath: xlsxPath.trim(),
      maxItems: Number(maxItems) || 0,
      nextSelector: nextSel.trim(),
      maxPages: Number(maxPages) || 1
    })
  }

  const sel = rows.filter((r) => r.selected).length

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 10,
          padding: 20,
          width: 560,
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 30px rgba(0,0,0,0.2)'
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>数据抓取向导</div>

        {/* 第 1 步 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#51565D', marginBottom: 4 }}>目标网址</div>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://示例站/列表页"
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#51565D', marginBottom: 4 }}>
            示例项选择器（页面里一个列表项的 CSS 选择器，如 .product-card）
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={sampleSel}
              onChange={(e) => setSampleSel(e.target.value)}
              placeholder=".product-card:nth-child(2)"
              style={{ ...inputStyle, flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onInspect()
              }}
            />
            <button
              onClick={() => void onPick()}
              disabled={picking || inspecting}
              style={{ ...btn, background: '#fff', color: '#7C5CFC', border: '1px solid #7C5CFC' }}
            >
              {picking ? '点选中…' : '在页面中点选'}
            </button>
            <button
              onClick={() => void onInspect()}
              disabled={inspecting || picking}
              style={{ ...btn, background: '#7C5CFC', color: '#fff', border: 'none' }}
            >
              {inspecting ? '识别中…' : '识别相似项'}
            </button>
          </div>
          {pickMsg ? <div style={{ fontSize: 11, color: '#51565D', marginTop: 4 }}>{pickMsg}</div> : null}
          <div style={{ fontSize: 11, color: '#8A8F99', marginTop: 4 }}>
            前提：已用「打开浏览器/打开网址」运行到目标列表页（向导会在当前页面里找相似列表项）。
          </div>
        </div>

        {inspectErr ? (
          <div style={{ fontSize: 12, color: '#E64340', marginBottom: 8 }}>⚠ {inspectErr}</div>
        ) : null}

        {/* 识别结果 */}
        {result ? (
          <div
            style={{
              background: '#F1EDFF',
              borderRadius: 8,
              padding: 10,
              marginBottom: 12,
              fontSize: 12
            }}
          >
            <div style={{ fontWeight: 600, color: '#7C5CFC' }}>
              已识别 {result.itemCount} 个相似项 · 列表选择器 <code>{result.listSelector}</code>
            </div>
            {(result.samples ?? []).map((s, i) => (
              <div key={i} style={{ color: '#51565D', marginTop: 2 }}>
                项{i + 1}：{s || '（空）'}
              </div>
            ))}
          </div>
        ) : null}

        {/* 字段标注 */}
        {rows.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#51565D', marginBottom: 6 }}>
              勾选要抓取的字段并命名（已选 {sel} 个）
            </div>
            {rows.map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  border: '1px solid #E5E6EB',
                  borderRadius: 6,
                  marginBottom: 6
                }}
              >
                <input
                  type="checkbox"
                  checked={r.selected}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))
                  }
                />
                <input
                  value={r.name}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                  style={{ ...inputStyle, width: 120 }}
                />
                <select
                  value={r.attr}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, attr: e.target.value } : x)))
                  }
                  style={{ ...inputStyle, width: 90 }}
                >
                  <option value="">文本</option>
                  <option value="href">链接 href</option>
                  <option value="src">图片 src</option>
                  <option value="title">title</option>
                  <option value="alt">alt</option>
                </select>
                <span style={{ flex: 1, fontSize: 11, color: '#8A8F99', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.candidate.tag} · {r.candidate.sampleText || r.candidate.href || r.candidate.src}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {/* 第 3 步：输出 */}
        {result ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#51565D', marginBottom: 4 }}>结果变量</div>
              <input value={resultVar} onChange={(e) => setResultVar(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#51565D', marginBottom: 4 }}>最多抓取（0=不限）</div>
              <input
                type="number"
                value={maxItems}
                onChange={(e) => setMaxItems(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </div>
          </div>
        ) : null}
        {result ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#51565D', marginBottom: 4 }}>
              导出 CSV 路径（可选，留空不导出）
            </div>
            <input
              value={csvPath}
              onChange={(e) => setCsvPath(e.target.value)}
              placeholder="D:\output\items.csv，支持 ${变量}"
              style={inputStyle}
            />
          </div>
        ) : null}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: '#51565D', marginBottom: 4 }}>
              导出 XLSX 路径（可选，留空不导出）
            </div>
            <input
              value={xlsxPath}
              onChange={(e) => setXlsxPath(e.target.value)}
              placeholder="D:\output\items.xlsx"
              style={inputStyle}
            />
          </div>
        {result ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 12, color: '#51565D', marginBottom: 4 }}>下一页按钮选择器（可选，如 .next / a[rel=next]）</div>
              <input
                value={nextSel}
                onChange={(e) => setNextSel(e.target.value)}
                placeholder=".next"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#51565D', marginBottom: 4 }}>最多翻几页（含当前）</div>
              <input
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value) || 1)}
                style={inputStyle}
              />
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={btn}>
            取消
          </button>
          <button
            onClick={onCommit}
            disabled={!result || sel === 0}
            style={{
              ...btn,
              background: !result || sel === 0 ? '#B0B6BF' : '#1DBF73',
              color: '#fff',
              border: 'none'
            }}
          >
            生成并插入流程
          </button>
        </div>
      </div>
    </div>
  )
}
