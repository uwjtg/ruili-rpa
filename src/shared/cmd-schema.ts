/**
 * 指令插件 schema（UI 与引擎共用的"契约"部分）。
 *
 * 注意：runner（执行函数）依赖引擎侧 RunContext，放在
 * src/engine/commands/registry.ts 的 RegisteredCommand 上，不进本文件，
 * 避免 shared 反向依赖 engine。
 */

/** 参数控件类型（对应原型 k/l/t/v/opts） */
export type ParamType = 'text' | 'number' | 'select' | 'boolean'

export interface ParamOption {
  value: string
  label: string
}

export interface ParamField {
  /** 参数 key（存入 step.params） */
  key: string
  /** 展示名 */
  label: string
  type: ParamType
  default?: unknown
  options?: ParamOption[]
  placeholder?: string
}

/**
 * 指令元数据（UI 可见部分）：左侧指令库、参数面板、步骤摘要都从这里渲染。
 */
export interface CmdMeta {
  id: string
  name: string
  /** 分组，对应左侧指令库 9 大分类 */
  group: string
  icon: string
  params: ParamField[]
  /** 步骤摘要（参数预览），UI 渲染副行 */
  summary: (params: Record<string, unknown>) => string
  /** 是否块指令（循环/分支，有 children） */
  hasEnd?: boolean
  category?: { color?: string }
}
