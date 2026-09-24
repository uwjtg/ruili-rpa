import { describe, expect, it } from 'vitest'
import { FALLBACK_ICON, ICON_PATHS } from './iconPaths'

describe('自绘图标库', () => {
  it('图标数量不少于原型 35 个（含壳补充）', () => {
    expect(Object.keys(ICON_PATHS).length).toBeGreaterThanOrEqual(35)
  })

  it('每个图标路径非空、为合法 SVG 片段、且不含脚本与外部引用', () => {
    for (const [name, inner] of Object.entries(ICON_PATHS)) {
      expect(inner.length, `icon ${name} 为空`).toBeGreaterThan(10)
      expect(inner.trim().startsWith('<'), `icon ${name} 未以 < 开头`).toBe(true)
      expect(inner.trim().endsWith('/>') || inner.trim().endsWith('>'), `icon ${name} 未闭合`).toBe(
        true
      )
      expect(inner.toLowerCase(), `icon ${name} 含可疑内容`).not.toMatch(
        /script|javascript:|onerror|onclick|http/
      )
    }
  })

  it('兜底图标存在', () => {
    expect(ICON_PATHS[FALLBACK_ICON]).toBeDefined()
  })
})
