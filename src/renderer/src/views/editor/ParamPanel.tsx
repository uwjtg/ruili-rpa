import type { JSX } from 'react'
import type { StepNode } from '../../../../shared/ast'
import type { CmdMeta, ParamField } from '../../../../shared/cmd-schema'

type RendererCmd = Omit<CmdMeta, 'summary'>

interface Props {
  step: StepNode | null
  cmd: RendererCmd | undefined
  onChangeParam: (stepId: string, key: string, value: unknown) => void
  onDelete: (stepId: string) => void
}

function Field({
  field,
  value,
  onChange
}: {
  field: ParamField
  value: unknown
  onChange: (v: unknown) => void
}): JSX.Element {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 28,
    boxSizing: 'border-box',
    border: '1px solid #D8DADD',
    borderRadius: 6,
    padding: '0 8px',
    fontSize: 12,
    outline: 'none'
  }
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#51565D', marginBottom: 4 }}>
        {field.label}
      </div>
      {field.type === 'select' ? (
        <select
          value={String(value ?? field.default ?? '')}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === 'number' ? (
        <input
          type="number"
          value={value === undefined || value === null ? '' : Number(value)}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          style={inputStyle}
        />
      ) : (
        <input
          type="text"
          value={String(value ?? '')}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
    </label>
  )
}

export default function ParamPanel({ step, cmd, onChangeParam, onDelete }: Props): JSX.Element {
  if (!step) {
    return (
      <div style={{ padding: 20, color: '#B0B6BF', fontSize: 12 }}>
        选中一个步骤后在这里编辑参数
      </div>
    )
  }
  return (
    <div style={{ padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        {cmd?.name ?? step.cmdId}
      </div>
      <div style={{ fontSize: 11, color: '#8A8F99', marginBottom: 12 }}>
        {step.id} · {cmd?.group}
      </div>
      {cmd?.params.length === 0 ? (
        <div style={{ color: '#B0B6BF', fontSize: 12 }}>此指令无参数</div>
      ) : (
        cmd?.params.map((f) => (
          <Field
            key={f.key}
            field={f}
            value={step.params[f.key]}
            onChange={(v) => onChangeParam(step.id, f.key, v)}
          />
        ))
      )}
      <button
        onClick={() => onDelete(step.id)}
        style={{
          marginTop: 16,
          width: '100%',
          height: 30,
          background: '#FDECEC',
          color: '#E64340',
          border: '1px solid #E64340',
          borderRadius: 6,
          fontSize: 12,
          cursor: 'pointer'
        }}
      >
        删除此步骤
      </button>
    </div>
  )
}
