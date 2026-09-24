/**
 * 桌面自动化指令（M3 切片 1 POC）。
 *
 *  pickElement  拾取元素后点击：按拾取结果（target JSON，来自拾取按钮/手填）
 *  在运行时用 UIA 重新定位控件并点击其中心。
 *
 * target 形状 = src/shared/desktop-pick.ts 的 PickedElement：
 *   {windowHandle, automationId, name, controlType, className, boundingBox}
 * runner 依赖注入 desktop（默认真实 SidecarClient），测试用 stub。
 */

import type { RegisteredCommand } from '../commands/registry'
import type { PickedElement } from '../../shared/desktop-pick'
import { SidecarClient } from '../sidecar/client'

type RegistryLike = { register(c: RegisteredCommand): void }

/** 最小回放客户端接口（测试可注入 stub；SidecarClient 天然实现） */
export interface DesktopLike {
  clickElement(target: PickedElement): Promise<{
    ok: boolean
    /** 命中的回退链策略（strict/property/ancestor/index/coords） */
    strategy?: string
    error?: string
  }>
}

export interface DesktopCommandsDeps {
  desktop?: DesktopLike
}

/** 解析 target 参数：接受已解析对象或 JSON 字符串；非法返回 null */
export function parseTargetParam(raw: unknown): PickedElement | null {
  if (raw == null) return null
  if (typeof raw === 'object') return raw as PickedElement
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return null
    try {
      const obj = JSON.parse(text) as unknown
      return obj && typeof obj === 'object' ? (obj as PickedElement) : null
    } catch {
      return null
    }
  }
  return null
}

/** 摘要展示：优先 name，其次 automationId / 窗口标题 / 控件类型 */
export function targetLabel(target: PickedElement | null): string {
  if (!target) return ''
  return (
    target.name ||
    target.automationId ||
    target.windowTitle ||
    target.controlType ||
    ''
  )
}

export function registerDesktopCommands(
  registry: RegistryLike,
  deps: DesktopCommandsDeps = {}
): void {
  const desktop: DesktopLike = deps.desktop ?? new SidecarClient()

  registry.register({
    id: 'pickElement',
    name: '拾取元素后点击',
    group: '桌面',
    icon: 'target',
    params: [
      {
        key: 'target',
        label: '元素选择器 (JSON)',
        type: 'text',
        placeholder:
          '点工具栏「拾取」自动填充；或手填 {"windowHandle":…,"automationId":…,"name":…,"controlType":…}'
      }
    ],
    summary: (p) => {
      const t = parseTargetParam(p.target)
      const label = targetLabel(t)
      return label ? `点击元素「${label}」` : '拾取元素（未配置）'
    },
    runner: async (ctx, p) => {
      const raw =
        typeof p.target === 'string' ? ctx.interpolate(p.target) : p.target
      const target = parseTargetParam(raw)
      if (!target) {
        throw new Error('pickElement 缺少有效的 target（JSON）参数')
      }
      const label = targetLabel(target) || '未知元素'
      ctx.log('info', `按选择器定位并点击元素：${label}`)
      const r = await desktop.clickElement(target)
      if (!r.ok) {
        throw new Error(`点击元素失败：${r.error ?? '未知错误'}`)
      }
      const strategy = r.strategy ?? 'property'
      ctx.log('success', `已点击元素「${label}」（定位策略：${strategy}）`)
      return target
    }
  })
}
