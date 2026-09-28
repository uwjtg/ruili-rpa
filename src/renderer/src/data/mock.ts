/**
 * 首页·工作台静态配置（快捷入口 / 图表档位）。
 * P1 修复后：统计指标、折线、企业概览、最近运行均改为 SQLite 真实数据，
 * 见 views/HomeView.tsx 与 data/homeStats.ts；本文件不再保留任何演示数值。
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

export const CHART_RANGES = ['近一周', '近一月', '近一年'] as const
