/**
 * 桌面自动化指令（M3 切片 1 POC + 切片 3 录制回放）。
 *
 *  pickElement  拾取元素后点击：按拾取结果（target JSON，来自拾取按钮/手填）
 *  在运行时用 UIA 重新定位控件并点击其中心（选择器回退链 strict→property→
 *  ancestor→index→coords）。
 *  typeText     输入文本：SendInput Unicode 逐字符输入到当前焦点窗口（布局无关）。
 *  scroll       滚动鼠标：在目标控件中心（target 可空，回退到坐标/当前光标）滚轮。
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
  clickElement(target: PickedElement, retries?: number): Promise<{
    ok: boolean
    /** 命中的回退链策略（strict/property/ancestor/index/coords） */
    strategy?: string
    error?: string
  }>
  /** 输入文本：Unicode 逐字符发送到当前焦点窗口 */
  typeText(text: string): Promise<{ ok: boolean; error?: string }>
  /** 滚动鼠标：在目标控件中心（target 可空 → 坐标 / 当前光标位置）滚轮 */
  scroll(opts: {
    target?: PickedElement | null
    x?: number
    y?: number
    delta: number
  }): Promise<{ ok: boolean; error?: string }>
  /** 元素 dry-run：只定位不点击（元素库「校验」） */
  locateElement(target: PickedElement): Promise<{
    ok: boolean
    found?: boolean
    strategy?: string
    error?: string
  }>
  /** 按下并释放一个按键/组合键（"Enter" / "Control+A"，M3 切片 4） */
  pressKey(keys: string): Promise<{ ok: boolean; error?: string }>
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
      },
      {
        key: 'retries',
        label: '定位失败重试次数',
        type: 'number',
        placeholder: '回放稳定性：定位不到时重试几次（默认 2，共 3 次尝试）'
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
      const retriesRaw = p.retries === undefined || p.retries === null ? '' : String(p.retries)
      const retries = retriesRaw === '' ? 2 : Math.max(0, Math.min(5, Number(retriesRaw) || 0))
      ctx.log('info', `按选择器定位并点击元素：${label}（重试上限 ${retries} 次）`)
      const r = await desktop.clickElement(target, retries)
      if (!r.ok) {
        throw new Error(`点击元素失败：${r.error ?? '未知错误'}`)
      }
      const strategy = r.strategy ?? 'property'
      ctx.log('success', `已点击元素「${label}」（定位策略：${strategy}）`)
      return target
    }
  })

  registry.register({
    id: 'typeText',
    name: '输入文本',
    group: '桌面',
    icon: 'type',
    params: [
      {
        key: 'text',
        label: '文本内容',
        type: 'text',
        placeholder: '要输入的文本（支持 ${变量}）'
      }
    ],
    summary: (p) => {
      const text = typeof p.text === 'string' ? p.text : String(p.text ?? '')
      return text ? `输入文本「${text}」` : '输入文本（未配置）'
    },
    runner: async (ctx, p) => {
      const text =
        typeof p.text === 'string' ? ctx.interpolate(p.text) : String(p.text ?? '')
      if (!text) {
        throw new Error('typeText 缺少有效的 text 参数')
      }
      ctx.log('info', `向当前焦点窗口输入文本：${text}`)
      const r = await desktop.typeText(text)
      if (!r.ok) {
        throw new Error(`输入文本失败：${r.error ?? '未知错误'}`)
      }
      ctx.log('success', `已输入文本「${text}」`)
      return { text }
    }
  })

  registry.register({
    id: 'scroll',
    name: '滚动鼠标',
    group: '桌面',
    icon: 'scroll',
    params: [
      {
        key: 'target',
        label: '元素选择器 (JSON)',
        type: 'text',
        placeholder: '留空 = 在当前光标位置滚动；录制会带出滚动位置元素'
      },
      {
        key: 'delta',
        label: '滚动量（正=向上）',
        type: 'number',
        default: 120
      }
    ],
    summary: (p) => {
      const t = parseTargetParam(p.target)
      const label = targetLabel(t)
      return label
        ? `滚动「${label}」（${String(p.delta ?? 120)}）`
        : `滚动鼠标（${String(p.delta ?? 120)}）`
    },
    runner: async (ctx, p) => {
      const raw =
        typeof p.target === 'string' ? ctx.interpolate(p.target) : p.target
      const target = parseTargetParam(raw)
      // M3 切片 11：delta / x / y 可能是 ${var} 引用（录制参数化），先插值
      const deltaRaw = typeof p.delta === 'string' ? ctx.interpolate(p.delta) : p.delta
      const delta = Math.trunc(Number(deltaRaw ?? 120))
      if (!Number.isFinite(delta)) {
        throw new Error('scroll 的 delta 参数无效')
      }
      // 录制坐标兜底：target 为空时回退到录制位置的屏幕坐标
      const xRaw = typeof p.x === 'string' ? ctx.interpolate(p.x) : p.x
      const yRaw = typeof p.y === 'string' ? ctx.interpolate(p.y) : p.y
      const x = xRaw != null && xRaw !== '' ? Math.trunc(Number(xRaw)) : undefined
      const y = yRaw != null && yRaw !== '' ? Math.trunc(Number(yRaw)) : undefined
      ctx.log('info', `滚动鼠标（${delta > 0 ? '向上' : '向下'} ${Math.abs(delta)}）`)
      const r = await desktop.scroll({ target, delta, x, y })
      if (!r.ok) {
        throw new Error(`滚动失败：${r.error ?? '未知错误'}`)
      }
      ctx.log('success', `已滚动鼠标（${delta > 0 ? '向上' : '向下'} ${Math.abs(delta)}）`)
      return { delta }
    }
  })

  registry.register({
    id: 'pressKey',
    name: '按键 / 快捷键',
    group: '桌面',
    icon: 'keyboard',
    params: [
      {
        key: 'keys',
        label: '按键组合',
        type: 'text',
        placeholder: '如 Enter、Tab、Backspace、Control+A、Ctrl+Shift+S（支持 ${变量}）'
      }
    ],
    summary: (p) => {
      const keys = typeof p.keys === 'string' ? p.keys : String(p.keys ?? '')
      return keys ? `按键 ${keys}` : '按键 / 快捷键（未配置）'
    },
    runner: async (ctx, p) => {
      const keys =
        typeof p.keys === 'string' ? ctx.interpolate(p.keys) : String(p.keys ?? '')
      if (!keys) {
        throw new Error('pressKey 缺少有效的 keys 参数')
      }
      ctx.log('info', `按下按键/快捷键：${keys}`)
      const r = await desktop.pressKey(keys)
      if (!r.ok) {
        throw new Error(`按键失败：${r.error ?? '未知错误'}`)
      }
      ctx.log('success', `已按下按键/快捷键：${keys}`)
      return { keys }
    }
  })
}
