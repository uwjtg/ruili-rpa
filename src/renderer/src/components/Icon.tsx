import type { JSX } from 'react'
import { ICON_PATHS, FALLBACK_ICON } from './iconPaths'

export interface IconProps {
  name: string
  size?: number
  strokeWidth?: number
  className?: string
  /** 提供 title 时作为可访问图标（role="img" + aria-label），否则纯装饰隐藏 */
  title?: string
}

/** 自绘线性 SVG 图标：24 viewBox / 描边 1.7-1.9 / currentColor / 圆角端点 */
export default function Icon({
  name,
  size = 16,
  strokeWidth = 1.7,
  className,
  title
}: IconProps): JSX.Element {
  const inner = ICON_PATHS[name] ?? ICON_PATHS[FALLBACK_ICON]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* 路径数据来自本仓库静态常量，无外部输入 */}
      <g dangerouslySetInnerHTML={{ __html: inner }} />
    </svg>
  )
}
