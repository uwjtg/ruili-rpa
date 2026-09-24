import type { JSX } from 'react'
import PlaceholderView from './PlaceholderView'

/** 机器人视图（阶段 4 起实现：本机运行器、托盘、执行记录） */
export default function RobotsView(): JSX.Element {
  return (
    <PlaceholderView
      icon="robot"
      title="机器人"
      desc="阶段 4 起实现：本机运行器（托盘/静默）、执行记录与日志落盘"
    />
  )
}
