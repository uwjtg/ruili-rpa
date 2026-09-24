import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import { registerSidecarCommands, type SidecarLike } from './commands'
import type { RunContext } from '../core/context'

function makeCtx(): { ctx: RunContext; vars: Map<string, unknown> } {
  const vars = new Map<string, unknown>()
  const ctx: RunContext = {
    getVar: <T,>(n: string) => vars.get(n) as T | undefined,
    setVar: (n, v) => vars.set(n, v),
    log: () => {},
    execChildren: async () => {},
    isCancelled: () => false,
    interpolate: (t) => t
  }
  return { ctx, vars }
}

function fakeClient() {
  const ocr = vi.fn(async () => ({ ok: true, text: '识别结果' }))
  const client: SidecarLike = {
    start: vi.fn(async () => ({
      version: '0.1.0',
      engines: { ocr: false, cv2: false }
    })),
    ocr,
    stop: vi.fn(),
    isRunning: () => true
  }
  return { client, ocr }
}

describe('sidecar 指令（stub 客户端）', () => {
  it('注册 3 条 sidecar 指令', () => {
    const reg = new CommandRegistry()
    registerSidecarCommands(reg, { client: fakeClient().client })
    expect(reg.list().map((c) => c.id).sort()).toEqual(
      ['sidecarOcr', 'sidecarStart', 'sidecarStop'].sort()
    )
  })

  it('sidecarOcr 把识别文本写入变量', async () => {
    const { client } = fakeClient()
    const reg = new CommandRegistry()
    registerSidecarCommands(reg, { client })
    const { ctx, vars } = makeCtx()

    const cmd = reg.get('sidecarOcr')!
    await cmd.runner(
      ctx,
      { imagePath: 'a.png', resultVar: 'text' },
      { id: 's1', cmdId: 'sidecarOcr', params: {} }
    )
    expect(vars.get('text')).toBe('识别结果')
  })

  it('OCR 引擎不可用（ok=false）时抛错', async () => {
    const { client, ocr } = fakeClient()
    ocr.mockResolvedValueOnce({ ok: false, text: '' })
    const reg = new CommandRegistry()
    registerSidecarCommands(reg, { client })
    const { ctx } = makeCtx()

    const cmd = reg.get('sidecarOcr')!
    await expect(
      cmd.runner(ctx, { imagePath: 'a.png', resultVar: 't' }, {
        id: 's1',
        cmdId: 'sidecarOcr',
        params: {}
      })
    ).rejects.toThrow(/OCR 失败/)
  })
})
