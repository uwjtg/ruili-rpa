import type { JSX } from 'react'
import PlaceholderView from './PlaceholderView'

/** 触发器·计划任务视图（阶段 4 起实现：cron/间隔、热键、文件监听） */
export default function TriggersView(): JSX.Element {
  return (
    <PlaceholderView
      icon="trigger"
      title="触发器 · 计划任务"
      desc="阶段 4 起实现：计划任务（cron/间隔）、热键触发、文件监听与执行记录"
    />
  )
}
