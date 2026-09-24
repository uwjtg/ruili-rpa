import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { CmdMeta } from '../../../../shared/cmd-schema'

type RendererCmd = Omit<CmdMeta, 'summary'>

interface Props {
  commands: RendererCmd[]
  onAdd: (cmdId: string) => void
  disabled?: boolean
}

/** 左侧指令库：按分组折叠、可搜索、点击插入到选中步骤之后 */
export default function CmdLibrary({ commands, onAdd, disabled }: Props): JSX.Element {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? commands.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.id.toLowerCase().includes(q) ||
            c.group.toLowerCase().includes(q)
        )
      : commands
    const map = new Map<string, RendererCmd[]>()
    for (const c of filtered) {
      const arr = map.get(c.group) ?? []
      arr.push(c)
      map.set(c.group, arr)
    }
    return [...map.entries()]
  }, [commands, query])

  return (
    <div
      style={{
        width: 220,
        borderRight: '1px solid #E5E6EB',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0
      }}
    >
      <div style={{ padding: 10, borderBottom: '1px solid #E5E6EB' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索指令…"
          style={{
            width: '100%',
            height: 28,
            boxSizing: 'border-box',
            border: '1px solid #D8DADD',
            borderRadius: 6,
            padding: '0 8px',
            fontSize: 12,
            outline: 'none'
          }}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
        {groups.length === 0 ? (
          <div style={{ padding: 12, color: '#B0B6BF', fontSize: 12 }}>无匹配指令</div>
        ) : (
          groups.map(([group, cmds]) => (
            <div key={group} style={{ marginBottom: 4 }}>
              <div
                style={{
                  padding: '4px 12px',
                  fontSize: 11,
                  color: '#8A8F99',
                  fontWeight: 600
                }}
              >
                {group}
              </div>
              {cmds.map((c) => (
                <button
                  key={c.id}
                  disabled={disabled}
                  onClick={() => onAdd(c.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 12px 6px 20px',
                    background: 'transparent',
                    border: 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: 12.5,
                    color: '#1F2329'
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.background = '#F7F8FA'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
