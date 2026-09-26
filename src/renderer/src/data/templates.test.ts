/**
 * 官方模板·渲染端校验（M5 切片 23）。
 *
 * 这一侧只做不依赖引擎的静态检查：数量、id 唯一、结构、分类、图标存在。
 * 「cmdId 是否都已注册」由 src/engine/templates-registry.test.ts 用真实注册表校验
 * （那个测试在 node 工程侧，避免把 engine 源码拉进 web tsconfig）。
 */
import { describe, expect, it } from 'vitest'
import {
  OFFICIAL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  countTemplateSteps
} from '@shared/templates'
import { ICON_PATHS } from '../components/iconPaths'
import type { StepNode } from '@shared/ast'

/** 递归收集全部步骤节点 */
function allSteps(steps: StepNode[] | undefined, acc: StepNode[] = []): StepNode[] {
  if (!steps) return acc
  for (const s of steps) {
    acc.push(s)
    allSteps(s.children, acc)
    allSteps(s.else, acc)
  }
  return acc
}

describe('官方模板·渲染端静态校验', () => {
  it('数量满足计划书 M5「官方模板 30+」要求', () => {
    expect(OFFICIAL_TEMPLATES.length).toBeGreaterThanOrEqual(30)
  })

  it('模板 id 全局唯一', () => {
    const ids = OFFICIAL_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('分类去重且非空', () => {
    expect(TEMPLATE_CATEGORIES.length).toBeGreaterThan(0)
    expect(new Set(TEMPLATE_CATEGORIES).size).toBe(TEMPLATE_CATEGORIES.length)
  })

  for (const t of OFFICIAL_TEMPLATES) {
    describe(`模板「${t.name}」(${t.id})`, () => {
      it('元信息完整且图标存在', () => {
        expect(t.name.length).toBeGreaterThan(0)
        expect(t.category.length).toBeGreaterThan(0)
        expect(t.description.length).toBeGreaterThan(0)
        expect(ICON_PATHS[t.icon]).toBeDefined()
      })

      it('FlowDoc 结构完整、步骤非空、id 唯一', () => {
        expect(t.flow.version).toBe(1)
        expect(t.flow.name.length).toBeGreaterThan(0)
        expect(Array.isArray(t.flow.vars)).toBe(true)
        expect(Array.isArray(t.flow.steps)).toBe(true)
        expect(t.flow.steps.length).toBeGreaterThan(0)
        expect(countTemplateSteps(t)).toBeGreaterThan(0)
        const steps = allSteps(t.flow.steps)
        const ids = steps.map((s) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
      })
    })
  }
})
