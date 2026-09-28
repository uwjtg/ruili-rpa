/**
 * 首页·工作台真实数据聚合（P1 修复：替换 mock.ts 写死的演示数据）。
 *
 * 全部为纯函数：输入本地 SQLite 聚合结果（flow.list + runs.history），
 * 输出工作台 4 项指标 / 每日运行时长折线 / 最近运行动态。
 * 无真实运行时输出 0 与空态，不再展示任何写死的演示值。
 */

export interface StatItem {
  label: string
  value: string
  unit: string
}

export interface ChartPoint {
  date: string
  value: number
}

/** 与主进程 runs:history 返回的行对齐（见 shared/db RunHistoryItem） */
export interface RunHistoryRow {
  runId: string
  flowId: string | null
  flowName: string | null
  status: string
  durationMs: number | null
  startedAt: number
  endedAt: number
  entryCount: number
}

export interface RecentActivity {
  time: string
  text: string
  /** completed / error / cancelled …用于着色 */
  status: string
}

export interface OrgOverviewRow {
  k: string
  v: string
  link?: boolean
}

const HOUR = 3_600_000
/** 折算口径：1 个机器人小时 ≈ 1 个人工小时，按每日 8 工时折算节省人力（天） */
const WORK_HOURS_PER_DAY = 8

function isSuccess(status: string): boolean {
  return status === 'completed' || status === 'ok'
}

/** 4 项统计指标：应用数 / 累计运行时长 / 运行次数 / 折算节省人力 */
export function computeStats(runs: RunHistoryRow[], appCount: number): StatItem[] {
  const totalMs = runs.reduce((acc, r) => acc + (r.durationMs ?? 0), 0)
  const hours = totalMs / HOUR
  const days = hours / WORK_HOURS_PER_DAY
  return [
    { label: '我的应用', value: String(appCount), unit: '个' },
    { label: '累计运行时长', value: hours.toFixed(1), unit: '小时' },
    { label: '运行次数', value: String(runs.length), unit: '次' },
    { label: '已节省人力', value: days.toFixed(1), unit: '天' }
  ]
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function fmtDay(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 最近 N 个自然日逐日运行时长（小时，保留 1 位）。
 * 始终返回 N 个点（无运行的日为 0），便于折线图连续渲染。
 */
export function aggregateDailyHours(
  runs: RunHistoryRow[],
  days: number,
  now: number = Date.now()
): ChartPoint[] {
  const from = startOfDay(now) - (days - 1) * 86_400_000
  const buckets = new Map<string, number>()
  for (let i = 0; i < days; i++) {
    buckets.set(fmtDay(from + i * 86_400_000), 0)
  }
  for (const r of runs) {
    const t = startOfDay(r.endedAt || r.startedAt)
    if (t < from) continue
    const k = fmtDay(t)
    buckets.set(k, (buckets.get(k) ?? 0) + (r.durationMs ?? 0) / HOUR)
  }
  return Array.from(buckets.entries()).map(([date, hours]) => ({
    date,
    value: Math.round(hours * 10) / 10
  }))
}

/** 最近运行动态（取最近 limit 次，相对时间 + 流程名 + 结果） */
export function recentActivity(
  runs: RunHistoryRow[],
  now: number = Date.now(),
  limit = 5
): RecentActivity[] {
  return runs.slice(0, limit).map((r) => ({
    time: timeAgo(r.endedAt || r.startedAt, now),
    text: `${r.flowName ?? '未命名流程'} · ${isSuccess(r.status) ? '成功' : r.status}`,
    status: r.status
  }))
}

function timeAgo(ts: number, now: number): string {
  const diff = Math.max(0, now - ts)
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}

/** 企业概览：本地单机版真实信息（版本来自 appVersion，不再写死社区版号） */
export function buildOrgRows(appVersion: string): OrgOverviewRow[] {
  return [
    { k: '版本', v: `锐流 RPA v${appVersion}` },
    { k: '运行环境', v: '本地单机版' },
    { k: '执行机器人', v: '1 / 1（本机）' }
  ]
}
