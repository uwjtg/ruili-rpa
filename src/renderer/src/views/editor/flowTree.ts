/**
 * M2 编辑器内核工具：对 FlowDoc.steps 树做不可变更新。
 *
 * 所有函数返回新数组（不修改入参），便于撤销/重做快照。
 */
import type { FlowDoc, StepNode } from '../../../../shared/ast'

let uidCounter = 1
/** 生成步骤 id（s1 / s2 / …；嵌套用 s2-1） */
export function nextStepId(existing: StepNode[]): string {
  // 简单递增，不做层级推导；UI 只要求唯一
  let max = 0
  const walk = (steps: StepNode[]) => {
    for (const s of steps) {
      const n = Number(s.id.replace(/[^0-9]/g, ''))
      if (!Number.isNaN(n)) max = Math.max(max, n)
      if (s.children) walk(s.children)
    }
  }
  walk(existing)
  return `s${Math.max(max + 1, uidCounter++)}`
}

/** 在树中按 id 找步骤，返回其路径与所在数组 */
export function findStepPath(
  steps: StepNode[],
  id: string,
  trail: StepNode[] = []
): { step: StepNode; parent: StepNode[]; index: number } | null {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (s.id === id) return { step: s, parent: steps, index: i }
    if (s.children) {
      const hit = findStepPath(s.children, id, [...trail, s])
      if (hit) return hit
    }
  }
  return null
}

/** 不可变地替换某个步骤的部分字段 */
export function patchStep(
  steps: StepNode[],
  id: string,
  patch: Partial<StepNode>
): StepNode[] {
  return steps.map((s) => {
    if (s.id === id) return { ...s, ...patch }
    if (s.children) return { ...s, children: patchStep(s.children, id, patch) }
    return s
  })
}

/** 在 afterId 之后插入新步骤（同级）；afterId 为空或不存在则插到末尾 */
export function insertAfter(
  steps: StepNode[],
  afterId: string | null,
  newStep: StepNode
): StepNode[] {
  if (!afterId) return [...steps, newStep]
  const out: StepNode[] = []
  let inserted = false
  for (const s of steps) {
    out.push(s)
    if (s.id === afterId) {
      out.push(newStep)
      inserted = true
    } else if (s.children) {
      const children = insertAfter(s.children, afterId, newStep)
      if (children !== s.children) out[out.length - 1] = { ...s, children }
    }
  }
  if (!inserted) out.push(newStep)
  return out
}

/** 删除步骤（连同其子树） */
export function removeStep(steps: StepNode[], id: string): StepNode[] {
  return steps
    .filter((s) => s.id !== id)
    .map((s) =>
      s.children ? { ...s, children: removeStep(s.children, id) } : s
    )
}

/** 深拷贝一个步骤并在其后插入（复制自身 id 会重新生成） */
export function duplicateStep(
  steps: StepNode[],
  id: string
): StepNode[] {
  const path = findStepPath(steps, id)
  if (!path) return steps
  const copy: StepNode = JSON.parse(JSON.stringify(path.step))
  copy.id = nextStepId(steps)
  return insertAfter(steps, id, copy)
}

/** 统计树中步骤总数（用于工具栏显示） */
export function countSteps(steps: StepNode[]): number {
  let n = 0
  for (const s of steps) {
    n++
    if (s.children) n += countSteps(s.children)
  }
  return n
}

/**
 * 在同父数组内重排：把 fromId 的节点移动到 toId 之前/之后。
 * 跨层移动留后续切片（当前同父内重排覆盖 §5 拖拽排序主场景）。
 * position: 'before' | 'after'；若 from === to 或未找到，原样返回。
 */
export function moveStep(
  steps: StepNode[],
  fromId: string,
  toId: string,
  position: 'before' | 'after'
): StepNode[] {
  if (fromId === toId) return steps
  const walk = (arr: StepNode[]): StepNode[] => {
    const fromIdx = arr.findIndex((s) => s.id === fromId)
    const toIdx = arr.findIndex((s) => s.id === toId)
    if (fromIdx >= 0 && toIdx >= 0) {
      const next = [...arr]
      const [moved] = next.splice(fromIdx, 1)
      // 删除 from 后 to 的索引可能变
      const newToIdx = next.findIndex((s) => s.id === toId)
      const insertAt = position === 'before' ? newToIdx : newToIdx + 1
      next.splice(insertAt, 0, moved)
      return next
    }
    // 递归子层
    return arr.map((s) =>
      s.children ? { ...s, children: walk(s.children) } : s
    )
  }
  return walk(steps)
}


/** 编辑器初始模板（纯通用指令，运行不需要外部进程） */
export function buildInitialFlow(): FlowDoc {
  return {
    version: 1,
    name: '未命名流程',
    vars: [{ name: 'kw', type: 'string', value: '锐流 RPA' }],
    steps: [
      {
        id: 's1',
        cmdId: 'logMessage',
        params: { message: '=== 开始 ===', level: 'info' }
      },
      {
        id: 's2',
        cmdId: 'logMessage',
        params: { message: '搜索词: ${kw}', level: 'success' }
      },
      {
        id: 's3',
        cmdId: 'delay',
        params: { ms: 300 }
      },
      {
        id: 's4',
        cmdId: 'logMessage',
        params: { message: '=== 结束 ===', level: 'info' }
      }
    ]
  }
}
