/**
 * 录制聚合阈值设置面板（M3 切片 12）。
 *
 * 右侧「设置」页签内容：编辑点击防抖 / 输入分段 / 滚动聚合四个阈值并落盘；
 * 之后每次点「录制」自动带上（主进程 RecordController 从 DB 读取合并），
 * 免去每次手工传参。非法输入（空/非数字/负数/小数）阻止保存并提示。
 */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import {
  RECORD_THRESHOLD_DEFAULTS,
  RECORD_THRESHOLD_KEYS,
  sanitizeRecordThresholds
} from '../../../../shared/record-settings'
import type { RecordThresholds } from '../../../../shared/record-settings'

interface FieldMeta {
  label: string
  unit: string
  hint: string
}

const FIELD_META: Record<keyof RecordThresholds, FieldMeta> = {
  clickDebounceMs: { label: '点击防抖时间', unit: 'ms', hint: '间隔内的同位置点击合并为一次' },
  clickDebouncePx: { label: '点击防抖距离', unit: 'px', hint: '两次点击坐标差小于该值视为同位置' },
  typingGapMs: { label: '输入分段间隔', unit: 'ms', hint: '输入停顿超过该时长视为新输入段' },
  scrollGapMs: { label: '滚动聚合间隔', unit: 'ms', hint: '间隔内的同位置滚动量累加' }
}

type Draft = Record<keyof RecordThresholds, string>

function toDraft(t: RecordThresholds): Draft {
  const out = {} as Draft
  for (const k of RECORD_THRESHOLD_KEYS) out[k] = String(t[k])
  return out
}

export default function ThresholdPanel({
  onNotify
}: {
  onNotify?: (msg: string) => void
}): JSX.Element {
  const ruili = window.ruili
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')

  // 挂载时从 DB 读取当前持久化阈值（缺省回退默认值）
  useEffect(() => {
    if (!ruili?.settings) return
    void ruili.settings.getRecordThresholds().then((t) => {
      setDraft(toDraft(t))
    })
  }, [ruili])

  async function persist(values: RecordThresholds): Promise<void> {
    setSaving(true)
    try {
      const r = await ruili?.settings?.setRecordThresholds(values)
      if (r?.ok) {
        setStatus('saved')
        setError('')
        onNotify?.('已保存录制聚合阈值，下次录制自动生效')
      } else {
        setStatus('error')
        setError(r?.error ?? '保存失败')
      }
    } finally {
      setSaving(false)
    }
  }

  /** 校验并保存：四项都必须是 ≥0 的整数 */
  async function onSave(): Promise<void> {
    if (!draft) return
    const values: Record<string, unknown> = {}
    for (const k of RECORD_THRESHOLD_KEYS) {
      const raw = draft[k].trim()
      if (raw === '') {
        setStatus('error')
        setError(`${FIELD_META[k].label}不能为空`)
        return
      }
      const num = Number(raw)
      if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
        setStatus('error')
        setError(`${FIELD_META[k].label}必须是 ≥0 的整数`)
        return
      }
      values[k] = num
    }
    // 与主进程同源的净化（防越界键），再落盘
    const clean = sanitizeRecordThresholds(values)
    await persist({ ...RECORD_THRESHOLD_DEFAULTS, ...clean })
  }

  /** 恢复默认：写回默认值并立即保存 */
  async function onReset(): Promise<void> {
    setDraft(toDraft(RECORD_THRESHOLD_DEFAULTS))
    await persist(RECORD_THRESHOLD_DEFAULTS)
  }

  if (!draft) {
    return <div style={{ padding: 12, color: '#8A8F99', fontSize: 12 }}>正在读取设置…</div>
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 12, color: '#51565D', marginBottom: 4 }}>
        录制聚合阈值
      </div>
      <div style={{ fontSize: 11, color: '#8A8F99', marginBottom: 12 }}>
        点「录制」时自动使用以下阈值，无需每次设置；非法输入不会保存。
      </div>

      {RECORD_THRESHOLD_KEYS.map((k) => {
        const meta = FIELD_META[k]
        return (
          <div key={k} style={{ marginBottom: 10 }}>
            <label
              htmlFor={`thr-${k}`}
              style={{ display: 'block', fontSize: 12, color: '#1F2329', marginBottom: 2 }}
            >
              {meta.label}
              <span style={{ color: '#B0B6BF' }}>（{meta.unit}）</span>
            </label>
            <input
              id={`thr-${k}`}
              value={draft[k]}
              onChange={(e) => {
                setDraft({ ...draft, [k]: e.target.value })
                setStatus('idle')
              }}
              inputMode="numeric"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '6px 8px',
                border: status === 'error' ? '1px solid #E64340' : '1px solid #D8DADD',
                borderRadius: 6,
                fontSize: 13,
                outline: 'none'
              }}
            />
            <div style={{ fontSize: 11, color: '#8A8F99', marginTop: 2 }}>{meta.hint}</div>
          </div>
        )
      })}

      {status === 'error' ? (
        <div style={{ fontSize: 12, color: '#E64340', marginBottom: 8 }}>⚠ {error}</div>
      ) : status === 'saved' ? (
        <div style={{ fontSize: 12, color: '#1DBF73', marginBottom: 8 }}>✓ 已保存</div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button
          onClick={() => void onSave()}
          disabled={saving}
          style={{
            height: 28,
            padding: '0 14px',
            border: 'none',
            borderRadius: 6,
            background: '#7C5CFC',
            color: '#fff',
            fontSize: 12,
            cursor: 'pointer'
          }}
        >
          {saving ? '保存中…' : '保存设置'}
        </button>
        <button
          onClick={() => void onReset()}
          disabled={saving}
          style={{
            height: 28,
            padding: '0 14px',
            border: '1px solid #D8DADD',
            borderRadius: 6,
            background: '#fff',
            color: '#1F2329',
            fontSize: 12,
            cursor: 'pointer'
          }}
        >
          恢复默认
        </button>
      </div>
    </div>
  )
}
