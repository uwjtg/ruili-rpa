/**
 * 流程包（.json）导入导出格式与纯函数校验（M5 切片 24）。
 *
 * 导出文件形如：
 *   { "meta": { "app":"ruili-rpa-flow", "format":1, "exportedAt":173... },
 *     "flow": { version, name, vars, steps } }
 * 为兼容用户手改/历史文件，导入时也接受「顶层就是 FlowDoc」的裸格式。
 *
 * 本模块不依赖 Electron / DOM，main 与 renderer 两端可共用，便于单测。
 */
import type { FlowDoc, StepNode } from './ast'

export const PACKAGE_APP = 'ruili-rpa-flow'
export const PACKAGE_FORMAT = 1

export interface FlowPackageMeta {
  app: string
  format: number
  exportedAt: number
}

/** 导出文件的完整包结构 */
export interface FlowPackage {
  meta: FlowPackageMeta
  flow: FlowDoc
}

/** 递归检查步骤节点形状（最小结构校验，不查指令是否注册——那是运行时的事） */
function isStepNode(v: unknown): v is StepNode {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.cmdId === 'string' &&
    typeof o.params === 'object' &&
    o.params !== null &&
    (o.children === undefined || Array.isArray(o.children)) &&
    (o.else === undefined || Array.isArray(o.else))
  )
}

/** 最小结构校验：像不像一份 FlowDoc */
export function isFlowDoc(v: unknown): v is FlowDoc {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.version !== 'number') return false
  if (typeof o.name !== 'string' || !o.name.trim()) return false
  if (!Array.isArray(o.vars)) return false
  if (!Array.isArray(o.steps) || o.steps.length === 0) return false
  return o.steps.every(isStepNode)
}

/** 把一份 FlowDoc 包成导出用的 FlowPackage */
export function buildFlowPackage(flow: FlowDoc): FlowPackage {
  return {
    meta: { app: PACKAGE_APP, format: PACKAGE_FORMAT, exportedAt: Date.now() },
    flow
  }
}

/**
 * 解析导入文件文本。
 * 接受两种：标准包 {meta, flow} 或裸 FlowDoc。
 * 成功返回 flow；失败返回中文错误原因。
 */
export function parseFlowPackage(
  text: string
): { ok: true; flow: FlowDoc } | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `不是合法 JSON：${e instanceof Error ? e.message : String(e)}` }
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: '文件内容不是对象' }
  }
  const o = raw as Record<string, unknown>
  // 标准包：取 .flow
  const candidate: unknown =
    o.meta && typeof o.flow === 'object' ? o.flow : raw
  if (!isFlowDoc(candidate)) {
    return {
      ok: false,
      error: '内容不像一份流程（需含 version/name/vars/steps，且 steps 非空）'
    }
  }
  // 归一化：version 兜底为 1
  return { ok: true, flow: { ...candidate, version: 1 } }
}
