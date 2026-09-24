import { describe, it, expect } from 'vitest'
import { applyRunOverrides, missingRequiredOverrides } from './run-overrides'
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

describe('missingRequiredOverrides（M3 切片 14）', () => {
  it('required 且提交值为空（含被清空的默认值/纯空白）才被列出', () => {
    const vars = [
      { name: 'a', type: 'string' as const, value: '', required: true },
      { name: 'b', type: 'string' as const, value: 'x', required: true },
      { name: 'c', type: 'string' as const, value: '', required: false },
      { name: 'd', type: 'string' as const, value: '' }
    ]
    // 用户清空了有默认值的必填变量 b → 一并拦截
    expect(missingRequiredOverrides(vars, { a: '', b: '', c: '', d: '' })).toEqual(['a', 'b'])
    expect(missingRequiredOverrides(vars, { a: '   ', b: 'v', c: '', d: '' })).toEqual(['a'])
    expect(missingRequiredOverrides(vars, { a: 'v', b: '', c: '', d: '' })).toEqual(['b'])
    expect(missingRequiredOverrides(vars, { a: 'v', b: 'x', c: '', d: '' })).toEqual([])
  })

  it('无 required 变量时恒为空列表', () => {
    expect(missingRequiredOverrides(base.vars, { input1: '', n: '', flag: '' })).toEqual([])
  })
})
