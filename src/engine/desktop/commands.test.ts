import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import {
  registerDesktopCommands,
  parseTargetParam,
  targetLabel,
  type DesktopLike
} from './commands'
import type { RunContext } from '../core/context'
import type { PickedElement } from '../../shared/desktop-pick'

function makeCtx(): { ctx: RunContext; vars: Map<string, unknown>; logs: string[] } {
  const vars = new Map<string, unknown>()
  const logs: string[] = []
  const ctx: RunContext = {
    getVar: <T,>(n: string) => vars.get(n) as T | undefined,
    setVar: (n, v) => vars.set(n, v),
    log: (_level, message) => logs.push(message),
    execChildren: async () => {},
    isCancelled: () => false,
    interpolate: (t) => t.replace(/\$\{([^}]+)\}/g, (_m, p) => String(vars.get(p) ?? ''))
  }
  return { ctx, vars, logs }
}

const ELEMENT: PickedElement = {
  windowHandle: 123,
  automationId: 'btn_ok',
  name: '确定',
  controlType: 'ButtonControl',
  className: 'Button',
  boundingBox: { x: 10, y: 20, width: 100, height: 30 }
}

function fakeDesktop() {
  const clickElement = vi.fn(
    async (): Promise<{ ok: boolean; strategy?: string; error?: string }> => ({
      ok: true
    })
  )
  const desktop: DesktopLike = { clickElement }
  return { desktop, clickElement }
}

describe('desktop 指令（stub 回放客户端）', () => {
  it('注册 pickElement 指令（桌面分组）', () => {
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop: fakeDesktop().desktop })
    const cmd = reg.get('pickElement')
    expect(cmd).toBeDefined()
    expect(cmd?.group).toBe('桌面')
    expect(cmd?.params.map((p) => p.key)).toEqual(['target'])
  })

  it('pickElement 用 JSON target 调回放并成功', async () => {
    const { desktop, clickElement } = fakeDesktop()
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx, logs } = makeCtx()

    const cmd = reg.get('pickElement')!
    const result = await cmd.runner(
      ctx,
      { target: JSON.stringify(ELEMENT) },
      { id: 's1', cmdId: 'pickElement', params: {} }
    )
    expect(clickElement).toHaveBeenCalledWith(ELEMENT)
    expect(result).toEqual(ELEMENT)
    expect(logs.some((l) => l.includes('已点击元素「确定」'))).toBe(true)
  })

  it('pickElement 支持 ${var} 插值 target', async () => {
    const { desktop, clickElement } = fakeDesktop()
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx, vars } = makeCtx()
    vars.set('sel', JSON.stringify(ELEMENT))

    await reg.get('pickElement')!.runner(
      ctx,
      { target: '${sel}' },
      { id: 's1', cmdId: 'pickElement', params: {} }
    )
    expect(clickElement).toHaveBeenCalledWith(ELEMENT)
  })

  it('target 非法时抛错', async () => {
    const { desktop } = fakeDesktop()
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx } = makeCtx()

    const cmd = reg.get('pickElement')!
    await expect(
      cmd.runner(ctx, { target: 'not-json' }, { id: 's1', cmdId: 'pickElement', params: {} })
    ).rejects.toThrow(/缺少有效的 target/)
  })

  it('回放失败（ok=false）时抛错带原因', async () => {
    const { desktop, clickElement } = fakeDesktop()
    clickElement.mockResolvedValueOnce({ ok: false, error: '未找到元素' })
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx } = makeCtx()

    const cmd = reg.get('pickElement')!
    await expect(
      cmd.runner(ctx, { target: ELEMENT }, { id: 's1', cmdId: 'pickElement', params: {} })
    ).rejects.toThrow(/未找到元素/)
  })

  it('parseTargetParam / targetLabel 容错', () => {
    expect(parseTargetParam(JSON.stringify(ELEMENT))).toEqual(ELEMENT)
    expect(parseTargetParam(ELEMENT)).toEqual(ELEMENT)
    expect(parseTargetParam('  ')).toBeNull()
    expect(parseTargetParam('x')).toBeNull()
    expect(parseTargetParam(null)).toBeNull()
    expect(targetLabel(ELEMENT)).toBe('确定')
    expect(targetLabel({ ...ELEMENT, name: '' })).toBe('btn_ok')
    expect(targetLabel(null)).toBe('')
  })

  it('回放成功日志带回退链定位策略（默认 property）', async () => {
    const { desktop, clickElement } = fakeDesktop()
    clickElement.mockResolvedValueOnce({ ok: true })
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx, logs } = makeCtx()

    await reg.get('pickElement')!.runner(
      ctx,
      { target: ELEMENT },
      { id: 's1', cmdId: 'pickElement', params: {} }
    )
    expect(logs.some((l) => l.includes('定位策略：property'))).toBe(true)
  })

  it('回放成功日志带上报策略（如 ancestor）', async () => {
    const { desktop, clickElement } = fakeDesktop()
    clickElement.mockResolvedValueOnce({ ok: true, strategy: 'ancestor' })
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx, logs } = makeCtx()

    await reg.get('pickElement')!.runner(
      ctx,
      { target: ELEMENT },
      { id: 's1', cmdId: 'pickElement', params: {} }
    )
    expect(logs.some((l) => l.includes('定位策略：ancestor'))).toBe(true)
  })

  it('targetLabel 优先 windowTitle 兜底', () => {
    expect(
      targetLabel({ ...ELEMENT, name: '', automationId: '', windowTitle: '主窗口' })
    ).toBe('主窗口')
  })
})
