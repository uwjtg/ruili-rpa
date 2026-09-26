/**
 * 官方模板·指令注册校验（M5 切片 23，node 工程侧）。
 *
 * 用与生产一致的 buildEngineRegistry() 装配全部指令，对每个模板跑 validateFlow：
 * 任何「未注册的 cmdId」都会被 validateFlow 记为 error，这里要求 0 error。
 * 这保证模板里写的每一步指令在实际运行时都存在。
 */
import { describe, expect, it } from 'vitest'
import { OFFICIAL_TEMPLATES } from '../shared/templates'
import { buildEngineRegistry } from './run/runManager'
import { validateFlow } from './core/validate'

const registry = buildEngineRegistry()

describe('官方模板·指令注册表兼容', () => {
  it('buildEngineRegistry 非空', () => {
    expect(registry.list().length).toBeGreaterThan(20)
  })

  for (const t of OFFICIAL_TEMPLATES) {
    it(`「${t.name}」(${t.id}) 所有 cmdId 已注册、块结构合法`, () => {
      const issues = validateFlow(t.flow, registry)
      const errors = issues.filter((i) => i.severity === 'error')
      expect(errors, JSON.stringify(errors)).toEqual([])
    })
  }
})
