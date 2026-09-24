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
      { name: 'input1', type: 'string', value: 'hello', description: '录制输入文本' },
      { name: 'input2', type: 'string', value: 'world', description: '录制输入文本' }
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
      { name: 'scrollDelta1', type: 'number', value: 120, description: '滚动量（正=向上）' },
      { name: 'scrollX1', type: 'number', value: 200, description: '滚动位置 X（窗口内）' },
      { name: 'scrollY1', type: 'number', value: 300, description: '滚动位置 Y（窗口内）' }
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

describe('parameterizeRecording click boundingBox 参数化（M3 切片 15）', () => {
  const clickIns = (target: unknown) =>
    ins('click', 'pickElement', { target, retries: 2 })

  it('对象 target：把 boundingBox.x/y 抽为 clickX/clickY 变量，target 转 JSON 字符串', () => {
    const { steps, vars } = parameterizeRecording([
      clickIns({
        windowHandle: 1,
        name: '确定',
        boundingBox: { x: 100, y: 120, width: 20, height: 40 }
      })
    ])
    expect(vars).toEqual([
      { name: 'clickX1', type: 'number', value: 100, description: '点击坐标 X（拾取时屏幕坐标）' },
      { name: 'clickY1', type: 'number', value: 120, description: '点击坐标 Y（拾取时屏幕坐标）' }
    ])
    const target = steps[0].params.target
    expect(typeof target).toBe('string')
    // 插值后仍可 JSON.parse 为合法元素对象；数值字段经插值成为数字字符串
    // （sidecar _valid_box 用 int() 规整，等价于 Number 转换，与手填数字一致）
    const interpolated = (target as string).replace(/\$\{(\w+)\}/g, (_m, n) => {
      const v = vars.find((x) => x.name === n)!
      return String(v.value)
    })
    const parsed = JSON.parse(interpolated) as Record<string, unknown>
    const bb = parsed.boundingBox as Record<string, unknown>
    expect(bb.x).toBe('100')
    expect(bb.y).toBe('120')
    expect(Number(bb.x)).toBe(100)
    expect(Number(bb.y)).toBe(120)
  })

  it('JSON 字符串 target 同样参数化；已含 ${} 的跳过', () => {
    const plain = JSON.stringify({
      windowHandle: 1,
      name: '确定',
      boundingBox: { x: 10, y: 20, width: 5, height: 5 }
    })
    const already = JSON.stringify({
      windowHandle: 1,
      name: '确定',
      boundingBox: { x: '${boxX}', y: 20, width: 5, height: 5 }
    })
    const { steps, vars } = parameterizeRecording([ins('click', 'pickElement', { target: plain }), ins('click', 'pickElement', { target: already })])
    expect(vars.map((v) => v.name)).toEqual(['clickX1', 'clickY1'])
    expect(steps[0].params.target).toContain('${clickX1}')
    expect(steps[1].params.target).toBe(already)
  })

  it('boundingBox 缺失/全非数值时保持 target 原样、不抽变量', () => {
    const target = { windowHandle: 1, name: 'OK', boundingBox: { x: '100', y: '120' } }
    const { steps, vars } = parameterizeRecording([clickIns(target)])
    expect(vars).toEqual([])
    expect(steps[0].params.target).toBe(target) // 对象原样，无抽取
  })

  it('连续点击生成递增变量名 clickX2/clickY2', () => {
    const { vars } = parameterizeRecording([
      clickIns({ name: 'a', boundingBox: { x: 1, y: 2, width: 3, height: 4 } }),
      clickIns({ name: 'b', boundingBox: { x: 5, y: 6, width: 3, height: 4 } })
    ])
    expect(vars.map((v) => v.name)).toEqual(['clickX1', 'clickY1', 'clickX2', 'clickY2'])
  })
})
