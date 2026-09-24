/** 轻量自绘折线图路径生成（不引重型图表库，数据驱动，可单测） */

export interface ChartPointInput {
  date: string
  value: number
}

export interface ChartPathResult {
  /** 折线 path（M… L…） */
  line: string
  /** 面积填充 path（折线闭合到底部） */
  area: string
  /** 用于刻度标注的最大值 */
  maxValue: number
}

/**
 * 将数据点映射为 SVG path。
 * 坐标：x 均分，y 按 value/max 线性映射；padX/padY 为内边距。
 */
export function buildChartPaths(
  points: ChartPointInput[],
  width = 640,
  height = 150,
  padX = 20,
  padY = 20
): ChartPathResult {
  if (points.length < 2) {
    return { line: '', area: '', maxValue: 0 }
  }
  const rawMax = Math.max(...points.map((p) => p.value))
  const maxValue = rawMax <= 0 ? 1 : rawMax * 1.1
  const innerW = width - padX * 2
  const innerH = height - padY * 2
  const step = innerW / (points.length - 1)

  const coords = points.map((p, i) => ({
    x: padX + i * step,
    y: padY + innerH - (p.value / maxValue) * innerH
  }))

  const line = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ')
  const last = coords[coords.length - 1]
  const first = coords[0]
  const area = `${line} L${last.x.toFixed(1)} ${height} L${first.x.toFixed(1)} ${height} Z`

  return { line, area, maxValue }
}
