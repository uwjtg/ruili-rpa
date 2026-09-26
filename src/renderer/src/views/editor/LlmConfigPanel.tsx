/**
 * LLM 配置面板（M5-11）：右侧「设置」页签下半部分。
 *
 * 编辑 Provider 的 baseURL / model / apiKey；apiKey 经主进程 safeStorage(DPAPI)
 * 加密落 SQLite，UI 只知道「是否已设置」，回显为密码框占位。
 * 保存后主进程热重载 LlmClient；「测试」发一条 ping 验证连通。
 */
import { useEffect, useState } from 'react'
import type { JSX } from 'react'

interface ProviderDraft {
  name: string
  baseURL: string
  model: string
  /** 用户本次输入的新 apiKey；空串=保留已存值 */
  apiKey: string
  /** 后端是否已有已存 apiKey（占位用） */
  hasApiKey: boolean
}

interface ConfigResp {
  active: string
  providers: Array<{ name: string; baseURL: string; model: string; hasApiKey: boolean }>
}

/** M5-14：厂商预设，选中后一键填到当前激活 Provider */
const PRESETS: Array<{ label: string; baseURL: string; model: string }> = [
  { label: '硅基流动（免费模型多）', baseURL: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
  { label: '智谱 GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { label: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'Kimi (Moonshot)', baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: '通义 Qwen', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: 'Ollama 本地', baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen2.5' }
]

const INPUT: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  border: '1px solid #D8DADD',
  borderRadius: 6,
  fontSize: 12,
  outline: 'none'
}

export default function LlmConfigPanel(): JSX.Element {
  const ruili = window.ruili
  const [providers, setProviders] = useState<ProviderDraft[] | null>(null)
  const [active, setActive] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  useEffect(() => {
    if (!ruili?.llm?.getConfig) return
    void ruili.llm.getConfig().then((c: ConfigResp) => {
      setActive(c.active)
      setProviders(
        c.providers.map((p) => ({ ...p, apiKey: '' }))
      )
    })
  }, [ruili])

  function patchProvider(name: string, patch: Partial<ProviderDraft>): void {
    setProviders((list) =>
      list ? list.map((p) => (p.name === name ? { ...p, ...patch } : p)) : list
    )
  }

  async function onSave(): Promise<void> {
    if (!ruili?.llm?.saveConfig || !providers) return
    setBusy(true)
    setMsg('')
    const r = await ruili.llm.saveConfig({
      active,
      providers: providers.map((p) => ({
        name: p.name,
        baseURL: p.baseURL.trim(),
        model: p.model.trim(),
        apiKey: p.apiKey
      }))
    })
    setBusy(false)
    if (r.ok) {
      setMsg(`✓ 已保存并切换到「${r.active ?? active}」`)
      // 保存后清空 apiKey 输入框（保留占位态）
      setProviders((list) => (list ? list.map((p) => ({ ...p, apiKey: '' })) : list))
    } else {
      setMsg(`⚠ 保存失败：${r.error ?? '未知错误'}`)
    }
  }

  async function onTest(): Promise<void> {
    if (!ruili?.llm?.test) return
    setBusy(true)
    setTestMsg('')
    const r = await ruili.llm.test()
    setBusy(false)
    if (r.ok) setTestMsg(`✓ 连通成功（模型 ${r.model}）`)
    else setTestMsg(`⚠ ${r.error ?? '连接失败'}`)
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #E5E6EB' }}>
      <div style={{ fontSize: 12, color: '#51565D', marginBottom: 4 }}>
        AI 魔法指令（LLM）
      </div>
      <div style={{ fontSize: 11, color: '#8A8F99', marginBottom: 12 }}>
        配置生成流程用的大模型。apiKey 仅本机加密存储，不上传。留空 apiKey 表示不修改已存值。
      </div>

      {!providers ? (
        <div style={{ fontSize: 12, color: '#8A8F99' }}>正在读取配置…</div>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: '#8A8F99', display: 'block', marginBottom: 2 }}>
              快速选择厂商（填充到当前激活 Provider）
            </label>
            <select
              value=""
              onChange={(e) => {
                const pre = PRESETS.find((x) => x.label === e.target.value)
                if (!pre) return
                setProviders((list) =>
                  list
                    ? list.map((p) =>
                        p.name === active ? { ...p, baseURL: pre.baseURL, model: pre.model } : p
                      )
                    : list
                )
              }}
              style={{ width: '100%', height: 30, borderRadius: 6, border: '1px solid #D8DADD', background: '#fff', color: '#1F2329', fontSize: 12 }}
            >
              <option value="">— 选择厂商预设 —</option>
              {PRESETS.map((pre) => (
                <option key={pre.label} value={pre.label}>{pre.label}</option>
              ))}
            </select>
          </div>
          {providers.map((p) => (
            <div
              key={p.name}
              style={{
                marginBottom: 10,
                padding: 10,
                border: active === p.name ? '1px solid #7C5CFC' : '1px solid #E5E6EB',
                borderRadius: 8,
                background: active === p.name ? '#F5F2FF' : '#fff'
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#1F2329', marginBottom: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="llm-active"
                  checked={active === p.name}
                  onChange={() => setActive(p.name)}
                />
                {p.name}
              </label>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: '#8A8F99', marginBottom: 2 }}>Base URL</div>
                <input
                  value={p.baseURL}
                  onChange={(e) => patchProvider(p.name, { baseURL: e.target.value })}
                  style={INPUT}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: '#8A8F99', marginBottom: 2 }}>模型</div>
                <input
                  value={p.model}
                  onChange={(e) => patchProvider(p.name, { model: e.target.value })}
                  style={INPUT}
                  placeholder="gpt-4o-mini"
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#8A8F99', marginBottom: 2 }}>API Key</div>
                <input
                  type="password"
                  value={p.apiKey}
                  onChange={(e) => patchProvider(p.name, { apiKey: e.target.value })}
                  style={INPUT}
                  placeholder={p.hasApiKey ? '已设置（输入新值覆盖）' : '未设置'}
                  autoComplete="off"
                />
              </div>
            </div>
          ))}

          {msg ? <div style={{ fontSize: 12, marginBottom: 8, color: msg.startsWith('⚠') ? '#E64340' : '#1DBF73' }}>{msg}</div> : null}
          {testMsg ? <div style={{ fontSize: 12, marginBottom: 8, color: testMsg.startsWith('⚠') ? '#E64340' : '#1DBF73' }}>{testMsg}</div> : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => void onSave()}
              disabled={busy}
              style={{ height: 28, padding: '0 14px', border: 'none', borderRadius: 6, background: '#7C5CFC', color: '#fff', fontSize: 12, cursor: 'pointer' }}
            >
              {busy ? '处理中…' : '保存配置'}
            </button>
            <button
              onClick={() => void onTest()}
              disabled={busy}
              style={{ height: 28, padding: '0 14px', border: '1px solid #D8DADD', borderRadius: 6, background: '#fff', color: '#1F2329', fontSize: 12, cursor: 'pointer' }}
            >
              测试连接
            </button>
          </div>
        </>
      )}
    </div>
  )
}
