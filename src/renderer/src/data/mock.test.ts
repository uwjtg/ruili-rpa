import { describe, expect, it } from 'vitest'
import {
  CHART_RANGES,
  HOME_STATS,
  MEMBER_ACTIVITY,
  ORG_OVERVIEW,
  QUICK_ENTRIES,
  RUNTIME_CHART
} from './mock'
import { ICON_PATHS } from '../components/iconPaths'

describe('首页工作台演示数据', () => {
  it('快捷入口恰好 4 个，且 icon 均存在于图标库', () => {
    expect(QUICK_ENTRIES).toHaveLength(4)
    for (const q of QUICK_ENTRIES) {
      expect(q.name.length).toBeGreaterThan(0)
      expect(ICON_PATHS[q.icon]).toBeDefined()
      expect(q.to.startsWith('/')).toBe(true)
    }
  })

  it('统计指标 4 项且单位符合设计（个/小时/次/天）', () => {
    expect(HOME_STATS).toHaveLength(4)
    const units = HOME_STATS.map((s) => s.unit)
    expect(units).toEqual(['个', '小时', '次', '天'])
    for (const s of HOME_STATS) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.value.length).toBeGreaterThan(0)
    }
  })

  it('折线图数据为近一周 7 个点，日期与数值一一对应', () => {
    expect(RUNTIME_CHART).toHaveLength(7)
    for (const p of RUNTIME_CHART) {
      expect(p.date).toMatch(/^\d{2}-\d{2}$/)
      expect(p.value).toBeGreaterThan(0)
    }
    // 演示趋势：逐日上升
    const values = RUNTIME_CHART.map((p) => p.value)
    expect([...values].sort((a, b) => a - b)).toEqual(values)
  })

  it('图表范围切换固定三档', () => {
    expect(CHART_RANGES).toEqual(['近一周', '近一月', '近一年'])
  })

  it('企业概览 5 行、成员动态 4 条', () => {
    expect(ORG_OVERVIEW).toHaveLength(5)
    expect(MEMBER_ACTIVITY).toHaveLength(4)
    for (const m of MEMBER_ACTIVITY) {
      expect(m.time.length).toBeGreaterThan(0)
      expect(m.text.length).toBeGreaterThan(0)
    }
  })
})
