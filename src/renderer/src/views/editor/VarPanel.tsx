import type { JSX } from 'react'
import type { FlowVar, VarType } from '../../../../shared/ast'

interface Props {
  vars: FlowVar[]
  onChange: (vars: FlowVar[]) => void
}

const VAR_TYPES: VarType[] = ['string', 'number', 'boolean', 'list', 'dict']

export default function VarPanel({ vars, onChange }: Props): JSX.Element {
  const update = (idx: number, patch: Partial<FlowVar>) => {
    const next = vars.map((v, i) => (i === idx ? { ...v, ...patch } : v))
    onChange(next)
  }
  const remove = (idx: number) => {
    onChange(vars.filter((_, i) => i !== idx))
  }
  const add = () => {
    onChange([...vars, { name: `var${vars.length + 1}`, type: 'string', value: '' }])
  }

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>流程变量</span>
        <button
          onClick={add}
          style={{
            height: 24,
            padding: '0 10px',
            background: '#F1EDFF',
            color: '#7C5CFC',
            border: 'none',
            borderRadius: 4,
            fontSize: 12,
            cursor: 'pointer'
          }}
        >
          + 新增
        </button>
      </div>
      {vars.length === 0 ? (
        <div style={{ color: '#B0B6BF', fontSize: 12 }}>暂无变量</div>
      ) : (
        vars.map((v, i) => (
          <div
            key={i}
            style={{
              marginBottom: 8,
              padding: 8,
              border: '1px solid #E5E6EB',
              borderRadius: 6,
              background: '#FAFBFC'
            }}
          >
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input
                value={v.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="变量名"
                style={miniInput}
              />
              <select
                value={v.type}
                onChange={(e) => update(i, { type: e.target.value as VarType })}
                style={{ ...miniInput, width: 70 }}
              >
                {VAR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                onClick={() => remove(i)}
                style={{
                  width: 24,
                  height: 24,
                  border: 'none',
                  background: 'transparent',
                  color: '#E64340',
                  cursor: 'pointer',
                  padding: 0
                }}
                title="删除"
              >
                ✕
              </button>
            </div>
            <input
              value={String(v.value ?? '')}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder="初始值"
              style={miniInput}
            />
            <input
              value={v.description ?? ''}
              onChange={(e) => update(i, { description: e.target.value })}
              placeholder="说明（可选，显示在运行前填写框）"
              style={miniInput}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#51565D', marginTop: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={v.required === true}
                onChange={(e) => update(i, { required: e.target.checked })}
              />
              运行前必填
            </label>
          </div>
        ))
      )}
    </div>
  )
}

const miniInput: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 24,
  boxSizing: 'border-box',
  border: '1px solid #D8DADD',
  borderRadius: 4,
  padding: '0 6px',
  fontSize: 12,
  outline: 'none'
}
