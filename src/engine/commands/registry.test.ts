import { describe, expect, it } from 'vitest'
import { CommandRegistry } from './registry'
import type { RegisteredCommand } from './registry'

function makeCmd(id: string): RegisteredCommand {
  return {
    id,
    name: `指令 ${id}`,
    group: '测试',
    icon: 'terminal',
    params: [],
    summary: () => id,
    runner: async () => 'ok'
  }
}

describe('CommandRegistry', () => {
  it('register / get / has / list 基本可用', () => {
    const reg = new CommandRegistry()
    expect(reg.has('foo')).toBe(false)
    reg.register(makeCmd('foo'))
    expect(reg.has('foo')).toBe(true)
    expect(reg.get('foo')?.id).toBe('foo')
    expect(reg.list()).toHaveLength(1)
  })

  it('重复注册同一 id 抛错', () => {
    const reg = new CommandRegistry()
    reg.register(makeCmd('dup'))
    expect(() => reg.register(makeCmd('dup'))).toThrow(/重复注册/)
  })

  it('list() 返回拷贝，外部修改不影响内部', () => {
    const reg = new CommandRegistry()
    reg.register(makeCmd('a'))
    const list = reg.list()
    list.pop()
    expect(reg.list()).toHaveLength(1)
  })
})
