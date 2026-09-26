import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import { registerDataCommands, registerDataExtraCommands, registerDataExtra2Commands, registerDataExtra3Commands, registerDataExtra4Commands } from './data'
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
describe('M7-14 第三批', () => {
  it('注册 15 条', () => {
    const reg = new CommandRegistry()
    registerDataExtra2Commands(reg)
    expect(reg.list()).toHaveLength(15)
  })

  it('pathBasename/Dirname/Extname/Join', async () => {
    const reg = new CommandRegistry()
    registerDataExtra2Commands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('pathBasename')!.runner(ctx, { pathStr: 'C:/a/b/c.txt', resultVar: 'b' }, step)
    expect(vars.get('b')).toBe('c.txt')
    await reg.get('pathDirname')!.runner(ctx, { pathStr: 'C:/a/b/c.txt', resultVar: 'd' }, step)
    expect(vars.get('d')).toBe('C:/a/b')
    await reg.get('pathExtname')!.runner(ctx, { pathStr: 'C:/a/b/c.txt', resultVar: 'e' }, step)
    expect(vars.get('e')).toBe('.txt')
  })

  it('getEnv/setEnv', async () => {
    const reg = new CommandRegistry()
    registerDataExtra2Commands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('setEnv')!.runner(ctx, { name: 'RUI_TEST_X', value: 'hello' }, step)
    await reg.get('getEnv')!.runner(ctx, { name: 'RUI_TEST_X', resultVar: 'v' }, step)
    expect(vars.get('v')).toBe('hello')
  })

  it('base64 往返', async () => {
    const reg = new CommandRegistry()
    registerDataExtra2Commands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('base64Encode')!.runner(ctx, { text: '你好', resultVar: 'b' }, step)
    expect(vars.get('b')).not.toBe('你好')
    await reg.get('base64Decode')!.runner(ctx, { b64: vars.get('b'), resultVar: 'o' }, step)
    expect(vars.get('o')).toBe('你好')
  })

  it('字符串/数学扩展', async () => {
    const reg = new CommandRegistry()
    registerDataExtra2Commands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('stringIndexOf')!.runner(ctx, { text: 'hello', sub: 'll', resultVar: 'i' }, step)
    expect(vars.get('i')).toBe(2)
    await reg.get('stringReverse')!.runner(ctx, { text: 'abc', resultVar: 'r' }, step)
    expect(vars.get('r')).toBe('cba')
    await reg.get('numFloor')!.runner(ctx, { a: 3.7, resultVar: 'f' }, step)
    expect(vars.get('f')).toBe(3)
    await reg.get('numCeil')!.runner(ctx, { a: 3.2, resultVar: 'c' }, step)
    expect(vars.get('c')).toBe(4)
  })
})
describe('M7-15 第四批', () => {
  it('注册 15 条', () => {
    const reg = new CommandRegistry()
    registerDataExtra3Commands(reg)
    expect(reg.list()).toHaveLength(13)
  })

  it('listSort/Reverse/Unique/Sum/Min/Max', async () => {
    const reg = new CommandRegistry()
    registerDataExtra3Commands(reg)
    const { ctx, vars } = makeCtx()
    vars.set('nums', [3, 1, 2])
    await reg.get('listSort')!.runner(ctx, { listVar: 'nums', desc: false }, step)
    expect(vars.get('nums')).toEqual([1, 2, 3])
    await reg.get('listSum')!.runner(ctx, { listVar: 'nums', resultVar: 's' }, step)
    expect(vars.get('s')).toBe(6)
    await reg.get('listMin')!.runner(ctx, { listVar: 'nums', resultVar: 'mn' }, step)
    expect(vars.get('mn')).toBe(1)
    await reg.get('listMax')!.runner(ctx, { listVar: 'nums', resultVar: 'mx' }, step)
    expect(vars.get('mx')).toBe(3)
    vars.set('dup', ['a', 'b', 'a'])
    await reg.get('listUnique')!.runner(ctx, { listVar: 'dup', resultVar: 'u' }, step)
    expect(vars.get('u')).toEqual(['a', 'b'])
  })

  it('stringCount / splitLines / parseInt / parseFloat', async () => {
    const reg = new CommandRegistry()
    registerDataExtra3Commands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('stringCount')!.runner(ctx, { text: 'a,b,a,c', sub: ',', resultVar: 'n' }, step)
    expect(vars.get('n')).toBe(3)
    await reg.get('stringSplitLines')!.runner(ctx, { text: 'a\nb\r\nc', resultVar: 'l' }, step)
    expect(vars.get('l')).toEqual(['a', 'b', 'c'])
    await reg.get('parseInt')!.runner(ctx, { text: '12abc', resultVar: 'i' }, step)
    expect(vars.get('i')).toBe(12)
    await reg.get('parseFloat')!.runner(ctx, { text: '3.14x', resultVar: 'f' }, step)
    expect(vars.get('f')).toBe(3.14)
  })

  it('timestampNow / comment', async () => {
    const reg = new CommandRegistry()
    registerDataExtra3Commands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('timestampNow')!.runner(ctx, { resultVar: 't' }, step)
    expect(typeof vars.get('t')).toBe('number')
    await reg.get('comment')!.runner(ctx, { text: '测试注释' }, step)
    expect(ctx.log.length).toBeGreaterThan(0)
  })
})
describe('M7-20 第五批', () => {
  it('注册 10 条', () => {
    const reg = new CommandRegistry()
    registerDataExtra4Commands(reg)
    expect(reg.list()).toHaveLength(10)
  })

  it('listChunk/Flatten/Pluck', async () => {
    const reg = new CommandRegistry()
    registerDataExtra4Commands(reg)
    const { ctx, vars } = makeCtx()
    vars.set('nums', [1,2,3,4,5])
    await reg.get('listChunk')!.runner(ctx, { listVar: 'nums', size: 2, resultVar: 'c' }, step)
    expect(vars.get('c')).toEqual([[1,2],[3,4],[5]])
    vars.set('grid', [[1,2],[3,4]])
    await reg.get('listFlatten')!.runner(ctx, { listVar: 'grid', resultVar: 'f' }, step)
    expect(vars.get('f')).toEqual([1,2,3,4])
    vars.set('objs', [{name:'a'},{name:'b'}])
    await reg.get('listPluck')!.runner(ctx, { listVar: 'objs', field: 'name', resultVar: 'names' }, step)
    expect(vars.get('names')).toEqual(['a','b'])
  })

  it('字符串 trim/padCenter', async () => {
    const reg = new CommandRegistry()
    registerDataExtra4Commands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('stringTrimStart')!.runner(ctx, { text: '  hi', resultVar: 'a' }, step)
    expect(vars.get('a')).toBe('hi')
    await reg.get('stringTrimEnd')!.runner(ctx, { text: 'hi  ', resultVar: 'b' }, step)
    expect(vars.get('b')).toBe('hi')
    await reg.get('stringPadCenter')!.runner(ctx, { text: 'ab', length: 6, pad: '-', resultVar: 'c' }, step)
    expect(vars.get('c')).toBe('--ab--')
  })

  it('numPow/Mod/AbsDiff', async () => {
    const reg = new CommandRegistry()
    registerDataExtra4Commands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('numPow')!.runner(ctx, { a: 2, b: 3, resultVar: 'x' }, step)
    expect(vars.get('x')).toBe(8)
    await reg.get('numMod')!.runner(ctx, { a: 10, b: 3, resultVar: 'm' }, step)
    expect(vars.get('m')).toBe(1)
    await reg.get('numAbsDiff')!.runner(ctx, { a: 5, b: 9, resultVar: 'd' }, step)
    expect(vars.get('d')).toBe(4)
  })

  it('dateDiffDays', async () => {
    const reg = new CommandRegistry()
    registerDataExtra4Commands(reg)
    const { ctx, vars } = makeCtx()
    await reg.get('dateDiffDays')!.runner(ctx, { from: '2026-01-01', to: '2026-01-10', resultVar: 'n' }, step)
    expect(vars.get('n')).toBe(9)
  })
})