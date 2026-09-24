import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../commands/registry'
import { registerDemoCommands } from '../commands/demo'
import { Interpreter } from './interpreter'
import { DEMO_FLOW } from './demo-flow'
import type { FlowDoc, StepNode } from '../../shared/ast'
import type { LogLevel } from '../../shared/events'

function makeRegistry(): CommandRegistry {
  const reg = new CommandRegistry()
  registerDemoCommands(reg)
  return reg
}

interface CapturedLog {
  level: LogLevel
  message: string
}

function makeRecorder(): {
  logs: CapturedLog[]
  stepOrder: string[]
  events: {
    onLog: (l: LogLevel, m: string) => void
    onStepStart: (s: StepNode) => void
  }
} {
  const logs: CapturedLog[] = []
  const stepOrder: string[] = []
  return {
    logs,
    stepOrder,
    events: {
      onLog: (level, message) => logs.push({ level, message }),
      onStepStart: (step) => stepOrder.push(step.id)
    }
  }
}

describe('Interpreter · 基础执行', () => {
  it('顺序执行两条叶子指令，stepsExecuted 计数正确', async () => {
    const rec = makeRecorder()
    const flow: FlowDoc = {
      version: 1,
      name: 't',
      vars: [],
      steps: [
        { id: 'a', cmdId: 'logMessage', params: { message: 'hello', level: 'info' } },
        { id: 'b', cmdId: 'logMessage', params: { message: 'world', level: 'success' } }
      ]
    }
    const itp = new Interpreter({ registry: makeRegistry(), events: rec.events })
    const result = await itp.run(flow)
    expect(result.status).toBe('completed')
    expect(result.stepsExecuted).toBe(2)
    expect(rec.stepOrder).toEqual(['a', 'b'])
    expect(rec.logs.map((l) => l.message)).toEqual(['hello', 'world'])
  })

  it('setVar 写入后 logMessage 可用 ${var} 插值读出', async () => {
    const rec = makeRecorder()
    const flow: FlowDoc = {
      version: 1,
      name: 't',
      vars: [],
      steps: [
        { id: 'a', cmdId: 'setVar', params: { name: 'name', value: '锐流' } },
        { id: 'b', cmdId: 'logMessage', params: { message: '你好 ${name}', level: 'info' } }
      ]
    }
    const itp = new Interpreter({ registry: makeRegistry(), events: rec.events })
    await itp.run(flow)
    expect(rec.logs.map((l) => l.message)).toContain('你好 锐流')
  })

  it('禁用步骤被跳过，不执行其 runner', async () => {
    const rec = makeRecorder()
    const flow: FlowDoc = {
      version: 1,
      name: 't',
      vars: [],
      steps: [
        { id: 'a', cmdId: 'logMessage', params: { message: '跑了' } },
        { id: 'b', cmdId: 'logMessage', params: { message: '不该跑' }, disabled: true }
      ]
    }
    const itp = new Interpreter({ registry: makeRegistry(), events: rec.events })
    const result = await itp.run(flow)
    expect(result.stepsExecuted).toBe(1)
    expect(rec.stepOrder).toEqual(['a'])
    expect(rec.logs.some((l) => l.message === '不该跑')).toBe(false)
    expect(rec.logs.some((l) => l.level === 'warn')).toBe(true)
  })

  it('未注册指令导致 status=error 并带错误信息', async () => {
    const flow: FlowDoc = {
      version: 1,
      name: 't',
      vars: [],
      steps: [{ id: 'a', cmdId: 'noSuchCmd', params: {} }]
    }
    const itp = new Interpreter({ registry: makeRegistry() })
    const result = await itp.run(flow)
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/未注册的指令/)
  })
})

describe('Interpreter · 块指令', () => {
  it('loopList 遍历数组，子步骤能读到当前项属性', async () => {
    const rec = makeRecorder()
    const flow: FlowDoc = {
      version: 1,
      name: 't',
      vars: [
        { name: 'items', type: 'list', value: [{ n: '甲' }, { n: '乙' }, { n: '丙' }] }
      ],
      steps: [
        {
          id: 'loop',
          cmdId: 'loopList',
          params: { listVar: 'items', itemVar: 'it' },
          children: [
            { id: 'c', cmdId: 'logMessage', params: { message: '项=${it.n}' } }
          ]
        }
      ]
    }
    const itp = new Interpreter({ registry: makeRegistry(), events: rec.events })
    const result = await itp.run(flow)
    expect(result.status).toBe('completed')
    expect(rec.logs.map((l) => l.message)).toEqual(
      expect.arrayContaining(['项=甲', '项=乙', '项=丙'])
    )
  })

  it('ifVar 条件成立走 children，不成立走 else', async () => {
    const recTrue = makeRecorder()
    const flowTrue: FlowDoc = {
      version: 1,
      name: 't',
      vars: [{ name: 'x', type: 'number', value: 5 }],
      steps: [
        {
          id: 'if',
          cmdId: 'ifVar',
          params: { varName: 'x', op: 'gt', expected: '3' },
          children: [{ id: 'ct', cmdId: 'logMessage', params: { message: 'yes-branch' } }],
          else: [{ id: 'cf', cmdId: 'logMessage', params: { message: 'no-branch' } }]
        }
      ]
    }
    await new Interpreter({ registry: makeRegistry(), events: recTrue.events }).run(flowTrue)
    expect(recTrue.logs.map((l) => l.message)).toContain('yes-branch')
    expect(recTrue.logs.map((l) => l.message)).not.toContain('no-branch')

    const recFalse = makeRecorder()
    const flowFalse: FlowDoc = {
      version: 1,
      name: 't',
      vars: [{ name: 'x', type: 'number', value: 1 }],
      steps: [
        {
          id: 'if',
          cmdId: 'ifVar',
          params: { varName: 'x', op: 'gt', expected: '3' },
          children: [{ id: 'ct', cmdId: 'logMessage', params: { message: 'yes-branch' } }],
          else: [{ id: 'cf', cmdId: 'logMessage', params: { message: 'no-branch' } }]
        }
      ]
    }
    await new Interpreter({ registry: makeRegistry(), events: recFalse.events }).run(flowFalse)
    expect(recFalse.logs.map((l) => l.message)).toContain('no-branch')
    expect(recFalse.logs.map((l) => l.message)).not.toContain('yes-branch')
  })
})

describe('Interpreter · 断点与取消', () => {
  it('命中断点暂停，resume 后继续执行剩余步骤', async () => {
    const rec = makeRecorder()
    const flow: FlowDoc = {
      version: 1,
      name: 't',
      vars: [],
      steps: [
        { id: 'a', cmdId: 'logMessage', params: { message: 'before' } },
        { id: 'b', cmdId: 'logMessage', params: { message: 'at-breakpoint' }, breakpoint: true },
        { id: 'c', cmdId: 'logMessage', params: { message: 'after' } }
      ]
    }

    let hitPaused!: () => void
    const pausedPromise = new Promise<void>((r) => {
      hitPaused = r
    })

    const itp = new Interpreter({
      registry: makeRegistry(),
      events: {
        ...rec.events,
        onPaused: () => hitPaused()
      }
    })
    const runPromise = itp.run(flow)

    await pausedPromise // 等到命中断点
    // 此时 a 已跑，b/c 未跑
    expect(rec.stepOrder).toEqual(['a'])
    expect(rec.logs.map((l) => l.message)).not.toContain('at-breakpoint')

    itp.resume()
    const result = await runPromise
    expect(result.status).toBe('completed')
    expect(rec.stepOrder).toEqual(['a', 'b', 'c'])
    expect(rec.logs.map((l) => l.message)).toEqual(
      expect.arrayContaining(['before', 'at-breakpoint', 'after'])
    )
  })

  it('断点处调用 stop() 则 status=cancelled', async () => {
    const flow: FlowDoc = {
      version: 1,
      name: 't',
      vars: [],
      steps: [
        { id: 'a', cmdId: 'logMessage', params: { message: 'before' } },
        { id: 'b', cmdId: 'logMessage', params: { message: 'never' }, breakpoint: true }
      ]
    }
    let hitPaused!: () => void
    const pausedPromise = new Promise<void>((r) => {
      hitPaused = r
    })
    const itp = new Interpreter({
      registry: makeRegistry(),
      events: { onPaused: () => hitPaused() }
    })
    const runPromise = itp.run(flow)
    await pausedPromise
    itp.stop()
    const result = await runPromise
    expect(result.status).toBe('cancelled')
  })
})

describe('Interpreter · 5 步演示流程', () => {
  it('DEMO_FLOW 端到端跑通，status=completed', async () => {
    const rec = makeRecorder()
    const itp = new Interpreter({ registry: makeRegistry(), events: rec.events })
    const result = await itp.run(DEMO_FLOW)
    expect(result.status).toBe('completed')
    expect(result.error).toBeUndefined()
    // s1, s2, s3(loop 块本身), s3-1×2, s4, s5 = 7
    expect(result.stepsExecuted).toBe(7)
    // 循环内插值出两条商品
    expect(rec.logs.map((l) => l.message)).toEqual(
      expect.arrayContaining([
        '=== 开始商品比价演示 ===',
        '抓取到商品: 机械键盘 A ¥299',
        '抓取到商品: 机械键盘 B ¥349',
        '共完成 2 个商品抓取'
      ])
    )
  })

  it('stepOnce 启动：第一步前暂停一次，resume 后跑完剩余', async () => {
    const rec = makeRecorder()
    const flow: FlowDoc = {
      version: 1,
      name: 't',
      vars: [],
      steps: [
        { id: 'a', cmdId: 'logMessage', params: { message: 'one' } },
        { id: 'b', cmdId: 'logMessage', params: { message: 'two' } },
        { id: 'c', cmdId: 'logMessage', params: { message: 'three' } }
      ]
    }
    let hitPaused!: () => void
    const pausedPromise = new Promise<void>((r) => {
      hitPaused = r
    })
    const itp = new Interpreter({
      registry: makeRegistry(),
      stepOnce: true,
      events: { ...rec.events, onPaused: () => hitPaused() }
    })
    const runPromise = itp.run(flow)
    await pausedPromise
    // 第一步前暂停：还没跑任何 step
    expect(rec.stepOrder).toEqual([])
    itp.resume()
    const result = await runPromise
    expect(result.status).toBe('completed')
    expect(rec.stepOrder).toEqual(['a', 'b', 'c'])
  })

  it('运行中 setStepOnce(true)：下一步前再暂停一次', async () => {
    const rec = makeRecorder()
    const flow: FlowDoc = {
      version: 1,
      name: 't',
      vars: [],
      steps: [
        { id: 'a', cmdId: 'logMessage', params: { message: 'one' } },
        { id: 'b', cmdId: 'logMessage', params: { message: 'two' } },
        { id: 'c', cmdId: 'logMessage', params: { message: 'three' } }
      ]
    }
    let hitPaused!: () => void
    const pausedPromise = new Promise<void>((r) => {
      hitPaused = r
    })
    const itp = new Interpreter({
      registry: makeRegistry(),
      events: { ...rec.events, onPaused: () => hitPaused() }
    })
    const runPromise = itp.run(flow)
    // 普通启动不停；手动请求单步 → 下一步前暂停
    itp.setStepOnce(true)
    await pausedPromise
    expect(rec.stepOrder.length).toBe(1) // a 已跑
    itp.resume()
    const result = await runPromise
    expect(result.status).toBe('completed')
    expect(rec.stepOrder).toEqual(['a', 'b', 'c'])
  })

  it('在 s4 设断点：暂停时 s1~s3 已完成、s4 未执行；resume 后跑完', async () => {
    const rec = makeRecorder()
    // 给 s4 加断点
    const flow: FlowDoc = JSON.parse(JSON.stringify(DEMO_FLOW))
    flow.steps[3].breakpoint = true

    let hitPaused!: () => void
    const pausedPromise = new Promise<void>((r) => {
      hitPaused = r
    })
    const itp = new Interpreter({
      registry: makeRegistry(),
      events: { ...rec.events, onPaused: () => hitPaused() }
    })
    const runPromise = itp.run(flow)
    await pausedPromise

    // 暂停在 s4：s1/s2/s3（含子步骤）已跑，s4/s5 未跑
    expect(rec.stepOrder).toContain('s1')
    expect(rec.stepOrder).toContain('s3-1')
    expect(rec.stepOrder).not.toContain('s4')
    expect(rec.logs.map((l) => l.message)).not.toContain('共完成 2 个商品抓取')

    itp.resume()
    const result = await runPromise
    expect(result.status).toBe('completed')
    expect(rec.stepOrder).toContain('s4')
    expect(rec.stepOrder).toContain('s5')
  })
})
