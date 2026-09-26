/**
 * 数据处理指令（M7 切片 11）：字符串 / 日期 / 数学 / JSON / 数组。
 *
 * 纯 Node 内置（无新依赖、无 Electron），完全可在 vitest 里真跑。
 *
 * 清单（17 条）：
 *  字符串 6: strTrim / strUpper / strLower / strReplace / strSplit / strSubstring
 *  日期   3: nowFormat / addDays / timestampToDate
 *  数学   5: numAdd / numSubtract / numMultiply / numDivide / numRandom
 *  JSON   1: jsonParse
 *  数组   2: listGet / listAppend
 */

import type { RegisteredCommand } from './registry'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}
function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 简单日期格式：yyyy-MM-dd HH:mm:ss（支持 yyyy/MM/dd/HH/mm/ss） */
function formatDate(d: Date, fmt: string): string {
  return fmt
    .replace(/yyyy/g, String(d.getFullYear()))
    .replace(/MM/g, pad2(d.getMonth() + 1))
    .replace(/dd/g, pad2(d.getDate()))
    .replace(/HH/g, pad2(d.getHours()))
    .replace(/mm/g, pad2(d.getMinutes()))
    .replace(/ss/g, pad2(d.getSeconds()))
}

export function registerDataCommands(registry: RegistryLike): void {
  // ---------- 字符串 ----------

  registry.register({
    id: 'strTrim',
    name: '去除首尾空格',
    group: '数据处理',
    icon: 'scissors',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    summary: (p) => `trim(${str(p.text)})`,
    runner: async (ctx, p) => {
      const out = ctx.interpolate(str(p.text)).trim()
      ctx.setVar(str(p.resultVar), out)
      return out
    }
  })

  registry.register({
    id: 'strUpper',
    name: '转大写',
    group: '数据处理',
    icon: 'arrow-up',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const out = ctx.interpolate(str(p.text)).toUpperCase()
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `upper(${str(p.text)})`
  })

  registry.register({
    id: 'strLower',
    name: '转小写',
    group: '数据处理',
    icon: 'arrow-down',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const out = ctx.interpolate(str(p.text)).toLowerCase()
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `lower(${str(p.text)})`
  })

  registry.register({
    id: 'strReplace',
    name: '字符串替换',
    group: '数据处理',
    icon: 'replace',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'search', label: '查找', type: 'text' },
      { key: 'replacement', label: '替换为', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const text = ctx.interpolate(str(p.text))
      const search = ctx.interpolate(str(p.search))
      const replacement = ctx.interpolate(str(p.replacement))
      const out = text.split(search).join(replacement)
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `${str(p.search)}→${str(p.replacement)}`
  })

  registry.register({
    id: 'strSplit',
    name: '字符串拆分',
    group: '数据处理',
    icon: 'columns',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'separator', label: '分隔符', type: 'text', default: ',' },
      { key: 'resultVar', label: '结果变量（列表）', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const text = ctx.interpolate(str(p.text))
      const sep = ctx.interpolate(str(p.separator, ','))
      const out = text.split(sep)
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `split(${str(p.text)}, "${str(p.separator)}")`
  })

  registry.register({
    id: 'strSubstring',
    name: '截取子串',
    group: '数据处理',
    icon: 'crop',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'start', label: '起始位置（0 起）', type: 'number' },
      { key: 'end', label: '结束位置（可空）', type: 'number' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const text = ctx.interpolate(str(p.text))
      const start = num(p.start, 0)
      const end = p.end == null || p.end === '' ? undefined : num(p.end)
      const out = text.substring(start, end)
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `substring(${str(p.start)}, ${str(p.end)})`
  })

  // ---------- 日期 ----------

  registry.register({
    id: 'nowFormat',
    name: '当前时间格式化',
    group: '数据处理',
    icon: 'clock',
    params: [
      { key: 'format', label: '格式', type: 'text', default: 'yyyy-MM-dd HH:mm:ss' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const fmt = ctx.interpolate(str(p.format, 'yyyy-MM-dd HH:mm:ss'))
      const out = formatDate(new Date(), fmt)
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `now(${str(p.format)})`
  })

  registry.register({
    id: 'addDays',
    name: '日期加减天数',
    group: '数据处理',
    icon: 'calendar',
    params: [
      { key: 'sourceVar', label: '来源变量（Date 或 ISO 字符串）', type: 'text' },
      { key: 'days', label: '天数（可负）', type: 'number' },
      { key: 'resultVar', label: '结果变量（ISO）', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const src = ctx.getVar(str(p.sourceVar))
      const d = src instanceof Date ? new Date(src) : new Date(str(src))
      d.setDate(d.getDate() + num(p.days))
      const out = d.toISOString()
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `${str(p.sourceVar)} + ${str(p.days)}d`
  })

  registry.register({
    id: 'timestampToDate',
    name: '时间戳转日期',
    group: '数据处理',
    icon: 'clock',
    params: [
      { key: 'timestamp', label: '毫秒时间戳', type: 'number' },
      { key: 'format', label: '格式', type: 'text', default: 'yyyy-MM-dd HH:mm:ss' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const ts = num(p.timestamp)
      const fmt = ctx.interpolate(str(p.format, 'yyyy-MM-dd HH:mm:ss'))
      const out = formatDate(new Date(ts), fmt)
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `ts ${str(p.timestamp)} → date`
  })

  // ---------- 数学 ----------

  function mathOp(
    op: (a: number, b: number) => number,
    name: string
  ): void {
    registry.register({
      id: name,
      name: name === 'numAdd' ? '加法' : name === 'numSubtract' ? '减法' : name === 'numMultiply' ? '乘法' : '除法',
      group: '数据处理',
      icon: 'calculator',
      params: [
        { key: 'a', label: 'A', type: 'number' },
        { key: 'b', label: 'B', type: 'number' },
        { key: 'resultVar', label: '结果变量', type: 'text' }
      ],
      runner: async (ctx, p) => {
        const out = op(num(p.a), num(p.b))
        ctx.setVar(str(p.resultVar), out)
        return out
      },
      summary: (p) => `${str(p.a)} ${name === 'numAdd' ? '+' : name === 'numSubtract' ? '-' : name === 'numMultiply' ? '*' : '/'} ${str(p.b)}`
    })
  }
  mathOp((a, b) => a + b, 'numAdd')
  mathOp((a, b) => a - b, 'numSubtract')
  mathOp((a, b) => a * b, 'numMultiply')
  mathOp((a, b) => (b === 0 ? NaN : a / b), 'numDivide')

  registry.register({
    id: 'numRandom',
    name: '随机数',
    group: '数据处理',
    icon: 'dice',
    params: [
      { key: 'min', label: '最小值（含）', type: 'number', default: 0 },
      { key: 'max', label: '最大值（不含）', type: 'number', default: 1 },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const min = num(p.min, 0)
      const max = num(p.max, 1)
      const out = min + Math.random() * (max - min)
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `rand(${str(p.min)}, ${str(p.max)})`
  })

  // ---------- 数组 ----------

  registry.register({
    id: 'listGet',
    name: '取列表元素',
    group: '数据处理',
    icon: 'hash',
    params: [
      { key: 'listVar', label: '列表变量', type: 'text' },
      { key: 'index', label: '索引（0 起）', type: 'number' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const list = ctx.getVar<unknown[]>(str(p.listVar))
      const idx = num(p.index, 0)
      const out = Array.isArray(list) ? list[idx] : undefined
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `${str(p.listVar)}[${str(p.index)}]`
  })

  registry.register({
    id: 'listAppend',
    name: '列表追加元素',
    group: '数据处理',
    icon: 'plus',
    params: [
      { key: 'listVar', label: '列表变量', type: 'text' },
      { key: 'item', label: '新元素', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const name = str(p.listVar)
      const cur = ctx.getVar<unknown[]>(name)
      const arr = Array.isArray(cur) ? [...cur] : []
      arr.push(ctx.interpolate(str(p.item)))
      ctx.setVar(name, arr)
      return arr
    },
    summary: (p) => `${str(p.listVar)}.push(${str(p.item)})`
  })
}

export function registerDataExtraCommands(registry: RegistryLike): void {
// ---------- M7-13 扩展：字符串更多 / 数学更多 ----------

registry.register({
  id: 'stringLength',
  name: '字符串长度',
  group: '数据处理',
  icon: 'hash',
  params: [
    { key: 'text', label: '原文', type: 'text' },
    { key: 'resultVar', label: '结果变量', type: 'text' }
  ],
  runner: async (ctx, p) => {
    const out = ctx.interpolate(str(p.text)).length
    ctx.setVar(str(p.resultVar), out)
    return out
  },
  summary: (p) => `len(${str(p.text)})`
})

registry.register({
  id: 'stringIncludes',
  name: '是否包含子串',
  group: '数据处理',
  icon: 'search',
  params: [
    { key: 'text', label: '原文', type: 'text' },
    { key: 'sub', label: '子串', type: 'text' },
    { key: 'resultVar', label: '结果变量（bool）', type: 'text' }
  ],
  runner: async (ctx, p) => {
    const text = ctx.interpolate(str(p.text))
    const sub = ctx.interpolate(str(p.sub))
    const out = text.includes(sub)
    ctx.setVar(str(p.resultVar), out)
    return out
  },
  summary: (p) => `includes("${str(p.sub)}")`
})

registry.register({
  id: 'stringPadStart',
  name: '左侧补字符',
  group: '数据处理',
  icon: 'arrow-left',
  params: [
    { key: 'text', label: '原文', type: 'text' },
    { key: 'length', label: '目标长度', type: 'number' },
    { key: 'pad', label: '补字符', type: 'text', default: '0' },
    { key: 'resultVar', label: '结果变量', type: 'text' }
  ],
  runner: async (ctx, p) => {
    const text = ctx.interpolate(str(p.text))
    const out = text.padStart(num(p.length, 0), ctx.interpolate(str(p.pad, '0')))
    ctx.setVar(str(p.resultVar), out)
    return out
  },
  summary: (p) => `padStart(${str(p.length)}, "${str(p.pad)}")`
})

registry.register({
  id: 'stringPadEnd',
  name: '右侧补字符',
  group: '数据处理',
  icon: 'arrow-right',
  params: [
    { key: 'text', label: '原文', type: 'text' },
    { key: 'length', label: '目标长度', type: 'number' },
    { key: 'pad', label: '补字符', type: 'text', default: ' ' },
    { key: 'resultVar', label: '结果变量', type: 'text' }
  ],
  runner: async (ctx, p) => {
    const text = ctx.interpolate(str(p.text))
    const out = text.padEnd(num(p.length, 0), ctx.interpolate(str(p.pad, ' ')))
    ctx.setVar(str(p.resultVar), out)
    return out
  },
  summary: (p) => `padEnd(${str(p.length)})`
})

registry.register({
  id: 'stringRepeat',
  name: '字符串重复',
  group: '数据处理',
  icon: 'repeat',
  params: [
    { key: 'text', label: '原文', type: 'text' },
    { key: 'count', label: '次数', type: 'number' },
    { key: 'resultVar', label: '结果变量', type: 'text' }
  ],
  runner: async (ctx, p) => {
    const text = ctx.interpolate(str(p.text))
    const out = text.repeat(num(p.count, 1))
    ctx.setVar(str(p.resultVar), out)
    return out
  },
  summary: (p) => `repeat(${str(p.count)})`
})

registry.register({
  id: 'numAbs',
  name: '绝对值',
  group: '数据处理',
  icon: 'bar-chart',
  params: [
    { key: 'a', label: '数字', type: 'number' },
    { key: 'resultVar', label: '结果变量', type: 'text' }
  ],
  runner: async (ctx, p) => {
    const out = Math.abs(num(p.a))
    ctx.setVar(str(p.resultVar), out)
    return out
  },
  summary: (p) => `abs(${str(p.a)})`
})

registry.register({
  id: 'numRound',
  name: '四舍五入',
  group: '数据处理',
  icon: 'circle',
  params: [
    { key: 'a', label: '数字', type: 'number' },
    { key: 'digits', label: '小数位', type: 'number', default: 0 },
    { key: 'resultVar', label: '结果变量', type: 'text' }
  ],
  runner: async (ctx, p) => {
    const f = num(p.digits, 0)
    const out = Number(num(p.a).toFixed(f))
    ctx.setVar(str(p.resultVar), out)
    return out
  },
  summary: (p) => `round(${str(p.a)}, ${str(p.digits)})`
})

registry.register({
  id: 'numMax',
  name: '取最大值',
  group: '数据处理',
  icon: 'arrow-up',
  params: [
    { key: 'a', label: 'A', type: 'number' },
    { key: 'b', label: 'B', type: 'number' },
    { key: 'resultVar', label: '结果变量', type: 'text' }
  ],
  runner: async (ctx, p) => {
    const out = Math.max(num(p.a), num(p.b))
    ctx.setVar(str(p.resultVar), out)
    return out
  },
  summary: (p) => `max(${str(p.a)}, ${str(p.b)})`
})

registry.register({
  id: 'numMin',
  name: '取最小值',
  group: '数据处理',
  icon: 'arrow-down',
  params: [
    { key: 'a', label: 'A', type: 'number' },
    { key: 'b', label: 'B', type: 'number' },
    { key: 'resultVar', label: '结果变量', type: 'text' }
  ],
  runner: async (ctx, p) => {
    const out = Math.min(num(p.a), num(p.b))
    ctx.setVar(str(p.resultVar), out)
    return out
  },
  summary: (p) => `min(${str(p.a)}, ${str(p.b)})`
})
}
