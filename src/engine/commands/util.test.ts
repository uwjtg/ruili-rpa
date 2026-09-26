import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CommandRegistry } from '../commands/registry'
import { registerUtilCommands, registerFileExtraCommands } from './util'
import type { RunContext } from '../core/context'

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

describe('util 指令注册', () => {
  it('注册 16 条', () => {
    const reg = new CommandRegistry()
    registerUtilCommands(reg)
    const ids = reg.list().map((c) => c.id).sort()
    expect(ids).toEqual(
      [
        'copyFile', 'createFolder', 'deleteFile',
        'httpPost',
        'jsonStringify', 'listFiles', 'listJoin', 'listLength',
        'notifyDingTalk', 'notifyFeishu', 'notifyWebhook',
        'nowIso', 'readTextFile', 'regexExtract', 'stringConcat', 'writeTextFile'
      ].sort()
    )
  })
})

describe('文件指令（临时目录）', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'rui-util-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('writeTextFile 写入并 readTextFile 读回', async () => {
    const reg = new CommandRegistry()
    registerUtilCommands(reg)
    const { ctx, vars } = makeCtx()
    const file = path.join(dir, 'a.txt')
    vars.set('name', 'world')
    await reg.get('writeTextFile')!.runner(ctx, { path: file, content: 'hello ${name}', append: false }, undefined as any)
    await reg.get('readTextFile')!.runner(ctx, { path: file, resultVar: 'out', encoding: 'utf-8' }, undefined as any)
    expect(vars.get('out')).toBe('hello world')
  })

  it('listFiles 列出目录', async () => {
    writeFileSync(path.join(dir, 'x.txt'), 'x')
    writeFileSync(path.join(dir, 'y.txt'), 'y')
    const reg = new CommandRegistry()
    registerUtilCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('listFiles')!.runner(ctx, { dir, resultVar: 'files' }, undefined as any)
    expect((vars.get('files') as string[]).sort()).toEqual(['x.txt', 'y.txt'])
  })

  it('createFolder / copyFile / deleteFile', async () => {
    const reg = new CommandRegistry()
    registerUtilCommands(reg)
    const { ctx } = makeCtx()
    const sub = path.join(dir, 'sub')
    await reg.get('createFolder')!.runner(ctx, { path: sub }, undefined as any)
    expect(existsSync(sub)).toBe(true)
    const src = path.join(dir, 'src.txt')
    writeFileSync(src, 'data')
    const dst = path.join(sub, 'dst.txt')
    await reg.get('copyFile')!.runner(ctx, { src, dest: dst }, undefined as any)
    expect(readFileSync(dst, 'utf-8')).toBe('data')
    await reg.get('deleteFile')!.runner(ctx, { path: src }, undefined as any)
    expect(existsSync(src)).toBe(false)
  })
})

describe('数据处理指令', () => {
  it('listLength / listJoin', async () => {
    const reg = new CommandRegistry()
    registerUtilCommands(reg)
    const { ctx, vars } = makeCtx()
    vars.set('items', ['a', 'b', 'c'])
    await reg.get('listLength')!.runner(ctx, { listVar: 'items', resultVar: 'n' }, undefined as any)
    expect(vars.get('n')).toBe(3)
    await reg.get('listJoin')!.runner(ctx, { listVar: 'items', separator: '-', resultVar: 's' }, undefined as any)
    expect(vars.get('s')).toBe('a-b-c')
  })

  it('stringConcat 插值', async () => {
    const reg = new CommandRegistry()
    registerUtilCommands(reg)
    const { ctx, vars } = makeCtx()
    vars.set('who', 'RPA')
    await reg.get('stringConcat')!.runner(ctx, { a: '你好 ', b: '${who}', resultVar: 'greet' }, undefined as any)
    expect(vars.get('greet')).toBe('你好 RPA')
  })

  it('regexExtract 取第一个捕获组', async () => {
    const reg = new CommandRegistry()
    registerUtilCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('regexExtract')!.runner(ctx, {
      source: '订单号 12345 已发货',
      pattern: '订单号 (\\d+)',
      resultVar: 'oid'
    }, undefined as any)
    expect(vars.get('oid')).toBe('12345')
  })

  it('jsonStringify', async () => {
    const reg = new CommandRegistry()
    registerUtilCommands(reg)
    const { ctx, vars } = makeCtx()
    vars.set('obj', { a: 1, b: 'x' })
    await reg.get('jsonStringify')!.runner(ctx, { sourceVar: 'obj', resultVar: 's' }, undefined as any)
    expect(vars.get('s')).toBe('{"a":1,"b":"x"}')
  })

  it('nowIso 返回 ISO 字符串', async () => {
    const reg = new CommandRegistry()
    registerUtilCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('nowIso')!.runner(ctx, { resultVar: 't' }, undefined as any)
    expect(String(vars.get('t'))).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('网络/通知指令（mock fetch）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: any) => ({
      status: 200,
      text: async () => JSON.stringify({ ok: true, url, body: opts?.body })
    })))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('httpPost 把响应存变量', async () => {
    const reg = new CommandRegistry()
    registerUtilCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('httpPost')!.runner(ctx, { url: 'https://x/api', body: '{"a":1}', resultVar: 'resp' }, undefined as any)
    expect(typeof vars.get('resp')).toBe('string')
  })

  it('notifyDingTalk / notifyFeishu / notifyWebhook 都调 fetch', async () => {
    const reg = new CommandRegistry()
    registerUtilCommands(reg)
    const { ctx } = makeCtx()
    await reg.get('notifyWebhook')!.runner(ctx, { url: 'https://hook', text: 'hi' }, undefined as any)
    await reg.get('notifyDingTalk')!.runner(ctx, { webhook: 'https://ding', title: 't', text: 'c' }, undefined as any)
    await reg.get('notifyFeishu')!.runner(ctx, { webhook: 'https://fs', text: 'c' }, undefined as any)
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })
})

describe('M7-13 文件扩展', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'rui-util2-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('fileExists / folderExists', async () => {
    const reg = new CommandRegistry()
    registerUtilCommands(reg)
    registerFileExtraCommands(reg)
    const { ctx, vars } = makeCtx()
    const f = path.join(dir, 'x.txt')
    writeFileSync(f, 'x')
    await reg.get('fileExists')!.runner(ctx, { path: f, resultVar: 'e' }, undefined as any)
    expect(vars.get('e')).toBe(true)
    await reg.get('folderExists')!.runner(ctx, { path: dir, resultVar: 'd' }, undefined as any)
    expect(vars.get('d')).toBe(true)
  })

  it('fileSize / moveFile / readJsonFile / writeJsonFile', async () => {
    const reg = new CommandRegistry()
    registerUtilCommands(reg)
    registerFileExtraCommands(reg)
    const { ctx, vars } = makeCtx()
    const src = path.join(dir, 'a.json')
    vars.set('obj', { hello: 'world', n: 1 })
    await reg.get('writeJsonFile')!.runner(ctx, { path: src, sourceVar: 'obj', pretty: true }, undefined as any)
    expect(statSync(src).size).toBeGreaterThan(0)
    await reg.get('fileSize')!.runner(ctx, { path: src, resultVar: 's' }, undefined as any)
    expect(vars.get('s')).toBeGreaterThan(0)
    await reg.get('readJsonFile')!.runner(ctx, { path: src, resultVar: 'o' }, undefined as any)
    expect(vars.get('o')).toEqual({ hello: 'world', n: 1 })
    const dst = path.join(dir, 'b.json')
    await reg.get('moveFile')!.runner(ctx, { src, dest: dst }, undefined as any)
    expect(existsSync(dst)).toBe(true)
    expect(existsSync(src)).toBe(false)
  })
})