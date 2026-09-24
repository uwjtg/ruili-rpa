/**
 * 单条指令执行时可见的上下文。
 *
 * 由解释器实现，指令通过它：
 *  - 读写变量（沿作用域栈查找，块指令绑定的循环项为局部作用域）
 *  - 打日志（四级）
 *  - 执行子步骤（块指令递归入口，解释器统一做断点/禁用/取消检查）
 *  - 检测取消、插值 ${var} 模板
 */

import type { StepNode } from '../../shared/ast'
import type { LogLevel } from '../../shared/events'

export interface RunContext {
  /** 读变量（沿作用域栈由内向外查找） */
  getVar<T = unknown>(name: string): T | undefined
  /** 写变量：已存在则更新最近一层，否则写到全局作用域 */
  setVar(name: string, value: unknown): void
  log(level: LogLevel, message: string): void
  /**
   * 执行子步骤（块指令用）。bindings 作为新作用域变量注入（如循环当前项）。
   * 解释器会对每个子步骤统一做断点 / 禁用 / 取消检查。
   */
  execChildren(
    children: StepNode[] | undefined,
    bindings?: Record<string, unknown>
  ): Promise<void>
  /** 是否已请求停止 */
  isCancelled(): boolean
  /** 解析字符串中的 ${var} / ${var.prop} 模板；未解析到的片段置空串 */
  interpolate(template: string): string
}
