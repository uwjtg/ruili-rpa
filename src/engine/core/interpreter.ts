/**
 * AST 解释器（阶段 2 POC）。
 *
 * 职责：
 *  - 深度优先遍历 FlowDoc.steps 树
 *  - 为每步查指令注册表并调用 runner
 *  - 维护变量作用域栈（全局 + 块指令绑定的局部作用域）
 *  - 实现断点（暂停/继续）、禁用跳过、取消（stop）
 *  - 通过 RunEvents 回调把生命周期 / 日志推给 UI 或测试
 *
 * 不做（留待后续阶段）：
 *  - 流程 AST 校验（块闭合/空分支/变量未定义警告）→ 阶段 2 不强制
 *  - 单步执行、变量监视、超时 → 阶段 4+
 *  - IPC 推送 → 阶段 4
 */

import type { FlowDoc, RunResult, StepNode } from '../../shared/ast'
import type { LogLevel, RunEvents } from '../../shared/events'
import type { RunContext } from './context'
import type { CommandRegistry } from '../commands/registry'

class CancelledError extends Error {
  constructor() {
    super('流程已被停止')
    this.name = 'CancelledError'
  }
}

interface Scope {
  vars: Map<string, unknown>
}

export interface InterpreterOptions {
  registry: CommandRegistry
  events?: RunEvents
  /** 初始即进入单步模式：每步执行前暂停（step-over） */
  stepOnce?: boolean
  /** 运行前注入的初始变量（触发器/外部传参，如文件监听的 triggerFile） */
  initialVars?: Record<string, unknown>
}

export class Interpreter {
  private readonly registry: CommandRegistry
  private readonly events: RunEvents

  /** 作用域栈：栈底为全局变量 */
  private scopes: Scope[] = []
  /** 等待 resume 的 resolve 函数队列 */
  private resumeWaiters: Array<() => void> = []
  private cancelled = false
  private stepsExecuted = 0
  private currentDepth = 0
  /** 单步门闩：true 时下一步执行前暂停一次并自动复位 */
  private stepOnce: boolean
  private readonly initialVars?: Record<string, unknown>

  constructor(opts: InterpreterOptions) {
    this.registry = opts.registry
    this.events = opts.events ?? {}
    this.stepOnce = opts.stepOnce ?? false
    this.initialVars = opts.initialVars
  }

  /** 请求单步：若正等断点则放行一步；否则下次执行前暂停 */
  setStepOnce(v: boolean): void {
    this.stepOnce = v
    if (v) this.flushWaiters()
  }

  /** 请求停止：立刻解阻塞所有断点等待；正在跑的指令在下一次检查点抛出 */
  stop(): void {
    this.cancelled = true
    this.flushWaiters()
  }

  /** 命中断点后外部调用以继续执行 */
  resume(): void {
    this.flushWaiters()
  }

  private flushWaiters(): void {
    const w = this.resumeWaiters
    this.resumeWaiters = []
    for (const fn of w) fn()
  }

  async run(flow: FlowDoc): Promise<RunResult> {
    const start = Date.now()
    this.cancelled = false
    this.stepsExecuted = 0
    const rootVars = new Map(flow.vars.map((v) => [v.name, v.value]))
    if (this.initialVars) for (const [k, v] of Object.entries(this.initialVars)) rootVars.set(k, v)
    this.scopes = [{ vars: rootVars }]
    this.events.onFlowStart?.(flow)

    let status: RunResult['status'] = 'completed'
    let error: string | undefined
    try {
      await this.execSteps(flow.steps, 0)
    } catch (e) {
      if (e instanceof CancelledError) {
        status = 'cancelled'
      } else {
        status = 'error'
        error = e instanceof Error ? e.message : String(e)
      }
    }
    const result: RunResult = {
      flowName: flow.name,
      status,
      stepsExecuted: this.stepsExecuted,
      error,
      durationMs: Date.now() - start
    }
    this.events.onFlowEnd?.(result)
    this.scopes = []
    return result
  }

  private async execSteps(steps: StepNode[], depth: number): Promise<void> {
    for (const step of steps) {
      this.throwIfCancelled()
      await this.executeStep(step, depth)
    }
  }

  private async executeStep(step: StepNode, depth: number): Promise<void> {
    // 禁用：整步跳过
    if (step.disabled) {
      this.events.onLog?.('warn', `跳过已禁用步骤 ${step.id}（${step.cmdId}）`)
      return
    }

    // 断点 / 单步：执行前暂停（单步门闩消费一次后自动复位，由外部再次请求）
    const stepOnce = this.stepOnce
    if (stepOnce) this.stepOnce = false
    if (step.breakpoint || stepOnce) {
      this.events.onPaused?.(step)
      await new Promise<void>((resolve) => {
        this.resumeWaiters.push(resolve)
      })
      this.throwIfCancelled()
      this.events.onResumed?.(step)
    }

    const cmd = this.registry.get(step.cmdId)
    if (!cmd) {
      throw new Error(`未注册的指令: ${step.cmdId}（步骤 ${step.id}）`)
    }

    this.currentDepth = depth
    this.events.onStepStart?.(step, depth)
    this.stepsExecuted++

    const ctx = this.buildContext()
    let result: unknown
    try {
      result = await cmd.runner(ctx, step.params, step)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.events.onLog?.(
        'error',
        `步骤 ${step.id}（${step.cmdId}）执行失败: ${msg}`
      )
      throw e
    }
    this.events.onStepEnd?.(step, result)
  }

  private buildContext(): RunContext {
    const self = this
    return {
      getVar<T>(name: string): T | undefined {
        return self.lookupVar(name) as T | undefined
      },
      setVar(name: string, value: unknown): void {
        self.assignVar(name, value)
      },
      log(level: LogLevel, message: string): void {
        self.events.onLog?.(level, message)
      },
      async execChildren(children, bindings) {
        await self.execChildrenWithBindings(
          children,
          bindings ?? {},
          self.currentDepth
        )
      },
      isCancelled() {
        return self.cancelled
      },
      interpolate(template: string): string {
        return self.interpolate(template)
      }
    }
  }

  private async execChildrenWithBindings(
    children: StepNode[] | undefined,
    bindings: Record<string, unknown>,
    parentDepth: number
  ): Promise<void> {
    if (!children || children.length === 0) return
    this.scopes.push({ vars: new Map(Object.entries(bindings)) })
    try {
      await this.execSteps(children, parentDepth + 1)
    } finally {
      this.scopes.pop()
    }
  }

  private lookupVar(name: string): unknown {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const v = this.scopes[i].vars.get(name)
      if (v !== undefined) return v
    }
    return undefined
  }

  private assignVar(name: string, value: unknown): void {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].vars.has(name)) {
        this.scopes[i].vars.set(name, value)
        return
      }
    }
    this.scopes[0].vars.set(name, value)
  }

  private interpolate(template: string): string {
    return template.replace(/\$\{([^}]+)\}/g, (_match, path: string) => {
      const parts = path.trim().split('.')
      let cur: unknown = this.lookupVar(parts[0])
      for (let i = 1; i < parts.length; i++) {
        if (cur == null) return ''
        cur = (cur as Record<string, unknown>)[parts[i]]
      }
      return cur == null ? '' : String(cur)
    })
  }

  private throwIfCancelled(): void {
    if (this.cancelled) throw new CancelledError()
  }
}
