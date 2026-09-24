/**
 * 锐流 RPA 流程 AST 类型（V3）
 *
 * 树形结构替代原型的 indent 展平表达；UI 与引擎共用。
 * 块指令（循环/分支）通过 children / else 表达嵌套，渲染时递归生成缩进与结束标记。
 */

export type VarType = 'string' | 'number' | 'boolean' | 'list' | 'dict'

/** 流程级变量 */
export interface FlowVar {
  name: string
  type: VarType
  value: unknown
}

/** 单个步骤节点（树形 AST） */
export interface StepNode {
  /** 步骤唯一 id，如 s1 / s2-1 */
  id: string
  /** 引用指令注册表中的 cmdId */
  cmdId: string
  /** 指令参数（值多为字符串/数字，运行时由指令自行解释；支持 ${var} 插值） */
  params: Record<string, unknown>
  /** 块指令的子步骤（循环体 / if 真分支） */
  children?: StepNode[]
  /** if 假分支 */
  else?: StepNode[]
  /** 禁用：执行时跳过并记日志 */
  disabled?: boolean
  /** 断点：执行该步前暂停，等待 resume */
  breakpoint?: boolean
}

/** 一份流程文档（可序列化为 JSON） */
export interface FlowDoc {
  version: number
  name: string
  vars: FlowVar[]
  steps: StepNode[]
}

/** 一次运行的结果摘要 */
export type RunStatus = 'completed' | 'cancelled' | 'error'

export interface RunResult {
  flowName: string
  status: RunStatus
  stepsExecuted: number
  error?: string
  durationMs: number
}
