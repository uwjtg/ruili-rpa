/**
 * 运行管理器（阶段 4 贯通 / M1 引擎 MVP 增强）。
 *
 * 主进程持有，把命令注册表 + 解释器 + 校验 + 事件转线串起来。
 * M1 新增：
 *  - 资源生命周期：无论流程 completed / error / cancelled，run 结束时统一释放
 *    本次运行可能占用的浏览器与 Excel 工作簿（不再残留进程/句柄）。
 *  - 整体超时：可选 timeoutMs，到时协作式 stop() 并推一条 warn 日志。
 *
 * 不依赖 Electron，便于 vitest 直接测事件流与资源清理；Electron 侧只做 IPC 转发。
 */

import type { FlowDoc, RunResult } from '../../shared/ast'
import type { RunWireEvent } from '../../shared/run-protocol'
import { CommandRegistry } from '../commands/registry'
import { Interpreter } from '../core/interpreter'
import { hasError, validateFlow } from '../core/validate'
import { registerDemoCommands } from '../commands/demo'
import { registerWebCommands } from '../web/commands'
import { registerExcelCommands } from '../excel/commands'
import { registerSidecarCommands } from '../sidecar/commands'
import { registerDesktopCommands } from '../desktop/commands'
import { registerUtilCommands } from '../commands/util'
import { registerSystemCommands } from '../commands/system'
import { registerDataCommands } from '../commands/data'
import { registerCsvCommands } from '../commands/csv'
import { registerFileExtraCommands } from '../commands/util'
import { registerDataExtraCommands } from '../commands/data'
import { getWebSession } from '../web/session'
import { getExcelSession } from '../excel/workbook'

/** 组装一份带全部已实现指令的注册表 */
export function buildEngineRegistry(): CommandRegistry {
  const reg = new CommandRegistry()
  registerDemoCommands(reg)
  registerWebCommands(reg)
  registerExcelCommands(reg)
  registerSidecarCommands(reg)
  registerDesktopCommands(reg)
  registerUtilCommands(reg)
  registerSystemCommands(reg)
  registerDataCommands(reg)
  registerCsvCommands(reg)
  registerFileExtraCommands(reg)
  registerDataExtraCommands(reg)
  return reg
}

/** 一次运行结束时需要释放的资源钩子（可被测试替换） */
export interface RunDisposer {
  /** 关闭正在运行的浏览器；返回是否实际关闭了 */
  disposeWeb(): Promise<boolean>
  /** 释放打开着的 Excel 工作簿；返回是否实际关闭了 */
  disposeExcel(): Promise<boolean>
}

/** 默认实现：直接驱动模块级 web/excel 单例 */
class DefaultRunDisposer implements RunDisposer {
  async disposeWeb(): Promise<boolean> {
    const session = getWebSession()
    if (!session.isRunning()) return false
    await session.close()
    return true
  }
  async disposeExcel(): Promise<boolean> {
    const session = getExcelSession()
    if (!session.isOpen()) return false
    session.close()
    return true
  }
}

export class RunValidationError extends Error {
  constructor(public issues: Array<{ stepId?: string; message: string }>) {
    super(`流程校验未通过：${issues.map((i) => i.message).join('；')}`)
    this.name = 'RunValidationError'
  }
}

export interface StartOptions {
  /** 整体运行超时（毫秒）；到时协作式 stop()。默认不限制 */
  timeoutMs?: number
  /** 注入初始变量（如触发器传 triggerFile） */
  initialVars?: Record<string, unknown>
}

export class RunManager {
  private interpreter: Interpreter | null = null
  private readonly registry: CommandRegistry
  private readonly disposer: RunDisposer
  /** 下次 start 是否以单步模式启动（step-over） */
  private stepOncePending = false

  constructor(
    private readonly emit: (e: RunWireEvent) => void,
    registry?: CommandRegistry,
    disposer?: RunDisposer
  ) {
    this.registry = registry ?? buildEngineRegistry()
    this.disposer = disposer ?? new DefaultRunDisposer()
  }

  /** 启动一次流程（异步；结果经 flow-end 事件推送） */
  start(flow: FlowDoc, opts: StartOptions = {}): void {
    const issues = validateFlow(flow, this.registry)
    if (hasError(issues)) {
      throw new RunValidationError(issues)
    }
    this.interpreter = new Interpreter({
      registry: this.registry,
      stepOnce: this.stepOncePending,
      initialVars: opts.initialVars,
      events: {
        onFlowStart: (f) => this.emit({ type: 'flow-start', flowName: f.name }),
        onStepStart: (s, d) =>
          this.emit({ type: 'step-start', stepId: s.id, cmdId: s.cmdId, depth: d }),
        onStepEnd: (s, result) =>
          this.emit({ type: 'step-end', stepId: s.id, result }),
        onLog: (level, message) => this.emit({ type: 'log', level, message }),
        onPaused: (s) => this.emit({ type: 'paused', stepId: s.id }),
        onResumed: (s) => this.emit({ type: 'resumed', stepId: s.id }),
        onFlowEnd: (r: RunResult) => this.emit({ type: 'flow-end', result: r })
      }
    })

    let timer: ReturnType<typeof setTimeout> | null = null
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        this.emit({
          type: 'log',
          level: 'warn',
          message: `运行超时（${opts.timeoutMs}ms），触发停止`
        })
        this.interpreter?.stop()
      }, opts.timeoutMs)
    }

    // fire-and-forget；异常已在解释器内捕获为 flow-end error
    const stepOnce = this.stepOncePending
    this.stepOncePending = false
    void this.interpreter
      .run(flow)
      .finally(() => {
        void stepOnce
        if (timer) clearTimeout(timer)
        // 无论 completed / error / cancelled，都释放本次运行占用的资源
        void this.disposeResources().finally(() => {
          this.interpreter = null
        })
      })
  }

  /** 是否有流程正在运行（计划任务互斥用） */
  isRunning(): boolean {
    return this.interpreter !== null
  }

  /** 单步：正在跑则下一步前暂停；未启动则下次 start 以单步模式开始 */
  step(): void {
    if (this.interpreter) {
      this.interpreter.setStepOnce(true)
    } else {
      this.stepOncePending = true
    }
  }

  resume(): void {
    this.interpreter?.resume()
  }

  stop(): void {
    this.interpreter?.stop()
  }

  /** 统一清理浏览器 / Excel；失败只记 warn，不影响 flow-end 结果 */
  private async disposeResources(): Promise<void> {
    try {
      const closedWeb = await this.disposer.disposeWeb()
      if (closedWeb) {
        this.emit({ type: 'log', level: 'info', message: '运行结束：已关闭浏览器' })
      }
    } catch (e) {
      this.emit({
        type: 'log',
        level: 'warn',
        message: `关闭浏览器失败：${e instanceof Error ? e.message : String(e)}`
      })
    }
    try {
      const closedExcel = await this.disposer.disposeExcel()
      if (closedExcel) {
        this.emit({ type: 'log', level: 'info', message: '运行结束：已释放 Excel 工作簿' })
      }
    } catch (e) {
      this.emit({
        type: 'log',
        level: 'warn',
        message: `释放 Excel 失败：${e instanceof Error ? e.message : String(e)}`
      })
    }
  }
}
