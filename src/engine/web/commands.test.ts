import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import { registerWebCommands } from './commands'
import type { RunContext } from '../core/context'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 构造一个最小可运行的 RunContext */
function makeCtx(): { ctx: RunContext; vars: Map<string, unknown>; logs: string[] } {
  const vars = new Map<string, unknown>()
  const logs: string[] = []
  const ctx: RunContext = {
    getVar: <T,>(n: string) => vars.get(n) as T | undefined,
    setVar: (n, v) => vars.set(n, v),
    log: (level, msg) => logs.push(`[${level}] ${msg}`),
    execChildren: async () => {},
    isCancelled: () => false,
    interpolate: (t) =>
      t.replace(/\$\{(\w+)\}/g, (_m, n) => String(vars.get(n) ?? ''))
  }
  return { ctx, vars, logs }
}

function fakeSession() {
  return {
    start: vi.fn(async () => {}),
    goto: vi.fn(async () => {}),
    click: vi.fn(async () => {}),
    fill: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    getText: vi.fn(async () => '提取到的文本'),
    getTitle: vi.fn(async () => '页面标题'),
    waitFor: vi.fn(async () => {}),
    eval: vi.fn(async () => []),
    startPagePick: vi.fn(async () => ({ cancelled: true })),
    startWebRecord: vi.fn(async () => {}),
    stopWebRecord: vi.fn(async () => []),
    close: vi.fn(async () => {}),
    isRunning: () => true
  }
}

describe('web 指令（stub 会话）', () => {
  it('注册网页指令', () => {
    const reg = new CommandRegistry()
    registerWebCommands(reg, { session: fakeSession() })
    expect(reg.list().map((c) => c.id).sort()).toEqual(
      [
        'webCloseBrowser',
        'webClick',
        'webExtractText',
        'webInput',
        'webOpenBrowser',
        'webOpenUrl',
        'webScrapeList',
        'webScroll',
        'webWaitFor'
      ].sort()
    )
  })

  it('webOpenUrl 调用 goto 并把标题写入变量', async () => {
    const session = fakeSession()
    const reg = new CommandRegistry()
    registerWebCommands(reg, { session })
    const { ctx, vars } = makeCtx()

    const cmd = reg.get('webOpenUrl')!
    await cmd.runner(ctx, { url: 'https://example.com', titleVar: 'pageTitle' }, {
      id: 's1',
      cmdId: 'webOpenUrl',
      params: {}
    })
    expect(session.goto).toHaveBeenCalledWith('https://example.com')
    expect(vars.get('pageTitle')).toBe('页面标题')
  })

  it('webInput 支持变量插值', async () => {
    const session = fakeSession()
    const reg = new CommandRegistry()
    registerWebCommands(reg, { session })
    const { ctx, vars } = makeCtx()
    vars.set('kw', '锐流')

    const cmd = reg.get('webInput')!
    await cmd.runner(
      ctx,
      { selector: '#q', value: '搜索 ${kw}' },
      { id: 's2', cmdId: 'webInput', params: {} }
    )
    expect(session.fill).toHaveBeenCalledWith('#q', '搜索 锐流')
  })

  it('webExtractText 把文本写入结果变量', async () => {
    const session = fakeSession()
    const reg = new CommandRegistry()
    registerWebCommands(reg, { session })
    const { ctx, vars } = makeCtx()

    const cmd = reg.get('webExtractText')!
    await cmd.runner(
      ctx,
      { selector: 'h1', resultVar: 'title' },
      { id: 's3', cmdId: 'webExtractText', params: {} }
    )
    expect(session.getText).toHaveBeenCalledWith('h1')
    expect(vars.get('title')).toBe('提取到的文本')
  })

  it('webWaitFor 调用 session.waitFor 并传超时', async () => {
    const session = fakeSession()
    const reg = new CommandRegistry()
    registerWebCommands(reg, { session })
    const { ctx } = makeCtx()

    const cmd = reg.get('webWaitFor')!
    await cmd.runner(
      ctx,
      { selector: '#result', timeoutMs: 3000 },
      { id: 's4', cmdId: 'webWaitFor', params: {} }
    )
    expect(session.waitFor).toHaveBeenCalledWith('#result', 3000)
  })
  it('webScrapeList 调页面 eval 取字段并写入结果变量（可选 CSV）', async () => {
    const session = fakeSession()
    const fakeRows = [
      { title: '商品 A', link: '/a' },
      { title: '商品 B', link: '/b' }
    ]
    ;(session.eval as ReturnType<typeof vi.fn>).mockResolvedValue(fakeRows)

    const dir = mkdtempSync(join(tmpdir(), 'ruili-scrape-'))
    const csvPath = join(dir, 'out.csv')

    const reg = new CommandRegistry()
    registerWebCommands(reg, { session })
    const { ctx, vars } = makeCtx()

    const cmd = reg.get('webScrapeList')!
    const fields = [
      { name: 'title', subSelector: '.title' },
      { name: 'link', subSelector: 'a', attr: 'href' }
    ]
    await cmd.runner(
      ctx,
      {
        listSelector: 'div.card',
        fieldsJson: JSON.stringify(fields),
        resultVar: 'rows',
        csvPath,
        maxItems: 0
      },
      { id: 's5', cmdId: 'webScrapeList', params: {} }
    )

    expect(session.eval).toHaveBeenCalledTimes(1)
    const [fnBody, arg] = (session.eval as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(typeof fnBody).toBe('string')
    expect(arg).toMatchObject({ listSelector: 'div.card', fields, maxItems: 0 })
    expect(vars.get('rows')).toEqual(fakeRows)

    expect(existsSync(csvPath)).toBe(true)
    const csv = readFileSync(csvPath, 'utf8')
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('title,link')
    expect(csv).toContain('商品 A,/a')
    rmSync(dir, { recursive: true, force: true })
  })

  it('webScrapeList fieldsJson 非法时抛错', async () => {
    const session = fakeSession()
    const reg = new CommandRegistry()
    registerWebCommands(reg, { session })
    const { ctx } = makeCtx()
    const cmd = reg.get('webScrapeList')!
    await expect(
      cmd.runner(
        ctx,
        { listSelector: 'x', fieldsJson: '{bad', resultVar: 'rows' },
        { id: 's6', cmdId: 'webScrapeList', params: {} }
      )
    ).rejects.toThrow(/字段映射 JSON/)
  })
})
