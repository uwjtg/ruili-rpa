import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import { registerDemoCommands } from '../commands/demo'
import { hasError, validateFlow } from './validate'
import type { FlowDoc } from '../../shared/ast'

function reg(): CommandRegistry {
  const r = new CommandRegistry()
  registerDemoCommands(r)
  return r
}

describe('validateFlow', () => {
  it('合法流程无 error', () => {
    const flow: FlowDoc = {
      version: 1,
      name: 'ok',
      vars: [],
      steps: [{ id: 'a', cmdId: 'logMessage', params: { message: 'x' } }]
    }
    expect(hasError(validateFlow(flow, reg()))).toBe(false)
  })

  it('未注册指令报 error', () => {
    const flow: FlowDoc = {
      version: 1,
      name: 'bad',
      vars: [],
      steps: [{ id: 'a', cmdId: 'nope', params: {} }]
    }
    const issues = validateFlow(flow, reg())
    expect(hasError(issues)).toBe(true)
    expect(issues[0].message).toMatch(/未注册/)
  })

  it('块指令无子步骤报 warn（不阻止运行）', () => {
    const flow: FlowDoc = {
      version: 1,
      name: 'warn',
      vars: [],
      steps: [{ id: 'a', cmdId: 'loopList', params: { listVar: 'x', itemVar: 'i' } }]
    }
    const issues = validateFlow(flow, reg())
    expect(hasError(issues)).toBe(false)
    expect(issues.some((i) => i.severity === 'warn')).toBe(true)
  })
})
