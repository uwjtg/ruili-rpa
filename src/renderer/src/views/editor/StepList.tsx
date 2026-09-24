import { useRef, useState } from 'react'
import type { JSX } from 'react'
import type { StepNode } from '../../../../shared/ast'
import type { CmdMeta } from '../../../../shared/cmd-schema'

type RendererCmd = Omit<CmdMeta, 'summary'>

interface RowProps {
  step: StepNode
  depth: number
  index: number
  cmdMap: Map<string, RendererCmd>
  selectedId: string | null
  runningStepId: string | null
  doneStepIds: Set<string>
  dragOverId: string | null
  dragOverPos: 'before' | 'after' | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onToggleBreakpoint: (id: string) => void
  onToggleDisabled: (id: string) => void
  onDragStart: (id: string, e: React.DragEvent) => void
  onDragOver: (id: string, e: React.DragEvent) => void
  onDrop: (id: string, e: React.DragEvent) => void
  onDragEnd: () => void
}

/** 渲染步骤摘要：取第一个 text 参数的值作为副行 */
function summarize(step: StepNode, cmd: RendererCmd | undefined): string {
  if (!cmd) return step.cmdId
  const firstText = cmd.params.find((p) => p.type === 'text')
  if (firstText) {
    const v = step.params[firstText.key]
    if (v != null && String(v) !== '') {
      const s = String(v)
      return s.length > 40 ? s.slice(0, 40) + '…' : s
    }
  }
  return ''
}

function StepRow(props: RowProps): JSX.Element {
  const { step, depth, index, cmdMap, selectedId, runningStepId, doneStepIds, dragOverId, dragOverPos } = props
  const cmd = cmdMap.get(step.cmdId)
  const isSelected = selectedId === step.id
  const isRunning = runningStepId === step.id
  const isDone = doneStepIds.has(step.id)
  const summary = summarize(step, cmd)
  const isDragTarget = dragOverId === step.id

  return (
    <>
      {/* 落点指示线（before：行上方；after：行下方） */}
      {isDragTarget && dragOverPos === 'before' ? (
        <div style={{ height: 2, background: '#7C5CFC', marginLeft: depth * 24, borderRadius: 2 }} />
      ) : null}
      <div
        draggable
        onDragStart={(e) => props.onDragStart(step.id, e)}
        onDragOver={(e) => props.onDragOver(step.id, e)}
        onDrop={(e) => props.onDrop(step.id, e)}
        onDragEnd={props.onDragEnd}
        onClick={() => props.onSelect(step.id)}
        style={{
          marginLeft: depth * 24,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 10px',
          marginBottom: 4,
          borderRadius: 6,
          cursor: 'grab',
          background: isSelected ? '#F1EDFF' : isRunning ? '#F1EDFF' : '#fff',
          border: `1.5px solid ${isSelected || isRunning ? '#7C5CFC' : '#E5E6EB'}`,
          opacity: step.disabled ? 0.45 : 1,
          boxShadow: isRunning ? '0 0 0 3px rgba(124,92,252,0.18)' : undefined
        }}
      >
        {step.breakpoint ? (
          <span
            title="断点"
            style={{
              position: 'absolute',
              left: -6,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#E64340',
              border: '2px solid #fff'
            }}
          />
        ) : null}
        <span
          style={{
            width: 20,
            textAlign: 'right',
            fontSize: 11,
            color: isDone ? '#1DBF73' : '#8A8F99',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {index + 1}
        </span>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 5,
            background: '#F2F3F5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: '#51565D',
            flexShrink: 0
          }}
        >
          {cmd?.group?.slice(0, 1) ?? '?'}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#1F2329',
              textDecoration: step.disabled ? 'line-through' : 'none'
            }}
          >
            {cmd?.name ?? step.cmdId}
          </span>
          {summary ? (
            <span
              style={{
                display: 'block',
                fontSize: 11,
                color: '#8A8F99',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {summary}
            </span>
          ) : null}
        </span>
        {/* 悬停操作 */}
        <span style={{ display: 'flex', gap: 4, opacity: 0 }} className="step-actions">
          <button
            title="断点"
            onClick={(e) => {
              e.stopPropagation()
              props.onToggleBreakpoint(step.id)
            }}
            style={iconBtn}
          >
            ●
          </button>
          <button
            title="禁用/启用"
            onClick={(e) => {
              e.stopPropagation()
              props.onToggleDisabled(step.id)
            }}
            style={iconBtn}
          >
            ⊘
          </button>
          <button
            title="复制"
            onClick={(e) => {
              e.stopPropagation()
              props.onDuplicate(step.id)
            }}
            style={iconBtn}
          >
            ⧉
          </button>
          <button
            title="删除"
            onClick={(e) => {
              e.stopPropagation()
              props.onDelete(step.id)
            }}
            style={{ ...iconBtn, color: '#E64340' }}
          >
            ✕
          </button>
        </span>
      </div>
      {isDragTarget && dragOverPos === 'after' ? (
        <div style={{ height: 2, background: '#7C5CFC', marginLeft: depth * 24, borderRadius: 2 }} />
      ) : null}
      {/* 子步骤 */}
      {step.children?.length ? (
        <ChildrenList
          steps={step.children}
          depth={depth + 1}
          cmdMap={cmdMap}
          selectedId={selectedId}
          runningStepId={runningStepId}
          doneStepIds={doneStepIds}
          onSelect={props.onSelect}
          onDelete={props.onDelete}
          onDuplicate={props.onDuplicate}
          onToggleBreakpoint={props.onToggleBreakpoint}
          onToggleDisabled={props.onToggleDisabled}
          drag={{
            dragOverId,
            dragOverPos,
            onDragStart: props.onDragStart,
            onDragOver: props.onDragOver,
            onDrop: props.onDrop,
            onDragEnd: props.onDragEnd
          }}
        />
      ) : null}
    </>
  )
}

const iconBtn: React.CSSProperties = {
  width: 20,
  height: 20,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 12,
  color: '#8A8F99',
  padding: 0,
  flexShrink: 0
}

interface ListProps {
  steps: StepNode[]
  depth: number
  cmdMap: Map<string, RendererCmd>
  selectedId: string | null
  runningStepId: string | null
  doneStepIds: Set<string>
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onToggleBreakpoint: (id: string) => void
  onToggleDisabled: (id: string) => void
  onMove: (fromId: string, toId: string, position: 'before' | 'after') => void
}

interface DragState {
  dragOverId: string | null
  dragOverPos: 'before' | 'after' | null
  onDragStart: (id: string, e: React.DragEvent) => void
  onDragOver: (id: string, e: React.DragEvent) => void
  onDrop: (id: string, e: React.DragEvent) => void
  onDragEnd: () => void
}

function ChildrenList(
  props: Omit<ListProps, 'onMove'> & { drag: DragState }
): JSX.Element {
  return (
    <div
      style={{
        borderLeft: '2px solid #C9B8FF',
        marginLeft: props.depth * 24 + 12,
        paddingLeft: 8
      }}
    >
      {props.steps.map((s, i) => (
        <StepRow
          key={s.id}
          step={s}
          depth={0}
          index={i}
          cmdMap={props.cmdMap}
          selectedId={props.selectedId}
          runningStepId={props.runningStepId}
          doneStepIds={props.doneStepIds}
          dragOverId={props.drag.dragOverId}
          dragOverPos={props.drag.dragOverPos}
          onSelect={props.onSelect}
          onDelete={props.onDelete}
          onDuplicate={props.onDuplicate}
          onToggleBreakpoint={props.onToggleBreakpoint}
          onToggleDisabled={props.onToggleDisabled}
          onDragStart={props.drag.onDragStart}
          onDragOver={props.drag.onDragOver}
          onDrop={props.drag.onDrop}
          onDragEnd={props.drag.onDragEnd}
        />
      ))}
    </div>
  )
}

/** 顶层拖拽状态与事件处理（同父内重排） */
function useDragHandlers(onMove: ListProps['onMove']) {
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after' | null>(null)
  const dragFromRef = useRef<string | null>(null)

  return {
    dragOverId,
    dragOverPos,
    onDragStart: (id: string, e: React.DragEvent) => {
      dragFromRef.current = id
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    },
    onDragOver: (id: string, e: React.DragEvent) => {
      e.preventDefault()
      if (!dragFromRef.current || dragFromRef.current === id) return
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      setDragOverId(id)
      setDragOverPos(pos)
    },
    onDrop: (id: string, e: React.DragEvent) => {
      e.preventDefault()
      const from = dragFromRef.current
      const pos = dragOverPos
      setDragOverId(null)
      setDragOverPos(null)
      dragFromRef.current = null
      if (from && from !== id && pos) onMove(from, id, pos)
    },
    onDragEnd: () => {
      setDragOverId(null)
      setDragOverPos(null)
      dragFromRef.current = null
    }
  }
}

export default function StepList(props: ListProps): JSX.Element {
  const shared = useDragHandlers(props.onMove)
  if (props.steps.length === 0) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: 'center',
          color: '#B0B6BF',
          fontSize: 13
        }}
      >
        空流程——从左侧指令库点击添加第一条指令
      </div>
    )
  }
  return (
    <div style={{ padding: '12px 16px' }}>
      {props.steps.map((s, i) => (
        <StepRow
          key={s.id}
          step={s}
          depth={props.depth}
          index={i}
          cmdMap={props.cmdMap}
          selectedId={props.selectedId}
          runningStepId={props.runningStepId}
          doneStepIds={props.doneStepIds}
          dragOverId={shared.dragOverId}
          dragOverPos={shared.dragOverPos}
          onSelect={props.onSelect}
          onDelete={props.onDelete}
          onDuplicate={props.onDuplicate}
          onToggleBreakpoint={props.onToggleBreakpoint}
          onToggleDisabled={props.onToggleDisabled}
          onDragStart={shared.onDragStart}
          onDragOver={shared.onDragOver}
          onDrop={shared.onDrop}
          onDragEnd={shared.onDragEnd}
        />
      ))}
    </div>
  )
}
