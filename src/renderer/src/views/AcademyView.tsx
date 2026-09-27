import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'

interface Course {
  icon: string
  title: string
  level: '初级' | '中级' | '高级'
  minutes: number
  description: string
  /** 开始学习跳转到的路由（模板市场对应分类由用户自行筛选） */
  to: string
}

const LEVEL_STYLE: Record<Course['level'], { bg: string; fg: string }> = {
  初级: { bg: '#E7F8F0', fg: '#0E9F5D' },
  中级: { bg: '#E8F0FE', fg: '#2F80ED' },
  高级: { bg: '#F1EDFF', fg: '#7C5CFC' }
}

const COURSES: Course[] = [
  {
    icon: 'home',
    title: '5 分钟跑通第一个流程',
    level: '初级',
    minutes: 10,
    description: '从模板市场一键创建「我的第一个流程」，点运行看日志流式输出，理解步骤、变量与日志三个核心概念。',
    to: '/market'
  },
  {
    icon: 'globe',
    title: '网页自动化：打开网页→抓取→写表',
    level: '中级',
    minutes: 30,
    description: '用 webOpenUrl / webClick / webScrapeList 把一个搜索结果列表抓下来，自动写入 Excel；配套录制器与元素拾取。',
    to: '/market'
  },
  {
    icon: 'cursor',
    title: '桌面自动化：拾取控件与录制回放',
    level: '中级',
    minutes: 30,
    description: '用「拾取」点选桌面软件控件，录下键鼠操作后一键回放；坐标兜底与窗口偏移自动修正。',
    to: '/market'
  },
  {
    icon: 'table',
    title: 'Excel 与数据处理',
    level: '初级',
    minutes: 15,
    description: '读写 xlsx、CSV 解析、数组/字符串/日期/数学指令拼装，把报表加工串成一条自动化流程。',
    to: '/market'
  },
  {
    icon: 'clock',
    title: '调度与机器人：定时/热键/文件触发',
    level: '高级',
    minutes: 20,
    description: '在触发器页建一个 cron 定时任务，关闭收托盘后无人值守运行；在机器人页查看执行记录与实时日志。',
    to: '/triggers'
  },
  {
    icon: 'chip',
    title: 'AI 魔法指令：用自然语言生成流程',
    level: '高级',
    minutes: 15,
    description: '在编辑器工具栏点「AI 魔法」，描述你要做的事，LLM 直接生成可编辑、可运行的流程。',
    to: '/editor'
  }
]

/**
 * 教程·锐流学院视图（M7 切片 29 落地，原为占位）。
 * V1 不做长篇视频教程；这里给出 6 条上手路径卡片，「开始学习」跳到对应功能页/模板。
 */
export default function AcademyView(): JSX.Element {
  const navigate = useNavigate()

  return (
    <div style={{ padding: 20, overflow: 'auto', height: '100%', background: '#F2F3F5' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1F2329' }}>
          教程 · 锐流学院
        </h2>
        <div style={{ fontSize: 12, color: '#8A8F99', marginTop: 2 }}>
          6 条上手路径，按难度排序；每张卡片对应可运行的模板或功能页
        </div>
      </div>

      <div
        style={{
          background: 'linear-gradient(135deg, #7C5CFC 0%, #A855F7 100%)',
          borderRadius: 10,
          padding: '18px 20px',
          color: '#fff',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 14
        }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="edu" size={24} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>第一次用？从这里开始</div>
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 3, lineHeight: 1.5 }}>
            打开模板市场，选一个「入门示例」一键复用，再按需要改参数——不必从零拖指令。
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/market')}
          style={{
            height: 32,
            padding: '0 16px',
            borderRadius: 6,
            border: 'none',
            background: '#fff',
            color: '#7C5CFC',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          浏览模板
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 12
        }}
      >
        {COURSES.map((c) => {
          const lv = LEVEL_STYLE[c.level]
          return (
            <div
              key={c.title}
              style={{
                background: '#fff',
                border: '1px solid #E5E6EB',
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#F1EDFF',
                    color: '#7C5CFC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <Icon name={c.icon} size={18} strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2329' }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: '#8A8F99', marginTop: 2 }}>约 {c.minutes} 分钟</div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: lv.bg,
                    color: lv.fg
                  }}
                >
                  {c.level}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#51565D', lineHeight: 1.6, minHeight: 58 }}>
                {c.description}
              </div>
              <button
                type="button"
                onClick={() => navigate(c.to)}
                style={{
                  height: 28,
                  borderRadius: 6,
                  border: '1px solid #7C5CFC',
                  background: '#F1EDFF',
                  color: '#7C5CFC',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                开始学习 →
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
