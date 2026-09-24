import { describe, expect, it } from 'vitest'
import { CommandRegistry } from './registry'
import { registerDemoCommands } from './demo'

const DEMO_IDS = [
  'logMessage',
  'delay',
  'setVar',
  'httpGet',
  'jsonParse',
  'randomInt',
  'loopList',
  'ifVar'
]

describe('演示指令集', () => {
  it('注册恰好 8 条指令，id 与清单一致', () => {
    const reg = new CommandRegistry()
    registerDemoCommands(reg)
    expect(reg.list()).toHaveLength(8)
    expect(reg.list().map((c) => c.id).sort()).toEqual([...DEMO_IDS].sort())
  })

  it('每条指令都有必填元数据（id/name/group/icon/params/summary）', () => {
    const reg = new CommandRegistry()
    registerDemoCommands(reg)
    for (const cmd of reg.list()) {
      expect(cmd.id.length).toBeGreaterThan(0)
      expect(cmd.name.length).toBeGreaterThan(0)
      expect(cmd.group.length).toBeGreaterThan(0)
      expect(cmd.icon.length).toBeGreaterThan(0)
      expect(Array.isArray(cmd.params)).toBe(true)
      expect(typeof cmd.summary).toBe('function')
      expect(typeof cmd.runner).toBe('function')
    }
  })

  it('块指令 loopList / ifVar 标记 hasEnd', () => {
    const reg = new CommandRegistry()
    registerDemoCommands(reg)
    expect(reg.get('loopList')?.hasEnd).toBe(true)
    expect(reg.get('ifVar')?.hasEnd).toBe(true)
    // 叶子指令不带 hasEnd
    expect(reg.get('logMessage')?.hasEnd).toBeUndefined()
  })
})
