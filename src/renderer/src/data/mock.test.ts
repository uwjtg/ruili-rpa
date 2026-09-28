import { describe, expect, it } from 'vitest'
import { CHART_RANGES, QUICK_ENTRIES } from './mock'
import {
  aggregateDailyHours,
  buildOrgRows,
  computeStats,
  recentActivity
} from './homeStats'
import type { RunHistoryRow } from './homeStats'
import { ICON_PATHS } from '../components/iconPaths'

/** 构造一条运行记录（测试桩） */
function makeRun(partial: Partial<RunHistoryRow> & { runId: string }): RunHistoryRow {
  return {
    flowId: null,
    flowName: '测试流程',
    status: 'completed',
    durationMs: 1000,
    startedAt: 0,
    endedAt: 0,
    entryCount: 1,
    ...partial
  }
}

describe('首页静态配置', () => {
  it('快捷入口恰好 4 个，且 icon 均存在于图标库', () => {
    expect(QUICK_ENTRIES).toHaveLength(4)
    for (const q of QUICK_ENTRIES) {
      expect(q.name.length).toBeGreaterThan(0)
      expect(ICON_PATHS[q.icon]).toBeDefined()
      expect(q.to.startsWith('/')).toBe(true)
    }
  })

  it('图表范围切换固定三档', () => {
    expect(CHART_RANGES).toEqual(['近一周', '近一月', '近一年'])
  })
})

describe('工作台真实数据聚合（P1 修复）', () => {
  it('computeStats：应用数 / 时长 / 次数 / 折算人力全部来自真实运行', () => {
    const now = new Date(2026, 8, 28, 12).getTime()
    const runs = [
      makeRun({ runId: 'a', durationMs: 3_600_000, endedAt: now, startedAt: now - 3_600_000 }),
      makeRun({ runId: 'b', durationMs: 3_600_000, status: 'error', endedAt: now, startedAt: now - 3_600_000 })
    ]
    const stats = computeStats(runs, 3)
    expect(stats.map((s) => s.label)).toEqual(['我的应用', '累计运行时长', '运行次数', '已节省人力'])
    expect(stats[0]).toMatchObject({ value: '3', unit: '个' })
    expect(stats[1]).toMatchObject({ value: '2.0', unit: '小时' })
    expect(stats[2]).toMatchObject({ value: '2', unit: '次' })
    // 2 小时 / 8 工时每天 = 0.25 → 0.3
    expect(stats[3]).toMatchObject({ value: '0.3', unit: '天' })
  })

  it('computeStats：无运行时全部为 0，不再出现写死的演示值', () => {
    const stats = computeStats([], 0)
    expect(stats.map((s) => s.value)).toEqual(['0', '0.0', '0', '0.0'])
  })

  it('aggregateDailyHours：返回恰好 N 个点，按自然日聚合耗时', () => {
    const now = new Date(2026, 8, 28, 12, 0).getTime()
    const runs = [
      makeRun({ runId: 'a', durationMs: 7_200_000, endedAt: now, startedAt: now - 7_200_000 }),
      makeRun({ runId: 'b', durationMs: 3_600_000, endedAt: now - 86_400_000, startedAt: now - 86_400_000 - 3_600_000 })
    ]
    const week = aggregateDailyHours(runs, 7, now)
    expect(week).toHaveLength(7)
    // 当天 7200s = 2h
    expect(week[6].value).toBe(2)
    // 昨天 3600s = 1h
    expect(week[5].value).toBe(1)
    // 更早的天为 0
    expect(week[0].value).toBe(0)
    // 30 天 / 365 天档位同样补齐
    expect(aggregateDailyHours([], 30, now)).toHaveLength(30)
    expect(aggregateDailyHours([], 365, now)).toHaveLength(365)
  })

  it('recentActivity：最近 N 条，相对时间 + 流程名 + 成功标记', () => {
    const now = new Date(2026, 8, 28, 12, 0).getTime()
    const runs = [
      makeRun({ runId: 'a', flowName: '发票归档', endedAt: now - 5 * 60_000, startedAt: now - 10 * 60_000 }),
      makeRun({ runId: 'b', flowName: null, status: 'error', endedAt: now - 3 * 3_600_000, startedAt: now - 3 * 3_600_000 - 60_000 })
    ]
    const list = recentActivity(runs, now, 5)
    expect(list).toHaveLength(2)
    expect(list[0].time).toBe('5 分钟前')
    expect(list[0].text).toContain('发票归档')
    expect(list[1].text).toContain('error')
    expect(list[1].text).toContain('未命名流程')
  })

  it('buildOrgRows：版本来自 appVersion，不再写死社区版号', () => {
    const rows = buildOrgRows('0.1.1')
    expect(rows[0].v).toBe('锐流 RPA v0.1.1')
    expect(rows.some((r) => r.v.includes('社区版'))).toBe(false)
  })
})
