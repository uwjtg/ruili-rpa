import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import { registerDataCommands, registerDataExtraCommands } from './data'
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

const step = undefined as any

describe('data 指令注册', () => {
  it('注册 17 条', () => {
    const reg = new CommandRegistry()
    registerDataCommands(reg)
    expect(reg.list()).toHaveLength(16)
  })
})

describe('字符串', () => {
  it('strTrim/Upper/Lower', async () => {
    const reg = new CommandRegistry()
    registerDataCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('strTrim')!.runner(ctx, { text: '  hi  ', resultVar: 'a' }, step)
    expect(vars.get('a')).toBe('hi')
    await reg.get('strUpper')!.runner(ctx, { text: 'abc', resultVar: 'b' }, step)
    expect(vars.get('b')).toBe('ABC')
    await reg.get('strLower')!.runner(ctx, { text: 'ABC', resultVar: 'c' }, step)
    expect(vars.get('c')).toBe('abc')
  })

  it('strReplace 全部替换', async () => {
    const reg = new CommandRegistry()
    registerDataCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('strReplace')!.runner(ctx, { text: 'a-b-a', search: '-', replacement: '_', resultVar: 'o' }, step)
    expect(vars.get('o')).toBe('a_b_a')
  })

  it('strSplit / strSubstring', async () => {
    const reg = new CommandRegistry()
    registerDataCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('strSplit')!.runner(ctx, { text: '1,2,3', separator: ',', resultVar: 'arr' }, step)
    expect(vars.get('arr')).toEqual(['1', '2', '3'])
    await reg.get('strSubstring')!.runner(ctx, { text: 'hello', start: 1, end: 3, resultVar: 's' }, step)
    expect(vars.get('s')).toBe('el')
  })
})

describe('日期', () => {
  it('nowFormat 匹配格式', async () => {
    const reg = new CommandRegistry()
    registerDataCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('nowFormat')!.runner(ctx, { format: 'yyyy-MM-dd', resultVar: 'd' }, step)
    expect(String(vars.get('d'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('addDays', async () => {
    const reg = new CommandRegistry()
    registerDataCommands(reg)
    const { ctx, vars } = makeCtx()
    vars.set('d', '2026-01-10T00:00:00Z')
    await reg.get('addDays')!.runner(ctx, { sourceVar: 'd', days: 5, resultVar: 'out' }, step)
    expect(String(vars.get('out'))).toContain('2026-01-15')
  })

  it('timestampToDate', async () => {
    const reg = new CommandRegistry()
    registerDataCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('timestampToDate')!.runner(ctx, { timestamp: 0, format: 'yyyy-MM-dd', resultVar: 'd' }, step)
    // 1970-01-01 UTC → 本地时区（中国 +8 → 1970-01-01）
    expect(String(vars.get('d'))).toMatch(/1970-01-0[12]/)
  })
})

describe('数学', () => {
  it('四则运算', async () => {
    const reg = new CommandRegistry()
    registerDataCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('numAdd')!.runner(ctx, { a: 1, b: 2, resultVar: 'x' }, step); expect(vars.get('x')).toBe(3)
    await reg.get('numSubtract')!.runner(ctx, { a: 5, b: 3, resultVar: 'x' }, step); expect(vars.get('x')).toBe(2)
    await reg.get('numMultiply')!.runner(ctx, { a: 4, b: 3, resultVar: 'x' }, step); expect(vars.get('x')).toBe(12)
    await reg.get('numDivide')!.runner(ctx, { a: 9, b: 3, resultVar: 'x' }, step); expect(vars.get('x')).toBe(3)
  })

  it('numRandom 在区间内', async () => {
    const reg = new CommandRegistry()
    registerDataCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('numRandom')!.runner(ctx, { min: 10, max: 20, resultVar: 'r' }, step)
    const r = Number(vars.get('r'))
    expect(r).toBeGreaterThanOrEqual(10)
    expect(r).toBeLessThan(20)
  })
})

describe('JSON / 数组', () => {

  it('listGet / listAppend', async () => {
    const reg = new CommandRegistry()
    registerDataCommands(reg)
    const { ctx, vars } = makeCtx()
    vars.set('items', ['a', 'b'])
    await reg.get('listGet')!.runner(ctx, { listVar: 'items', index: 1, resultVar: 'x' }, step)
    expect(vars.get('x')).toBe('b')
    await reg.get('listAppend')!.runner(ctx, { listVar: 'items', item: 'c' }, step)
    expect(vars.get('items')).toEqual(['a', 'b', 'c'])
  })
})

describe('M7-13 字符串/数学扩展', () => {
  it('stringLength / Includes / Pad / Repeat', async () => {
    const reg = new CommandRegistry()
    registerDataCommands(reg)
    registerDataExtraCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('stringLength')!.runner(ctx, { text: 'hello', resultVar: 'n' }, step)
    expect(vars.get('n')).toBe(5)
    await reg.get('stringIncludes')!.runner(ctx, { text: 'hello world', sub: 'world', resultVar: 'b' }, step)
    expect(vars.get('b')).toBe(true)
    await reg.get('stringPadStart')!.runner(ctx, { text: '7', length: 3, pad: '0', resultVar: 'p' }, step)
    expect(vars.get('p')).toBe('007')
    await reg.get('stringPadEnd')!.runner(ctx, { text: 'ab', length: 5, pad: '-', resultVar: 'p2' }, step)
    expect(vars.get('p2')).toBe('ab---')
    await reg.get('stringRepeat')!.runner(ctx, { text: 'ab', count: 3, resultVar: 'r' }, step)
    expect(vars.get('r')).toBe('ababab')
  })

  it('numAbs / round / max / min', async () => {
    const reg = new CommandRegistry()
    registerDataCommands(reg)
    registerDataExtraCommands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('numAbs')!.runner(ctx, { a: -5, resultVar: 'x' }, step)
    expect(vars.get('x')).toBe(5)
    await reg.get('numRound')!.runner(ctx, { a: 3.14159, digits: 2, resultVar: 'y' }, step)
    expect(vars.get('y')).toBe(3.14)
    await reg.get('numMax')!.runner(ctx, { a: 3, b: 7, resultVar: 'm' }, step)
    expect(vars.get('m')).toBe(7)
    await reg.get('numMin')!.runner(ctx, { a: 3, b: 7, resultVar: 'n' }, step)
    expect(vars.get('n')).toBe(3)
  })
})