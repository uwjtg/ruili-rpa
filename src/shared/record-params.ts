/**
 * 录制流程参数化（M3 切片 9）。
 *
 * 录制出的 typeText 文本是硬编码字面量；这里把它抽成流程级变量（FlowVar），
 * 并把步骤 params.text 替换为 `${var}` 引用。运行时 ctx.interpolate 已支持
 * `${var}` 替换（interpreter.ts），因此回放仍输入原文本（变量默认值=录到的文本），
 * 用户可在「参数」面板改变量值而不用逐个改步骤。
 *
 * 仅参数化 typeText.text；已含 `${...}` 的文本与其它指令（pickElement/scroll/pressKey）
 * 不动，保持向后兼容。
 */
import type { FlowVar } from './ast'
import type { RecordedInstruction } from './desktop-record'

export interface ParametrizedStep {
  cmdId: string
  params: Record<string, unknown>
}

export interface ParametrizedRecording {
  steps: ParametrizedStep[]
  vars: FlowVar[]
}

/** 生成不与现有变量重名的变量名：input1 / input2 … */
function nextVarName(used: Set<string>): string {
  let n = used.size + 1
  for (;;) {
    const name = `input${n}`
    if (!used.has(name)) {
      used.add(name)
      return name
    }
    n++
  }
}

/**
 * 把录制指令参数化。existingVars 用于避开流程已有变量名。
 * 返回新步骤（params 已替换）与新增变量（默认值=录制到的文本）。
 */
export function parameterizeRecording(
  instructions: RecordedInstruction[],
  existingVars: FlowVar[] = []
): ParametrizedRecording {
  const used = new Set(existingVars.map((v) => v.name))
  const vars: FlowVar[] = []
  const steps = instructions.map((ins) => {
    const params: Record<string, unknown> = { ...(ins.params ?? {}) }
    if (
      ins.cmdId === 'typeText' &&
      typeof params.text === 'string' &&
      params.text.length > 0 &&
      !params.text.includes('${')
    ) {
      const name = nextVarName(used)
      vars.push({ name, type: 'string', value: params.text })
      params.text = `\${${name}}`
    }
    return { cmdId: ins.cmdId, params }
  })
  return { steps, vars }
}
