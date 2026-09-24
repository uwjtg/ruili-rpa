/**
 * 录制流程参数化（M3 切片 9）。
 *
 * 录制出的 typeText 文本是硬编码字面量；这里把它抽成流程级变量（FlowVar），
 * 并把步骤 params.text 替换为 `${var}` 引用。运行时 ctx.interpolate 已支持
 * `${var}` 替换（interpreter.ts），因此回放仍输入原文本（变量默认值=录到的文本），
 * 用户可在「参数」面板改变量值而不用逐个改步骤。
 *
 * 参数化范围：
 *  - typeText.text → string 变量（切片 9）；scroll.delta/x/y → number 变量（切片 11）；
 *  - pickElement target.boundingBox 的 x/y → number 变量（切片 15，点击坐标兜底位置）。
 * 已含 `${...}` 的文本/数值与其它指令不动，保持向后兼容。
 *
 * M3 切片 14：抽出的变量一律带 description（录制场景说明），required 缺省 false
 * （有默认值=录制到的值，无需必填）。
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

/** 生成不与已有变量重名的变量名：input1 / scrollDelta1 … */
function nextVarName(used: Set<string>, base: string): string {
  let n = 1
  for (;;) {
    const name = `${base}${n}`
    if (!used.has(name)) {
      used.add(name)
      return name
    }
    n++
  }
}

/**
 * 把录制指令参数化。existingVars 用于避开流程已有变量名。
 * - typeText.text → string 变量；
 * - scroll.delta / x / y（数值）→ number 变量（M3 切片 11）；
 * - pickElement target.boundingBox 的 x / y（数值）→ number 变量（M3 切片 15）；
 *   有抽取时 target 转 JSON 字符串（含 ${var}），供运行时插值后 JSON.parse；
 *   无抽取（对象/字符串原本就带 ${} 或非数值）保持原样。
 * 返回新步骤（params 已替换）与新增变量（默认值=录制到的值，带说明）。
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
      const name = nextVarName(used, 'input')
      vars.push({ name, type: 'string', value: params.text, description: '录制输入文本' })
      params.text = `\${${name}}`
    }
    // M3 切片 11：滚动量与坐标兜底位置抽为 number 变量
    if (ins.cmdId === 'scroll') {
      const numFields: Array<[key: string, base: string, desc: string]> = [
        ['delta', 'scrollDelta', '滚动量（正=向上）'],
        ['x', 'scrollX', '滚动位置 X（窗口内）'],
        ['y', 'scrollY', '滚动位置 Y（窗口内）']
      ]
      for (const [key, base, desc] of numFields) {
        const v = params[key]
        if (typeof v === 'number' && Number.isFinite(v)) {
          const name = nextVarName(used, base)
          vars.push({ name, type: 'number', value: v, description: desc })
          params[key] = `\${${name}}`
        }
      }
    }
    // M3 切片 15：pickElement 坐标兜底包围盒的 x/y 抽为 number 变量
    if (ins.cmdId === 'pickElement') {
      const obj = parameterizeClickBox(params, used, vars)
      // 有抽取 → 一律转 JSON 字符串（含 ${var}）；运行时先插值再 parse。
      // 对象 target 无法走运行时字符串插值，必须转字符串才有意义。
      if (obj) params.target = JSON.stringify(obj)
    }
    return { cmdId: ins.cmdId, params }
  })
  return { steps, vars }
}

/** 解析 target JSON 字符串；非法返回 null。 */
function safeParseTarget(raw: string): Record<string, unknown> | null {
  try {
    const obj: unknown = JSON.parse(raw)
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * 对 pickElement 的 target（对象或 JSON 字符串）里的 boundingBox.x/y 抽变量。
 * 返回改造后的 target 对象（已替换字段为 ${var}）；无可抽取时返回 null（保持原样）。
 * 已含 `${}` 的字符串视为已参数化，跳过避免二次抽取。
 */
function parameterizeClickBox(
  params: Record<string, unknown>,
  used: Set<string>,
  vars: FlowVar[]
): Record<string, unknown> | null {
  const raw = params.target
  if (typeof raw !== 'string' && typeof raw !== 'object') return null
  let obj: Record<string, unknown> | null
  if (typeof raw === 'string') {
    if (raw.includes('${')) return null // 已参数化过，避免二次抽取
    obj = safeParseTarget(raw)
  } else {
    obj = raw as Record<string, unknown>
  }
  if (!obj || typeof obj !== 'object') return null
  const bb = obj.boundingBox
  if (!bb || typeof bb !== 'object') return null
  let extracted = 0
  for (const [key, base, desc] of [
    ['x', 'clickX', '点击坐标 X（拾取时屏幕坐标）'],
    ['y', 'clickY', '点击坐标 Y（拾取时屏幕坐标）']
  ] as const) {
    const v = (bb as Record<string, unknown>)[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      const name = nextVarName(used, base)
      vars.push({ name, type: 'number', value: v, description: desc })
      ;(bb as Record<string, unknown>)[key] = `\${${name}}`
      extracted++
    }
  }
  return extracted > 0 ? obj : null
}
