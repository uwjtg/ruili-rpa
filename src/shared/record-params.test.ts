import { describe, it, expect } from 'vitest'
import { parameterizeRecording } from './record-params'
import type { RecordedInstruction } from './desktop-record'

function ins(kind: string, cmdId: string, params: Record<string, unknown>): RecordedInstruction {
  return { id: 'r1', kind: kind as RecordedInstruction['kind'], cmdId, label: '', params, ts: 0 }
}

describe('parameterizeRecording（M3 切片 9）', () => {
  it('把 typeText 硬编码文本抽成流程变量，步骤改为 ${var} 引用', () => {
    const { steps, vars } = parameterizeRecording([
      ins('type', 'typeText', { text: 'hello' }),
      ins('type', 'typeText', { text: 'world' })
    ])
    expect(vars).toEqual([
      { name: 'input1', type: 'string', value: 'hello' },
      { name: 'input2', type: 'string', value: 'world' }
    ])
    expect(steps[0].params.text).toBe('${input1}')
    expect(steps[1].params.text).toBe('${input2}')
  })

  it('其它指令（pickElement/scroll/pressKey）与已含 ${} 的文本不动', () => {
    const { steps, vars } = parameterizeRecording([
      ins('click', 'pickElement', { target: { name: 'OK' } }),
      ins('key', 'pressKey', { keys: 'Enter' }),
      ins('type', 'typeText', { text: '${kw}' })
    ])
    expect(vars).toEqual([])
    expect(steps[0].cmdId).toBe('pickElement')
    expect(steps[1].params.keys).toBe('Enter')
    expect(steps[2].params.text).toBe('${kw}')
  })

  it('避开流程已有变量名', () => {
    const { vars } = parameterizeRecording([ins('type', 'typeText', { text: 'x' })], [
      { name: 'input1', type: 'string', value: 'old' }
    ])
    expect(vars[0].name).toBe('input2')
  })

  it('空文本不抽变量', () => {
    const { steps, vars } = parameterizeRecording([ins('type', 'typeText', { text: '' })])
    expect(vars).toEqual([])
    expect(steps[0].params.text).toBe('')
  })
})

describe('parameterizeRecording scroll 数值参数化（M3 切片 11）', () => {
  it('把 scroll 的 delta/x/y 抽成 number 变量并替换为插值引用', () => {
    const { steps, vars } = parameterizeRecording([
      ins('scroll', 'scroll', { delta: 120, target: null, x: 200, y: 300 })
    ])
    expect(vars).toEqual([
      { name: 'scrollDelta1', type: 'number', value: 120 },
      { name: 'scrollX1', type: 'number', value: 200 },
      { name: 'scrollY1', type: 'number', value: 300 }
    ])
    expect(steps[0].params.delta).toBe('${scrollDelta1}')
    expect(steps[0].params.x).toBe('${scrollX1}')
    expect(steps[0].params.y).toBe('${scrollY1}')
  })

  it('scroll 缺 x/y 时只参数化存在的数值；非数字不抽', () => {
    const { steps, vars } = parameterizeRecording([
      ins('scroll', 'scroll', { delta: -240, x: 'now-str' })
    ])
    expect(vars.map((v) => v.name)).toEqual(['scrollDelta1'])
    expect(steps[0].params.delta).toBe('${scrollDelta1}')
    expect(steps[0].params.x).toBe('now-str')
  })
})
