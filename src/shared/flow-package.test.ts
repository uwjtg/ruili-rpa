import { describe, expect, it } from 'vitest'
import {
  buildFlowPackage,
  isFlowDoc,
  parseFlowPackage,
  PACKAGE_APP
} from './flow-package'
import type { FlowDoc } from './ast'

const sample: FlowDoc = {
  version: 1,
  name: '测试流程',
  vars: [{ name: 'kw', type: 'string', value: 'hi' }],
  steps: [
    { id: 's1', cmdId: 'logMessage', params: { message: 'hi', level: 'info' } }
  ]
}

describe('流程包导入导出（M5-24）', () => {
  it('isFlowDoc 接受合法 FlowDoc', () => {
    expect(isFlowDoc(sample)).toBe(true)
  })

  it('isFlowDoc 拒绝空 steps / 缺字段 / 非法步骤', () => {
    expect(isFlowDoc({ version: 1, name: 'x', vars: [], steps: [] })).toBe(false)
    expect(isFlowDoc({ name: 'x', vars: [], steps: [1, 2] })).toBe(false)
    expect(isFlowDoc(null)).toBe(false)
    expect(isFlowDoc('nope')).toBe(false)
  })

  it('buildFlowPackage 带 meta', () => {
    const pkg = buildFlowPackage(sample)
    expect(pkg.meta.app).toBe(PACKAGE_APP)
    expect(pkg.meta.format).toBe(1)
    expect(pkg.flow).toEqual(sample)
  })

  it('parse 标准包 {meta, flow}', () => {
    const pkg = buildFlowPackage(sample)
    const r = parseFlowPackage(JSON.stringify(pkg))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.flow.name).toBe('测试流程')
  })

  it('parse 裸 FlowDoc（向后兼容）', () => {
    const r = parseFlowPackage(JSON.stringify(sample))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.flow.steps[0].cmdId).toBe('logMessage')
  })

  it('parse 拒绝非法 JSON', () => {
    expect(parseFlowPackage('{ not json').ok).toBe(false)
  })

  it('parse 拒绝不像流程的对象', () => {
    expect(parseFlowPackage('{"hello":"world"}').ok).toBe(false)
  })

  it('parse 拒绝非空 steps 但步骤形状非法', () => {
    const bad = { version: 1, name: 'x', vars: [], steps: [{ id: 123, cmdId: 'logMessage' }] }
    expect(parseFlowPackage(JSON.stringify(bad)).ok).toBe(false)
  })
})
