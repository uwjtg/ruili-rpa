import type { JSX } from 'react'
import Icon from '../components/Icon'

interface PlaceholderViewProps {
  icon: string
  title: string
  desc: string
}

/** 通用占位视图（阶段 1：首页之外均为占位；后续阶段逐个替换为真实视图） */
export default function PlaceholderView({ icon, title, desc }: PlaceholderViewProps): JSX.Element {
  return (
    <div className="view placeholder-view">
      <div className="empty-hint">
        <div className="eh-icon">
          <Icon name={icon} size={22} />
        </div>
        <b>{title}</b>
        <div>{desc}</div>
      </div>
    </div>
  )
}
