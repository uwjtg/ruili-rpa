/**
 * 首次运行引导（M6-2 简化版）：首次打开时弹欢迎卡片。
 *
 * localStorage 'ruili-onboarded' 标记是否已看过；点「开始使用」后写入并关闭。
 * 不做复杂多步向导——自用模式下一句话说明 + 三个快捷入口即可。
 */
import { useState } from 'react'
import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'

const STORAGE_KEY = 'ruili-onboarded'

const OVERLAY: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(31,35,41,.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999
}

const CARD: React.CSSProperties = {
  width: 480,
  maxWidth: '90vw',
  background: '#fff',
  borderRadius: 12,
  padding: 28,
  boxShadow: '0 8px 32px rgba(31,35,41,.18)'
}

const ITEM: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  marginBottom: 12,
  fontSize: 13,
  color: '#51565D',
  lineHeight: 1.5
}

const DOT: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: '#7C5CFC',
  marginTop: 6,
  flexShrink: 0
}

export default function WelcomeModal(): JSX.Element | null {
  const [show, setShow] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(STORAGE_KEY)
    } catch {
      return false
    }
  })
  const navigate = useNavigate()

  if (!show) return null

  function close(): void {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* 隐私模式下忽略 */
    }
    setShow(false)
  }

  return (
    <div style={OVERLAY} onClick={close}>
      <div style={CARD} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1F2329', marginBottom: 6 }}>
          欢迎使用锐流RPA
        </div>
        <div style={{ fontSize: 13, color: '#8A8F99', marginBottom: 18 }}>
          拖指令编排自动化流程，支持网页操作、桌面软件、Excel、OCR。
        </div>

        <div style={ITEM}><span style={DOT} />从市场模板选一个起点，或在编辑器里自己搭</div>
        <div style={ITEM}><span style={DOT} />触发器·计划任务页可设定时/热键自动跑</div>
        <div style={ITEM}><span style={DOT} />AI 魔法指令（编辑器工具栏）可自然语言生成流程，需在设置里配 LLM</div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            onClick={() => { close(); navigate('/market') }}
            style={{
              height: 32, padding: '0 14px', border: '1px solid #D8DADD',
              borderRadius: 6, background: '#fff', color: '#1F2329', fontSize: 13, cursor: 'pointer'
            }}
          >
            浏览模板
          </button>
          <button
            onClick={close}
            style={{
              height: 32, padding: '0 20px', border: 'none', borderRadius: 6,
              background: '#7C5CFC', color: '#fff', fontSize: 13, cursor: 'pointer', marginLeft: 'auto'
            }}
          >
            开始使用
          </button>
        </div>
      </div>
    </div>
  )
}
