/**
 * 运行事件的 IPC wire 格式（阶段 4）。
 *
 * 进程内 RunEvents（events.ts）回调带 StepNode 等活对象；跨 IPC 必须序列化为
 * 纯 JSON。这里定义主进程 → 渲染端推送的事件形状，两端共用。
 */

import type { FlowDoc, RunResult } from './ast'
import type { LogLevel } from './events'

export type RunWireEvent =
  | { type: 'flow-start'; flowName: string }
  | { type: 'step-start'; stepId: string; cmdId: string; depth: number }
  | { type: 'step-end'; stepId: string; result: unknown }
  | { type: 'log'; level: LogLevel; message: string }
  | { type: 'paused'; stepId: string }
  | { type: 'resumed'; stepId: string }
  | { type: 'flow-end'; result: RunResult }
  | { type: 'checkpoint'; stepId: string; completedIndex: number; vars: Record<string, unknown> }

/** 渲染端 → 主进程的运行控制请求 */
export type RunControl =
  | { kind: 'start'; flow: FlowDoc }
  | { kind: 'resume' }
  | { kind: 'stop' }
