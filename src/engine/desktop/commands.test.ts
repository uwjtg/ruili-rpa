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
  const typeText = vi.fn(async (): Promise<{ ok: boolean; error?: string }> => ({
    ok: true
  }))
  const scroll = vi.fn(
    async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true })
  )
  const locateElement = vi.fn(
    async (): Promise<{ ok: boolean; found?: boolean; strategy?: string; error?: string }> => ({
      ok: true,
      found: true,
      strategy: 'strict'
    })
  )
  const pressKey = vi.fn(
    async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true })
  )
  const desktop: DesktopLike = { clickElement, typeText, scroll, locateElement, pressKey }
  return { desktop, clickElement, typeText, scroll, locateElement, pressKey }
}

describe('desktop 指令（stub 回放客户端）', () => {
  it('注册 pickElement 指令（桌面分组）', () => {
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop: fakeDesktop().desktop })
    const cmd = reg.get('pickElement')
    expect(cmd).toBeDefined()
    expect(cmd?.group).toBe('桌面')
    expect(cmd?.params.map((p) => p.key)).toEqual(['target', 'retries'])
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
    expect(clickElement).toHaveBeenCalledWith(ELEMENT, 2)
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
    expect(clickElement).toHaveBeenCalledWith(ELEMENT, 2)
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

  // ---------- M3 切片 3：typeText / scroll（录制回放指令） ----------

  it('注册 typeText 指令（桌面分组，text 参数）', () => {
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop: fakeDesktop().desktop })
    const cmd = reg.get('typeText')
    expect(cmd).toBeDefined()
    expect(cmd?.group).toBe('桌面')
    expect(cmd?.params.map((p) => p.key)).toEqual(['text'])
  })

  it('typeText 调回放并成功日志', async () => {
    const { desktop, typeText } = fakeDesktop()
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx, logs } = makeCtx()

    const result = await reg.get('typeText')!.runner(
      ctx,
      { text: 'hello' },
      { id: 's1', cmdId: 'typeText', params: {} }
    )
    expect(typeText).toHaveBeenCalledWith('hello')
    expect(result).toEqual({ text: 'hello' })
    expect(logs.some((l) => l.includes('已输入文本「hello」'))).toBe(true)
  })

  it('typeText 支持 ${var} 插值，空文本抛错', async () => {
    const { desktop, typeText } = fakeDesktop()
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx, vars } = makeCtx()
    vars.set('kw', '锐流')

    await reg.get('typeText')!.runner(
      ctx,
      { text: '${kw}' },
      { id: 's1', cmdId: 'typeText', params: {} }
    )
    expect(typeText).toHaveBeenCalledWith('锐流')

    await expect(
      reg.get('typeText')!.runner(ctx, { text: '' }, { id: 's2', cmdId: 'typeText', params: {} })
    ).rejects.toThrow(/缺少有效的 text/)
  })

  it('typeText 回放失败抛错带原因', async () => {
    const { desktop, typeText } = fakeDesktop()
    typeText.mockResolvedValueOnce({ ok: false, error: 'SendInput 失败' })
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx } = makeCtx()

    await expect(
      reg.get('typeText')!.runner(ctx, { text: 'x' }, { id: 's1', cmdId: 'typeText', params: {} })
    ).rejects.toThrow(/SendInput 失败/)
  })

  it('注册 scroll 指令（target/delta 参数，默认 delta=120）', () => {
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop: fakeDesktop().desktop })
    const cmd = reg.get('scroll')
    expect(cmd).toBeDefined()
    expect(cmd?.group).toBe('桌面')
    expect(cmd?.params.map((p) => p.key)).toEqual(['target', 'delta'])
    expect(cmd?.params.find((p) => p.key === 'delta')?.default).toBe(120)
  })

  it('scroll 解析 target JSON 并传 delta（录制坐标兜底）', async () => {
    const { desktop, scroll } = fakeDesktop()
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx, logs } = makeCtx()

    await reg.get('scroll')!.runner(
      ctx,
      {
        target: JSON.stringify(ELEMENT),
        delta: -120,
        x: 200,
        y: 300
      },
      { id: 's1', cmdId: 'scroll', params: {} }
    )
    expect(scroll).toHaveBeenCalledWith({ target: ELEMENT, delta: -120, x: 200, y: 300 })
    expect(logs.some((l) => l.includes('已滚动鼠标'))).toBe(true)
  })

  it('scroll 无 target 时传 undefined 坐标（当前光标滚动）', async () => {
    const { desktop, scroll } = fakeDesktop()
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx } = makeCtx()

    await reg.get('scroll')!.runner(
      ctx,
      { target: '', delta: 120 },
      { id: 's1', cmdId: 'scroll', params: {} }
    )
    expect(scroll).toHaveBeenCalledWith({ target: null, delta: 120, x: undefined, y: undefined })
  })

  it('scroll delta 非法抛错、回放失败抛错', async () => {
    const { desktop, scroll } = fakeDesktop()
    scroll.mockResolvedValueOnce({ ok: false, error: 'scroll_failed' })
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx } = makeCtx()

    await expect(
      reg.get('scroll')!.runner(ctx, { delta: 'abc' }, { id: 's1', cmdId: 'scroll', params: {} })
    ).rejects.toThrow(/delta/)
    await expect(
      reg.get('scroll')!.runner(ctx, { delta: 120 }, { id: 's2', cmdId: 'scroll', params: {} })
    ).rejects.toThrow(/scroll_failed/)
  })

  // ---------- M3 切片 4：pressKey（非文本键/快捷键） ----------

  it('注册 pressKey 指令（桌面分组，keys 参数）', () => {
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop: fakeDesktop().desktop })
    const cmd = reg.get('pressKey')
    expect(cmd).toBeDefined()
    expect(cmd?.group).toBe('桌面')
    expect(cmd?.params.map((p) => p.key)).toEqual(['keys'])
  })

  it('pressKey 调回放并成功日志', async () => {
    const { desktop, pressKey } = fakeDesktop()
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx, logs } = makeCtx()

    const result = await reg.get('pressKey')!.runner(
      ctx,
      { keys: 'Enter' },
      { id: 's1', cmdId: 'pressKey', params: {} }
    )
    expect(pressKey).toHaveBeenCalledWith('Enter')
    expect(result).toEqual({ keys: 'Enter' })
    expect(logs.some((l) => l.includes('已按下按键/快捷键：Enter'))).toBe(true)
  })

  it('pressKey 支持 ${var} 插值，空 keys 抛错', async () => {
    const { desktop, pressKey } = fakeDesktop()
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx, vars } = makeCtx()
    vars.set('k', 'Control+A')

    await reg.get('pressKey')!.runner(
      ctx,
      { keys: '${k}' },
      { id: 's1', cmdId: 'pressKey', params: {} }
    )
    expect(pressKey).toHaveBeenCalledWith('Control+A')

    await expect(
      reg.get('pressKey')!.runner(ctx, { keys: '' }, { id: 's2', cmdId: 'pressKey', params: {} })
    ).rejects.toThrow(/缺少有效的 keys/)
  })

  it('pressKey 回放失败抛错带原因', async () => {
    const { desktop, pressKey } = fakeDesktop()
    pressKey.mockResolvedValueOnce({ ok: false, error: 'SendInput 失败' })
    const reg = new CommandRegistry()
    registerDesktopCommands(reg, { desktop })
    const { ctx } = makeCtx()

    await expect(
      reg.get('pressKey')!.runner(ctx, { keys: 'Tab' }, { id: 's1', cmdId: 'pressKey', params: {} })
    ).rejects.toThrow(/SendInput 失败/)
  })
})
