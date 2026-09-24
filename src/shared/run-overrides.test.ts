import { describe, it, expect } from 'vitest'
import { applyRunOverrides } from './run-overrides'
import type { FlowDoc } from './ast'

const base: FlowDoc = {
  version: 1,
  name: 'f',
  vars: [
    { name: 'input1', type: 'string', value: 'hello' },
    { name: 'n', type: 'number', value: 5 },
    { name: 'flag', type: 'boolean', value: false }
  ],
  steps: []
}

describe('applyRunOverrides（M3 切片 10）', () => {
  it('字符串/数字/布尔按类型覆盖', () => {
    const out = applyRunOverrides(base, { input1: 'world', n: '42', flag: 'true' })
    expect(out.vars[0].value).toBe('world')
    expect(out.vars[1].value).toBe(42)
    expect(out.vars[2].value).toBe(true)
  })

  it('未覆盖的变量沿用默认；不修改原 flow', () => {
    const out = applyRunOverrides(base, {})
    expect(out.vars[0].value).toBe('hello')
    expect(out.vars[1].value).toBe(5)
    expect(base.vars[0].value).toBe('hello')
  })

  it('数字非法回退默认', () => {
    const out = applyRunOverrides(base, { n: 'abc' })
    expect(out.vars[1].value).toBe(5)
  })
})
