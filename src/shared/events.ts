/**
 * 引擎执行事件类型。
 *
 * 阶段 2 定义解释器直接回调的事件集（进程内同步回调）；
 * 阶段 4 接 IPC 日志流时，在此基础上补充 wire 格式（带步骤 id、变量快照等）。
 */

import type { FlowDoc, RunResult, StepNode } from './ast'

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

/**
 * 运行钩子：UI / 测试传入，解释器在生命周期各节点回调。
 * 全部可选——不关心的节点可不传。
 */
export interface RunEvents {
  onFlowStart?: (flow: FlowDoc) => void
  onStepStart?: (step: StepNode, depth: number) => void
  onStepEnd?: (step: StepNode, result: unknown) => void
  onLog?: (level: LogLevel, message: string) => void
  /** 命中断点：解释器暂停，等待外部 resume() */
  onPaused?: (step: StepNode) => void
  onResumed?: (step: StepNode) => void
  onFlowEnd?: (result: RunResult) => void
  /** R2：某个顶层步骤完成后，记录断点（步骤 id / 完成索引 / 全局变量快照） */
  onCheckpoint?: (stepId: string, completedIndex: number, vars: Record<string, unknown>) => void
}
