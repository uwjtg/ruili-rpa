import type { JSX } from 'react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import {
  CHART_RANGES,
  HOME_STATS,
  MEMBER_ACTIVITY,
  ORG_OVERVIEW,
  QUICK_ENTRIES,
  RUNTIME_CHART
} from '../data/mock'
import { buildChartPaths } from '../utils/chart'

/**
 * 首页·工作台（按 V3 原型迁移）：
 * 子页签（首页/应用管理）+ 4 快捷入口卡 + 4 统计指标 +
 * 应用累计运行时长折线图卡（自绘 SVG）+ 企业概览 + 成员动态。
 */
export default function HomeView(): JSX.Element {
  const navigate = useNavigate()
  const [range, setRange] = useState<string>(CHART_RANGES[0])
  const chart = useMemo(() => buildChartPaths(RUNTIME_CHART), [])

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
            {HOME_STATS.map((s) => (
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
                <path d={chart.area} fill="url(#chartFill)" />
                <path
                  d={chart.line}
                  fill="none"
                  stroke="#2F80ED"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="chart-x">
                {RUNTIME_CHART.map((p) => (
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
            {ORG_OVERVIEW.map((row, i) => (
              <div key={row.k} className="kv-row" style={i === 0 ? { borderTop: 'none' } : undefined}>
                <span className="k">{row.k}</span>
                <span className={'v' + (row.link ? ' link' : '')}>{row.v}</span>
              </div>
            ))}
            <div style={{ height: 10 }} />
          </div>

          <div className="panel">
            <div className="panel-head">成员动态</div>
            <div style={{ height: 6 }} />
            {MEMBER_ACTIVITY.map((m, i) => (
              <div key={i} className="member-row">
                <span className="mt">{m.time}</span>
                <span>{m.text}</span>
              </div>
            ))}
            <div style={{ height: 6 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
