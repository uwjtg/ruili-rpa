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
import * as fsp from 'node:fs/promises'

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

// ---------- M7-14 第三批：路径/环境变量/Base64/字符串/数学 ----------

import path from 'node:path'

export function registerDataExtra2Commands(registry: RegistryLike): void {
  // 路径
  registry.register({
    id: 'pathBasename', name: '取文件名', group: '文件', icon: 'file',
    params: [
      { key: 'pathStr', label: '路径', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = path.basename(ctx.interpolate(str(p.pathStr))); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `basename(${str(p.pathStr)})`
  })
  registry.register({
    id: 'pathDirname', name: '取文件夹', group: '文件', icon: 'folder',
    params: [
      { key: 'pathStr', label: '路径', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = path.dirname(ctx.interpolate(str(p.pathStr))); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `dirname(${str(p.pathStr)})`
  })
  registry.register({
    id: 'pathExtname', name: '取扩展名', group: '文件', icon: 'file',
    params: [
      { key: 'pathStr', label: '路径', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = path.extname(ctx.interpolate(str(p.pathStr))); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `extname(${str(p.pathStr)})`
  })
  registry.register({
    id: 'pathJoin', name: '拼接路径', group: '文件', icon: 'link',
    params: [
      { key: 'a', label: '段 A', type: 'text' },
      { key: 'b', label: '段 B', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = path.join(ctx.interpolate(str(p.a)), ctx.interpolate(str(p.b))); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `join(${str(p.a)}, ${str(p.b)})`
  })

  // 环境变量
  registry.register({
    id: 'getEnv', name: '读环境变量', group: '系统', icon: 'settings',
    params: [
      { key: 'name', label: '变量名', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = process.env[str(p.name)] ?? ''; ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `env(${str(p.name)})`
  })
  registry.register({
    id: 'setEnv', name: '写环境变量', group: '系统', icon: 'settings',
    params: [
      { key: 'name', label: '变量名', type: 'text' },
      { key: 'value', label: '值', type: 'text' }
    ],
    runner: async (ctx, p) => { process.env[str(p.name)] = ctx.interpolate(str(p.value)); return true },
    summary: (p) => `env ${str(p.name)}=...`
  })

  // Base64
  registry.register({
    id: 'base64Encode', name: 'Base64 编码', group: '数据处理', icon: 'lock',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = Buffer.from(ctx.interpolate(str(p.text)), 'utf-8').toString('base64'); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `b64encode(${str(p.text).slice(0, 10)})`
  })
  registry.register({
    id: 'base64Decode', name: 'Base64 解码', group: '数据处理', icon: 'unlock',
    params: [
      { key: 'b64', label: 'Base64', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = Buffer.from(ctx.interpolate(str(p.b64)), 'base64').toString('utf-8'); ctx.setVar(str(p.resultVar), out); return out },
    summary: () => `b64decode(...)`
  })

  // 字符串更多
  registry.register({
    id: 'stringIndexOf', name: '查找子串位置', group: '数据处理', icon: 'search',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'sub', label: '子串', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = ctx.interpolate(str(p.text)).indexOf(ctx.interpolate(str(p.sub))); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `indexOf("${str(p.sub)}")`
  })
  registry.register({
    id: 'stringStartsWith', name: '是否开头匹配', group: '数据处理', icon: 'arrow-up',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'prefix', label: '前缀', type: 'text' },
      { key: 'resultVar', label: '结果变量（bool）', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = ctx.interpolate(str(p.text)).startsWith(ctx.interpolate(str(p.prefix))); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `startsWith("${str(p.prefix)}")`
  })
  registry.register({
    id: 'stringEndsWith', name: '是否结尾匹配', group: '数据处理', icon: 'arrow-down',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'suffix', label: '后缀', type: 'text' },
      { key: 'resultVar', label: '结果变量（bool）', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = ctx.interpolate(str(p.text)).endsWith(ctx.interpolate(str(p.suffix))); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `endsWith("${str(p.suffix)}")`
  })
  registry.register({
    id: 'stringReverse', name: '字符串反转', group: '数据处理', icon: 'arrow-left-right',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = [...ctx.interpolate(str(p.text))].reverse().join(''); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `reverse(${str(p.text).slice(0, 10)})`
  })

  // 数学更多
  registry.register({
    id: 'numFloor', name: '向下取整', group: '数据处理', icon: 'arrow-down',
    params: [
      { key: 'a', label: '数字', type: 'number' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = Math.floor(num(p.a)); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `floor(${str(p.a)})`
  })
  registry.register({
    id: 'numCeil', name: '向上取整', group: '数据处理', icon: 'arrow-up',
    params: [
      { key: 'a', label: '数字', type: 'number' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = Math.ceil(num(p.a)); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `ceil(${str(p.a)})`
  })
  registry.register({
    id: 'numSqrt', name: '平方根', group: '数据处理', icon: 'hash',
    params: [
      { key: 'a', label: '数字', type: 'number' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = Math.sqrt(num(p.a)); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `sqrt(${str(p.a)})`
  })
}
// ---------- M7-15 第四批：数组/字符串/数字/网络/文件 ----------

export function registerDataExtra3Commands(registry: RegistryLike): void {
  // 数组
  registry.register({
    id: 'listSort', name: '列表排序', group: '数据处理', icon: 'sort-asc',
    params: [
      { key: 'listVar', label: '列表变量', type: 'text' },
      { key: 'desc', label: '降序', type: 'boolean', default: false }
    ],
    runner: async (ctx, p) => {
      const name = str(p.listVar)
      const cur = ctx.getVar<unknown[]>(name) ?? []
      const arr = [...cur].sort((a, b) => String(a).localeCompare(String(b), 'zh'))
      if (p.desc) arr.reverse()
      ctx.setVar(name, arr)
      return arr
    },
    summary: (p) => `sort(${str(p.listVar)})`
  })
  registry.register({
    id: 'listReverse', name: '列表反转', group: '数据处理', icon: 'repeat',
    params: [{ key: 'listVar', label: '列表变量', type: 'text' }],
    runner: async (ctx, p) => {
      const name = str(p.listVar)
      const arr = [...(ctx.getVar<unknown[]>(name) ?? [])].reverse()
      ctx.setVar(name, arr)
      return arr
    },
    summary: (p) => `reverse(${str(p.listVar)})`
  })
  registry.register({
    id: 'listUnique', name: '列表去重', group: '数据处理', icon: 'filter',
    params: [
      { key: 'listVar', label: '列表变量', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const arr = ctx.getVar<unknown[]>(str(p.listVar)) ?? []
      const out = [...new Set(arr.map(String))]
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `unique(${str(p.listVar)})`
  })
  registry.register({
    id: 'listSum', name: '列表求和', group: '数据处理', icon: 'sum',
    params: [
      { key: 'listVar', label: '列表变量', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const arr = ctx.getVar<unknown[]>(str(p.listVar)) ?? []
      const out = arr.reduce((s: number, x) => s + Number(x), 0)
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `sum(${str(p.listVar)})`
  })
  registry.register({
    id: 'listMin', name: '列表最小值', group: '数据处理', icon: 'arrow-down',
    params: [
      { key: 'listVar', label: '列表变量', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const arr = ctx.getVar<unknown[]>(str(p.listVar)) ?? []
      const out = Math.min(...arr.map(Number))
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `min(${str(p.listVar)})`
  })
  registry.register({
    id: 'listMax', name: '列表最大值', group: '数据处理', icon: 'arrow-up',
    params: [
      { key: 'listVar', label: '列表变量', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const arr = ctx.getVar<unknown[]>(str(p.listVar)) ?? []
      const out = Math.max(...arr.map(Number))
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `max(${str(p.listVar)})`
  })

  // 字符串
  registry.register({
    id: 'stringCount', name: '统计子串出现次数', group: '数据处理', icon: 'hash',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'sub', label: '子串', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const text = ctx.interpolate(str(p.text))
      const sub = ctx.interpolate(str(p.sub))
      const out = sub ? text.split(sub).length - 1 : 0
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `count("${str(p.sub)}")`
  })
  registry.register({
    id: 'stringSplitLines', name: '按行拆分', group: '数据处理', icon: 'columns',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'resultVar', label: '结果变量（列表）', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const out = ctx.interpolate(str(p.text)).split(/\r?\n/)
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: () => `splitLines(...)`
  })

  // 数字
  registry.register({
    id: 'parseInt', name: '转整数', group: '数据处理', icon: 'hash',
    params: [
      { key: 'text', label: '文本', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const out = parseInt(ctx.interpolate(str(p.text)), 10)
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `parseInt(${str(p.text)})`
  })
  registry.register({
    id: 'parseFloat', name: '转浮点数', group: '数据处理', icon: 'hash',
    params: [
      { key: 'text', label: '文本', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const out = parseFloat(ctx.interpolate(str(p.text)))
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `parseFloat(${str(p.text)})`
  })


  // 文件
  registry.register({
    id: 'appendTextFile', name: '追加文本到文件', group: '文件', icon: 'file-edit',
    params: [
      { key: 'path', label: '文件路径', type: 'text' },
      { key: 'content', label: '内容', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const fp = ctx.interpolate(str(p.path))
      const content = ctx.interpolate(str(p.content))
      await fsp.mkdir(path.dirname(fp), { recursive: true })
      await fsp.appendFile(fp, content + '\n', 'utf-8')
      return fp
    },
    summary: (p) => `append ${str(p.path)}`
  })

  // 流程
  registry.register({
    id: 'comment', name: '注释（不执行）', group: '流程', icon: 'message-square',
    params: [{ key: 'text', label: '注释内容', type: 'text' }],
    runner: async (ctx, p) => { ctx.log('info', `注释: ${str(p.text)}`); return true },
    summary: (p) => `// ${str(p.text)}`
  })

  // 时间戳
  registry.register({
    id: 'timestampNow', name: '当前毫秒时间戳', group: '数据处理', icon: 'clock',
    params: [{ key: 'resultVar', label: '结果变量', type: 'text' }],
    runner: async (ctx, p) => { const out = Date.now(); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `now() → ${str(p.resultVar)}`
  })
}

// ---------- M7-20 第五批：数组/字符串/数学/日期 ----------

export function registerDataExtra4Commands(registry: RegistryLike): void {
  registry.register({
    id: 'listChunk', name: '列表分块', group: '数据处理', icon: 'grid',
    params: [
      { key: 'listVar', label: '列表变量', type: 'text' },
      { key: 'size', label: '块大小', type: 'number' },
      { key: 'resultVar', label: '结果变量（二维数组）', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const arr = ctx.getVar<unknown[]>(str(p.listVar)) ?? []
      const size = Math.max(1, num(p.size, 1))
      const out: unknown[][] = []
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `chunk(${str(p.size)})`
  })

  registry.register({
    id: 'listFlatten', name: '列表扁平化', group: '数据处理', icon: 'squares',
    params: [
      { key: 'listVar', label: '二维列表变量', type: 'text' },
      { key: 'resultVar', label: '结果变量（一维数组）', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const arr = ctx.getVar<unknown[][]>(str(p.listVar)) ?? []
      const out = ([] as unknown[]).concat(...arr)
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `flatten(${str(p.listVar)})`
  })

  registry.register({
    id: 'listPluck', name: '取对象数组某字段', group: '数据处理', icon: 'columns',
    params: [
      { key: 'listVar', label: '对象数组变量', type: 'text' },
      { key: 'field', label: '字段名', type: 'text' },
      { key: 'resultVar', label: '结果变量（列表）', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const arr = ctx.getVar<Array<Record<string, unknown>>>(str(p.listVar)) ?? []
      const field = str(p.field)
      const out = arr.map((o) => o[field])
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `pluck("${str(p.field)}")`
  })

  registry.register({
    id: 'stringTrimStart', name: '去左空白', group: '数据处理', icon: 'arrow-left',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = ctx.interpolate(str(p.text)).trimStart(); ctx.setVar(str(p.resultVar), out); return out },
    summary: () => `trimStart(...)`
  })

  registry.register({
    id: 'stringTrimEnd', name: '去右空白', group: '数据处理', icon: 'arrow-right',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = ctx.interpolate(str(p.text)).trimEnd(); ctx.setVar(str(p.resultVar), out); return out },
    summary: () => `trimEnd(...)`
  })

  registry.register({
    id: 'stringPadCenter', name: '两侧补字符居中', group: '数据处理', icon: 'align-center',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'length', label: '目标长度', type: 'number' },
      { key: 'pad', label: '补字符', type: 'text', default: ' ' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const text = ctx.interpolate(str(p.text))
      const len = num(p.length, 0)
      const pad = ctx.interpolate(str(p.pad, ' '))
      const out = text.padStart(text.length + Math.ceil((len - text.length) / 2), pad).padEnd(len, pad)
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `padCenter(${str(p.length)})`
  })

  registry.register({
    id: 'numPow', name: '幂', group: '数据处理', icon: 'arrow-up-circle',
    params: [
      { key: 'a', label: '底数', type: 'number' },
      { key: 'b', label: '指数', type: 'number' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = Math.pow(num(p.a), num(p.b)); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `${str(p.a)}^${str(p.b)}`
  })

  registry.register({
    id: 'numMod', name: '取模', group: '数据处理', icon: 'percent',
    params: [
      { key: 'a', label: '被除数', type: 'number' },
      { key: 'b', label: '除数', type: 'number' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const b = num(p.b, 1); const out = num(p.a) % b; ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `${str(p.a)} mod ${str(p.b)}`
  })

  registry.register({
    id: 'numAbsDiff', name: '两数差绝对值', group: '数据处理', icon: 'minus',
    params: [
      { key: 'a', label: 'A', type: 'number' },
      { key: 'b', label: 'B', type: 'number' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => { const out = Math.abs(num(p.a) - num(p.b)); ctx.setVar(str(p.resultVar), out); return out },
    summary: (p) => `|${str(p.a)}-${str(p.b)}|`
  })

  registry.register({
    id: 'dateDiffDays', name: '两日期相差天数', group: '数据处理', icon: 'calendar',
    params: [
      { key: 'from', label: '起始日期（ISO 或 yyyy-MM-dd）', type: 'text' },
      { key: 'to', label: '结束日期', type: 'text' },
      { key: 'resultVar', label: '结果变量（天数）', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const a = new Date(ctx.interpolate(str(p.from))).getTime()
      const b = new Date(ctx.interpolate(str(p.to))).getTime()
      const out = Math.round((b - a) / 86400000)
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `${str(p.from)} → ${str(p.to)}`
  })
}
// ---------- M7-26 第六批：收尾到 160+ ----------

export function registerDataExtra5Commands(registry: RegistryLike): void {
  registry.register({
    id: 'listSortByField', name: '对象数组按字段排序', group: '数据处理', icon: 'sort-asc',
    params: [
      { key: 'listVar', label: '对象数组变量', type: 'text' },
      { key: 'field', label: '字段名', type: 'text' },
      { key: 'desc', label: '降序', type: 'boolean', default: false },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const arr = [...(ctx.getVar<Array<Record<string, unknown>>>(str(p.listVar)) ?? [])]
      const field = str(p.field)
      const dir = p.desc ? -1 : 1
      arr.sort((a, b) => {
        const av = a[field]; const bv = b[field]
        if (av == null) return -1; if (bv == null) return 1
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
        return String(av).localeCompare(String(bv)) * dir
      })
      ctx.setVar(str(p.resultVar), arr)
      return arr
    },
    summary: (p) => `sort by ${str(p.field)}`
  })


  registry.register({
    id: 'listAvg', name: '数字数组平均', group: '数据处理', icon: 'bar-chart',
    params: [
      { key: 'listVar', label: '数字数组变量', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const arr = ctx.getVar<unknown[]>(str(p.listVar)) ?? []
      const out = arr.length ? arr.reduce<number>((s, x) => s + Number(x || 0), 0) / arr.length : 0
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `avg(${str(p.listVar)})`
  })



  registry.register({
    id: 'stringReplaceFirst', name: '替换第一次出现', group: '数据处理', icon: 'replace',
    params: [
      { key: 'text', label: '原文', type: 'text' },
      { key: 'find', label: '查找', type: 'text' },
      { key: 'replace', label: '替换为', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    runner: async (ctx, p) => {
      const out = ctx.interpolate(str(p.text)).replace(ctx.interpolate(str(p.find)), ctx.interpolate(str(p.replace)))
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `${str(p.find)} → ${str(p.replace)}`
  })


  registry.register({
    id: 'dateNow', name: '当前时间 ISO', group: '数据处理', icon: 'clock',
    params: [{ key: 'resultVar', label: '结果变量', type: 'text' }],
    runner: async (ctx, p) => {
      const out = new Date().toISOString()
      ctx.setVar(str(p.resultVar), out)
      return out
    },
    summary: (p) => `now → ${str(p.resultVar)}`
  })
}