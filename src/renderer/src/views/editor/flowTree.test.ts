/**
 * flowTree 不可变操作单测（M2 切片 3：拖拽重排）。
 */
import { describe, expect, it } from 'vitest'
import { moveStep, buildInitialFlow } from './flowTree'
import type { StepNode } from '../../../../shared/ast'

function s(id: string, children?: StepNode[]): StepNode {
  return { id, cmdId: 'logMessage', params: {}, children }
}

describe('moveStep 同父内重排', () => {
  it('把 s2 移到 s1 之前', () => {
    const steps = [s('s1'), s('s2'), s('s3')]
    const out = moveStep(steps, 's2', 's1', 'before')
    expect(out.map((x) => x.id)).toEqual(['s2', 's1', 's3'])
  })

  it('把 s1 移到 s3 之后', () => {
    const steps = [s('s1'), s('s2'), s('s3')]
    const out = moveStep(steps, 's1', 's3', 'after')
    expect(out.map((x) => x.id)).toEqual(['s2', 's3', 's1'])
  })

  it('移动到自己位置原样返回', () => {
    const steps = [s('s1'), s('s2')]
    expect(moveStep(steps, 's1', 's1', 'before')).toBe(steps)
  })

  it('嵌套子层也能重排', () => {
    const steps = [s('parent', [s('c1'), s('c2')]), s('sibling')]
    const out = moveStep(steps, 'c2', 'c1', 'before')
    expect(out[0].children?.map((x) => x.id)).toEqual(['c2', 'c1'])
    // 顶层不动
    expect(out.map((x) => x.id)).toEqual(['parent', 'sibling'])
  })

  it('buildInitialFlow 默认 4 步重排后仍 4 步', () => {
    const flow = buildInitialFlow()
    const out = moveStep(flow.steps, 's2', 's4', 'after')
    expect(out).toHaveLength(4)
    expect(out.map((x) => x.id)).toEqual(['s1', 's3', 's4', 's2'])
  })
})
