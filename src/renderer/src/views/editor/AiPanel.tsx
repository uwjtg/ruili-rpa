import { useState } from 'react'
import type { JSX } from 'react'
import type { FlowDoc } from '../../../../shared/ast'

interface AiPanelProps {
  /** 生成成功后回调：把 AI 返回的 FlowDoc 打开为新标签 */
  onAccept: (flow: FlowDoc) => void
}

interface ChatMsg {
  role: 'user' | 'ai'
  text: string
}

/**
 * AI 助手面板（M2 切片 4）：输入自然语言目标 → 调 llm:generate-flow →
 * 生成 FlowDoc 并以新标签打开。function-calling 协议已在阶段 4 打通，这里只接 UI。
 */
export default function AiPanel({ onAccept }: AiPanelProps): JSX.Element {
  const ruili = window.ruili
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { role: 'ai', text: '你好，我是锐流 AI。用一句话描述你想自动化的流程，我会帮你生成步骤。' }
  ])

  async function send(): Promise<void> {
    const text = prompt.trim()
    if (!text || !ruili?.llm) return
    setMsgs((m) => [...m, { role: 'user', text }])
    setPrompt('')
    setBusy(true)
    const res = await ruili.llm.generateFlow(text)
    setBusy(false)
    if (!res.ok || !res.flow) {
      setMsgs((m) => [...m, { role: 'ai', text: `生成失败：${res.error ?? '未知错误'}` }])
      return
    }
    setMsgs((m) => [
      ...m,
      { role: 'ai', text: `已生成「${res.flow!.name}」（${res.flow!.steps.length} 步），已在新标签打开，可继续编辑。` }
    ])
    onAccept(res.flow)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
        {msgs.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: 8,
              padding: '8px 10px',
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              maxWidth: '90%',
              marginLeft: m.role === 'user' ? 'auto' : 0,
              background: m.role === 'user' ? 'linear-gradient(135deg,#7C5CFC,#A855F7)' : '#F2F3F5',
              color: m.role === 'user' ? '#fff' : '#1F2329'
            }}
          >
            {m.text}
          </div>
        ))}
        {busy ? <div style={{ fontSize: 12, color: '#8A8F99', padding: 4 }}>AI 生成中…</div> : null}
      </div>
      <div style={{ borderTop: '1px solid #E5E6EB', padding: 8, display: 'flex', gap: 6 }}>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send()
          }}
          placeholder="例：打开百度搜索『天气预报』并提取第一条结果"
          style={{
            flex: 1,
            height: 30,
            border: '1px solid #D8DADD',
            borderRadius: 6,
            padding: '0 8px',
            fontSize: 12,
            outline: 'none'
          }}
        />
        <button
          onClick={() => void send()}
          disabled={busy || !prompt.trim()}
          style={{
            height: 30,
            padding: '0 12px',
            border: 'none',
            borderRadius: 6,
            background: busy ? '#B0B6BF' : '#7C5CFC',
            color: '#fff',
            fontSize: 12,
            cursor: 'pointer'
          }}
        >
          发送
        </button>
      </div>
    </div>
  )
}
