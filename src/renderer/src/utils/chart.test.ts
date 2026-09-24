import { describe, expect, it } from 'vitest'
import { buildChartPaths } from './chart'

describe('buildChartPaths', () => {
  const points = [
    { date: '09-16', value: 12 },
    { date: '09-17', value: 22 },
    { date: '09-18', value: 40 },
    { date: '09-19', value: 52 },
    { date: '09-20', value: 80 },
    { date: '09-21', value: 102 },
    { date: '09-22', value: 120 }
  ]

  it('少于 2 个点时返回空 path', () => {
    const r = buildChartPaths([{ date: 'a', value: 1 }])
    expect(r.line).toBe('')
    expect(r.area).toBe('')
    expect(r.maxValue).toBe(0)
  })

  it('生成以 M 开头的折线 path，且段数为 n-1', () => {
    const r = buildChartPaths(points)
    expect(r.line.startsWith('M')).toBe(true)
    const segments = r.line.match(/[ML]/g)
    // M + (n-1) 个 L
    expect(segments?.length).toBe(points.length)
  })

  it('maxValue 取数据最大值的 1.1 倍（确保点不贴顶）', () => {
    const r = buildChartPaths(points)
    expect(r.maxValue).toBeCloseTo(120 * 1.1, 5)
  })

  it('面积 path 闭合回到底部（以 Z 结尾）', () => {
    const r = buildChartPaths(points)
    expect(r.area.endsWith('Z')).toBe(true)
  })

  it('y 坐标随 value 单调递减（值越大越高）', () => {
    const r = buildChartPaths(points, 640, 150, 20, 20)
    const ys = r.line
      .match(/[ML]([\d.]+) ([\d.]+)/g)!
      .map((s) => Number(s.split(' ')[1]))
    expect(ys[0]).toBeGreaterThan(ys[ys.length - 1])
  })

  it('全零数据不产生 NaN', () => {
    const r = buildChartPaths([
      { date: 'a', value: 0 },
      { date: 'b', value: 0 }
    ])
    expect(r.line).not.toContain('NaN')
    expect(r.maxValue).toBeGreaterThan(0)
  })
})
