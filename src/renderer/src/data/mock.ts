/**
 * 首页·工作台演示数据（迁移自原型 JS 常量 + 首页渲染数据）。
 * 阶段 1 为演示占位数据，独立于此文件，后续接真实数据时只改本文件。
 */

export interface QuickEntry {
  key: string
  name: string
  desc: string
  color: string
  icon: string
  /** 点击跳转路由 */
  to: string
}

export const QUICK_ENTRIES: QuickEntry[] = [
  { key: 'new', name: '新建应用', desc: '从空白或模板开始', color: '#E64340', icon: 'copy', to: '/apps' },
  { key: 'market', name: '指令市场', desc: '安装社区成熟模板', color: '#7C5CFC', icon: 'bag', to: '/market' },
  { key: 'tasks', name: '调度中心', desc: '计划任务与触发器', color: '#0E9384', icon: 'clock', to: '/triggers' },
  { key: 'robots', name: '机器人管理', desc: '本机与云端执行器', color: '#2F80ED', icon: 'robot', to: '/robots' }
]

export interface StatItem {
  label: string
  value: string
  unit: string
}

/** 4 项统计指标（带单位：个/小时/次/天） */
export const HOME_STATS: StatItem[] = [
  { label: '我的应用', value: '6', unit: '个' },
  { label: '累计运行时长', value: '368', unit: '小时' },
  { label: '运行次数', value: '1,284', unit: '次' },
  { label: '已节省人力', value: '46', unit: '天' }
]

export interface ChartPoint {
  date: string
  value: number
}

/** 应用累计运行时长（近一周演示数据，趋势与原型折线一致：逐日上升） */
export const RUNTIME_CHART: ChartPoint[] = [
  { date: '09-16', value: 12 },
  { date: '09-17', value: 22 },
  { date: '09-18', value: 40 },
  { date: '09-19', value: 52 },
  { date: '09-20', value: 80 },
  { date: '09-21', value: 102 },
  { date: '09-22', value: 120 }
]

export const CHART_RANGES = ['近一周', '近一月', '近一年'] as const

export interface OrgOverviewRow {
  k: string
  v: string
  link?: boolean
}

export const ORG_OVERVIEW: OrgOverviewRow[] = [
  { k: '版本', v: '社区版 · 5.2.1' },
  { k: '账号', v: '演示用户' },
  { k: '在线机器人', v: '2 / 3' },
  { k: '增值服务余额', v: '充值 / 购买', link: true },
  { k: '专属顾问', v: '联系专属顾问', link: true }
]

export interface MemberActivity {
  time: string
  text: string
}

export const MEMBER_ACTIVITY: MemberActivity[] = [
  { time: '3 小时前', text: '系统 完成了计划任务「早间比价巡检」' },
  { time: '1 小时前', text: '王芳 新建了应用「发票识别归档」' },
  { time: '42 分钟前', text: '林悦 运行了「招聘信息采集」· 成功' },
  { time: '19 分钟前', text: '张伟 编辑了应用「电商比价监控」' }
]
