import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { QUICK_ENTRIES, CHART_RANGES } from '../data/mock'
import {
  aggregateDailyHours,
  buildOrgRows,
  computeStats,
  recentActivity
} from '../data/homeStats'
import type { RunHistoryRow } from '../data/homeStats'
import { buildChartPaths } from '../utils/chart'
import type { RunWireEvent } from '../../../shared/run-protocol'

/**
 * 首页·工作台（P1 修复：真实数据版）：
 * 4 快捷入口卡 + 4 统计指标（来自 SQLite flow/runs 聚合）+
 * 累计运行时长折线图（按日聚合真实耗时）+ 企业概览（真实版本）+ 最近运行动态。
 * 无数据时各项为 0 / 空态，不再展示写死的演示值。
 */
export default function HomeView(): JSX.Element {
  const navigate = useNavigate()
  const ruili = window.ruili
  const [range, setRange] = useState<string>(CHART_RANGES[0])
  const [apps, setApps] = useState(0)
  const [runs, setRuns] = useState<RunHistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!ruili) return
    const [flowRes, runRes] = await Promise.all([
      ruili.flow.list().catch(() => null),
      ruili.runs.history(500).catch(() => null)
    ])
    if (flowRes && flowRes.ok) setApps(flowRes.items.length)
    if (runRes && runRes.ok) setRuns(runRes.items)
    setLoading(false)
  }, [ruili])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 运行结束后自动刷新工作台统计（与设计器/调度触发的运行联动）
  useEffect(() => {
    if (!ruili?.run?.onEvent) return
    const off = ruili.run.onEvent((e: RunWireEvent) => {
      if (e.type === 'flow-end') void refresh()
    })
    return off
  }, [ruili, refresh])

  const rangeDays = range === '近一月' ? 30 : range === '近一年' ? 365 : 7
  const chart = useMemo(() => aggregateDailyHours(runs, rangeDays), [runs, rangeDays])
  const stats = useMemo(() => computeStats(runs, apps), [runs, apps])
  const activities = useMemo(() => recentActivity(runs), [runs])
  const orgRows = useMemo(
    () => buildOrgRows(ruili?.appVersion ?? '0.0.0'),
    [ruili]
  )
  const allZero = chart.every((p) => p.value === 0)
  const paths = useMemo(() => buildChartPaths(chart), [chart])

  // x 轴刻度：点多时均匀抽稀，最多显示 7 个标签
  const xLabels = useMemo(() => {
    const step = Math.max(1, Math.ceil(chart.length / 7))
    return chart.filter((_, i) => i % step === 0 || i === chart.length - 1)
  }, [chart])

  return (
    <div className="view" aria-label="首页">
      <div className="subtabs">
        <button type="button" className="subtab active">
          首页
        </button>
        <button type="button" className="subtab" onClick={() => navigate('/apps')}>
          应用管理
        </button>
      </div>

      <div className="home-layout">
        <div>
          <div className="quick-row">
            {QUICK_ENTRIES.map((q) => (
              <button
                key={q.key}
                type="button"
                className="quick-card"
                onClick={() => navigate(q.to)}
              >
                <span className="qc-icon" style={{ background: q.color }}>
                  <Icon name={q.icon} size={16} strokeWidth={2} />
                </span>
                <span className="qc-text">
                  <span className="qc-t">{q.name}</span>
                  <span className="qc-s">{q.desc}</span>
                </span>
                <span className="qc-arrow">
                  <Icon name="arrow" size={14} strokeWidth={2} />
                </span>
              </button>
            ))}
          </div>

          <div className="stat-row">
            {stats.map((s) => (
              <div key={s.label} className="stat">
                <div className="s-label">{s.label}</div>
                <div className="s-num">
                  {s.value}
                  <small>{s.unit}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-head">
              应用累计运行时长
              <span className="more">
                {CHART_RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={'seg' + (r === range ? ' active' : '')}
                    onClick={() => setRange(r)}
                  >
                    {r}
                  </button>
                ))}
              </span>
            </div>
            <div className="chart-wrap">
              {loading ? (
                <div style={{ height: 150, lineHeight: '150px', textAlign: 'center', color: '#8A8F99', fontSize: 13 }}>
                  加载中…
                </div>
              ) : allZero ? (
                <div style={{ height: 150, lineHeight: '150px', textAlign: 'center', color: '#8A8F99', fontSize: 13 }}>
                  暂无运行数据，运行一次流程后这里会出现趋势
                </div>
              ) : (
                <svg
                  width="100%"
                  height="150"
                  viewBox="0 0 640 150"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="应用累计运行时长折线图"
                >
                  <defs>
                    <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#2F80ED" stopOpacity=".28" />
                      <stop offset="1" stopColor="#2F80ED" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <g stroke="#EEF0F3">
                    <line x1="0" y1="30" x2="640" y2="30" />
                    <line x1="0" y1="70" x2="640" y2="70" />
                    <line x1="0" y1="110" x2="640" y2="110" />
                  </g>
                  <path d={paths.area} fill="url(#chartFill)" />
                  <path
                    d={paths.line}
                    fill="none"
                    stroke="#2F80ED"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <div className="chart-x">
                {xLabels.map((p) => (
                  <span key={p.date}>{p.date}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="home-side">
          <div className="panel">
            <div className="panel-head">企业概览</div>
            <div style={{ height: 8 }} />
            {orgRows.map((row, i) => (
              <div key={row.k} className="kv-row" style={i === 0 ? { borderTop: 'none' } : undefined}>
                <span className="k">{row.k}</span>
                <span className={'v' + (row.link ? ' link' : '')}>{row.v}</span>
              </div>
            ))}
            <div style={{ height: 10 }} />
          </div>

          <div className="panel">
            <div className="panel-head">最近运行</div>
            <div style={{ height: 6 }} />
            {loading ? (
              <div style={{ fontSize: 12, color: '#8A8F99', padding: '8px 0' }}>加载中…</div>
            ) : activities.length === 0 ? (
              <div style={{ fontSize: 12, color: '#8A8F99', padding: '8px 0' }}>
                暂无运行记录，运行一次流程后会出现在这里
              </div>
            ) : (
              activities.map((m, i) => (
                <div key={i} className="member-row">
                  <span className="mt">{m.time}</span>
                  <span>{m.text}</span>
                </div>
              ))
            )}
            <div style={{ height: 6 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
