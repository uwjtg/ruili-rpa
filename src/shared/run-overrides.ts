/**
 * 运行前变量覆盖（M3 切片 10）。
 *
 * 点「运行」时若流程声明了变量（FlowDoc.vars），弹出对话框让用户填值；
 * 这里把用户填的字符串覆盖值合并进一份流程拷贝，返回给解释器运行。
 * 未填/留空沿用流程默认值；number 型变量做有限性校验，非法回退默认。
 */
import type { FlowDoc, FlowVar } from './ast'

/** 把覆盖值合并进流程变量，返回新 flow（不改原对象）。 */
export function applyRunOverrides(
  flow: FlowDoc,
  overrides: Record<string, string>
): FlowDoc {
  const vars: FlowVar[] = flow.vars.map((v) => {
    const raw = overrides[v.name]
    if (raw === undefined) return v
    if (v.type === 'number') {
      const n = Number(raw)
      return Number.isFinite(n) && raw.trim() !== '' ? { ...v, value: n } : v
    }
    if (v.type === 'boolean') {
      return { ...v, value: raw === 'true' || raw === '1' }
    }
    return { ...v, value: raw }
  })
  return { ...flow, vars }
}

/**
 * 返回「必填但当前填值为空」的变量名列表（M3 切片 14）。
 * 运行前弹窗用它在提交时阻止运行并提示；required 未设/为 false 的变量不参与。
 */
export function missingRequiredOverrides(
  vars: FlowVar[],
  values: Record<string, string>
): string[] {
  return vars
    .filter((v) => v.required === true && (values[v.name] ?? '').trim() === '')
    .map((v) => v.name)
}
