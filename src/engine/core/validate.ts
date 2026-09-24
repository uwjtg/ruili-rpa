/**
 * 流程 AST 静态校验（阶段 4，闭合阶段 2 遗留）。
 *
 * 在保存/运行前尽早暴露结构性问题，而不是等执行到一半才抛错。
 * 校验是「建议级」：error 阻止运行，warn 仅提示。
 */

import type { FlowDoc, StepNode } from '../../shared/ast'
import type { CommandRegistry } from '../commands/registry'

export interface FlowIssue {
  stepId?: string
  severity: 'error' | 'warn'
  message: string
}

export function validateFlow(flow: FlowDoc, registry: CommandRegistry): FlowIssue[] {
  const issues: FlowIssue[] = []
  const walk = (steps: StepNode[] | undefined, depth: number): void => {
    if (!steps) return
    for (const step of steps) {
      const cmd = registry.get(step.cmdId)
      if (!cmd) {
        issues.push({
          stepId: step.id,
          severity: 'error',
          message: `未注册的指令: ${step.cmdId}`
        })
        continue
      }
      const hasChildren = step.children && step.children.length > 0
      if (cmd.hasEnd && !hasChildren) {
        issues.push({
          stepId: step.id,
          severity: 'warn',
          message: `块指令 ${cmd.id} 没有子步骤`
        })
      }
      if (!cmd.hasEnd && hasChildren) {
        issues.push({
          stepId: step.id,
          severity: 'warn',
          message: `非块指令 ${cmd.id} 却带了子步骤（会被忽略）`
        })
      }
      walk(step.children, depth + 1)
      walk(step.else, depth + 1)
    }
  }
  walk(flow.steps, 0)
  return issues
}

export function hasError(issues: FlowIssue[]): boolean {
  return issues.some((i) => i.severity === 'error')
}
