/**
 * 8 条演示指令（阶段 2 POC）。
 *
 * 全部不依赖真实外部进程（浏览器/Excel/网络均为 mock），
 * 目的是证明「AST 解释器 + 指令注册表 + 块嵌套 + 变量 + 断点」链路可跑通。
 * 真实网页/Excel/sidecar 链路在阶段 3 接入。
 *
 * 清单：
 *  1. logMessage  输出日志
 *  2. delay       等待
 *  3. setVar      设置变量
 *  4. httpGet     HTTP GET（mock）
 *  5. jsonParse   解析 JSON
 *  6. randomInt   生成随机数
 *  7. loopList    循环列表（块）
 *  8. ifVar       条件判断（块）
 */

import type { RegisteredCommand } from './registry'
import type { LogLevel } from '../../shared/events'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

/** 把参数字符串尽力转成有类型的值（数字/布尔/JSON 对象），否则保留字符串 */
function coerce(raw: string): unknown {
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
  if (raw !== '' && !Number.isNaN(Number(raw))) return Number(raw)
  if (raw === 'true') return true
  if (raw === 'false') return false
  return raw
}

export function registerDemoCommands(registry: RegistryLike): void {
  // 1. 输出日志
  registry.register({
    id: 'logMessage',
    name: '输出日志',
    group: '通用',
    icon: 'terminal',
    params: [
      { key: 'message', label: '日志内容', type: 'text', placeholder: '支持 ${变量} 插值' },
      {
        key: 'level',
        label: '级别',
        type: 'select',
        default: 'info',
        options: [
          { value: 'info', label: '信息' },
          { value: 'success', label: '成功' },
          { value: 'warn', label: '警告' },
          { value: 'error', label: '错误' }
        ]
      }
    ],
    summary: (p) => `输出: ${str(p.message)}`,
    runner: async (ctx, p) => {
      const level = str(p.level, 'info') as LogLevel
      const msg = ctx.interpolate(str(p.message))
      ctx.log(level, msg)
      return msg
    }
  })

  // 2. 等待
  registry.register({
    id: 'delay',
    name: '等待',
    group: '通用',
    icon: 'clock',
    params: [{ key: 'ms', label: '等待毫秒', type: 'number', default: 500 }],
    summary: (p) => `等待 ${str(p.ms, '500')} ms`,
    runner: async (_ctx, p) => {
      const ms = Number(p.ms) || 0
      await new Promise((r) => setTimeout(r, ms))
      return ms
    }
  })

  // 3. 设置变量
  registry.register({
    id: 'setVar',
    name: '设置变量',
    group: '变量',
    icon: 'variable',
    params: [
      { key: 'name', label: '变量名', type: 'text' },
      { key: 'value', label: '值', type: 'text', placeholder: '数字/布尔/JSON 自动推断' }
    ],
    summary: (p) => `设置 ${str(p.name)} = ${str(p.value)}`,
    runner: async (ctx, p) => {
      const name = str(p.name)
      const value = coerce(str(p.value))
      ctx.setVar(name, value)
      const display =
        typeof value === 'object' ? JSON.stringify(value) : String(value)
      ctx.log('success', `变量 ${name} = ${display}`)
      return value
    }
  })

  // 4. HTTP GET（演示 mock：不发真实网络，返回固定商品列表）
  registry.register({
    id: 'httpGet',
    name: 'HTTP GET（演示）',
    group: '网络',
    icon: 'globe',
    params: [
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    summary: (p) => `GET ${str(p.url)} → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const url = ctx.interpolate(str(p.url))
      const resultVar = str(p.resultVar)
      ctx.log('info', `GET ${url}（演示模式：返回模拟数据）`)
      const mockData = [
        { name: '机械键盘 A', price: 299 },
        { name: '机械键盘 B', price: 349 }
      ]
      await new Promise((r) => setTimeout(r, 10)) // 模拟网络往返
      ctx.setVar(resultVar, mockData)
      ctx.log('success', `已取回 ${mockData.length} 条记录，存入变量 ${resultVar}`)
      return mockData
    }
  })

  // 5. 解析 JSON
  registry.register({
    id: 'jsonParse',
    name: '解析 JSON',
    group: '数据处理',
    icon: 'braces',
    params: [
      { key: 'sourceVar', label: '来源变量（字符串）', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    summary: (p) => `解析 ${str(p.sourceVar)} → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const sourceVar = str(p.sourceVar)
      const resultVar = str(p.resultVar)
      const raw = ctx.getVar<string>(sourceVar)
      if (typeof raw !== 'string') {
        throw new Error(`变量 ${sourceVar} 不是字符串，无法 JSON 解析`)
      }
      const parsed = JSON.parse(raw)
      ctx.setVar(resultVar, parsed)
      ctx.log('success', `JSON 解析完成 → ${resultVar}`)
      return parsed
    }
  })

  // 6. 生成随机数
  registry.register({
    id: 'randomInt',
    name: '生成随机数',
    group: '数据处理',
    icon: 'dice',
    params: [
      { key: 'min', label: '最小值', type: 'number', default: 1 },
      { key: 'max', label: '最大值', type: 'number', default: 100 },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    summary: (p) =>
      `随机数 [${str(p.min, '1')}, ${str(p.max, '100')}] → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const min = Number(p.min) || 0
      const max = Number(p.max) || 100
      const resultVar = str(p.resultVar)
      const v = Math.floor(Math.random() * (max - min + 1)) + min
      ctx.setVar(resultVar, v)
      ctx.log('info', `随机数 ${v} → ${resultVar}`)
      return v
    }
  })

  // 7. 循环列表（块）
  registry.register({
    id: 'loopList',
    name: '循环列表',
    group: '流程控制',
    icon: 'repeat',
    hasEnd: true,
    params: [
      { key: 'listVar', label: '列表变量', type: 'text' },
      { key: 'itemVar', label: '当前项变量名', type: 'text' }
    ],
    summary: (p) => `遍历 ${str(p.listVar)}，当前项为 ${str(p.itemVar)}`,
    runner: async (ctx, p, step) => {
      const listVar = str(p.listVar)
      const itemVar = str(p.itemVar)
      const list = ctx.getVar<unknown[]>(listVar)
      if (!Array.isArray(list)) {
        throw new Error(`变量 ${listVar} 不是列表，无法遍历`)
      }
      ctx.log('info', `开始遍历 ${listVar}（共 ${list.length} 项）`)
      let i = 0
      for (const item of list) {
        if (ctx.isCancelled()) break
        i++
        ctx.log('info', `—— 第 ${i} 项 ——`)
        await ctx.execChildren(step.children, { [itemVar]: item })
      }
      ctx.log('success', `遍历完成，共 ${i} 项`)
      return i
    }
  })

  // 8. 条件判断（块）
  registry.register({
    id: 'ifVar',
    name: '条件判断',
    group: '流程控制',
    icon: 'branch',
    hasEnd: true,
    params: [
      { key: 'varName', label: '变量名', type: 'text' },
      {
        key: 'op',
        label: '比较',
        type: 'select',
        default: 'eq',
        options: [
          { value: 'eq', label: '等于' },
          { value: 'neq', label: '不等于' },
          { value: 'gt', label: '大于' },
          { value: 'lt', label: '小于' }
        ]
      },
      { key: 'expected', label: '期望值', type: 'text' }
    ],
    summary: (p) => `${str(p.varName)} ${str(p.op, '==')} ${str(p.expected)}`,
    runner: async (ctx, p, step) => {
      const varName = str(p.varName)
      const op = str(p.op, 'eq')
      const expectedRaw = str(p.expected)
      const actual = ctx.getVar(varName)
      const expected =
        expectedRaw === ''
          ? ''
          : Number.isNaN(Number(expectedRaw))
            ? expectedRaw
            : Number(expectedRaw)
      let pass = false
      switch (op) {
        case 'eq':
          pass = actual === expected
          break
        case 'neq':
          pass = actual !== expected
          break
        case 'gt':
          pass = Number(actual) > Number(expected)
          break
        case 'lt':
          pass = Number(actual) < Number(expected)
          break
      }
      ctx.log('info', `条件 ${varName} ${op} ${expected} → ${pass ? '成立' : '不成立'}`)
      if (pass) {
        await ctx.execChildren(step.children)
      } else {
        await ctx.execChildren(step.else)
      }
      return pass
    }
  })
}
