/**
 * 桌面元素拾取（M3 切片 1）+ 选择器回退链（M3 切片 2）跨进程契约。
 *
 * 拾取链路：renderer 调 pick:start → 主进程 → Python sidecar（全屏遮罩 + UIA
 * 高亮 + 点击回传）→ pick:result 事件 + invoke 返回，两侧共用本文件类型。
 * 拾取结果同时是 pickElement 指令的 target 参数（回放时按选择器回退链定位并点击）。
 *
 * 回放链路（M3 切片 2）：sidecar click_element 按 严格属性 → 宽松属性 →
 * ancestor 链 → index → 坐标 逐级降级定位，命中策略经 ClickElementReply.strategy
 * 上报，供日志与元素库校验展示。
 */

/** 元素包围盒（物理像素；与 UIA BoundingRectangle 对齐） */
export interface ElementBox {
  x: number
  y: number
  width: number
  height: number
}

/** ancestor 链中的一层：记录祖先控件的非空特征（定位时逐级下钻） */
export interface ElementAncestor {
  controlType: string
  name: string
  automationId: string
}

/**
 * 一次拾取得到的元素信息（写入 pickElement 步骤的 params.target）。
 *
 * M3 切片 2 扩展：新增 windowTitle / processId / text / index / ancestor，
 * 全部可选——旧流程里已落盘的 target JSON（无这些字段）仍可回放（回退链
 * 会跳过对应策略），向后兼容。
 */
export interface PickedElement {
  /** 元素所在顶层窗口句柄（HWND；子控件取所属窗口） */
  windowHandle: number
  /** UIA AutomationId（可能为空串） */
  automationId: string
  /** UIA Name（可能为空串） */
  name: string
  /** UIA ControlTypeName，如 ButtonControl / EditControl */
  controlType: string
  /** Win32 类名（可能为空串） */
  className: string
  boundingBox: ElementBox
  /** 顶层窗口标题（窗口定位锚；无句柄或句柄失效时的降级入口） */
  windowTitle?: string
  /** 所属进程 PID */
  processId?: number
  /** 可见文本（表单/按钮；通常等于 Name，独立记录便于文本定位） */
  text?: string
  /** 目标控件在父级 children 中的序号（-1 表示未知） */
  index?: number
  /** 祖先链（从近到远，最多 3 层；ancestor[0] 是目标控件的直接父级） */
  ancestor?: ElementAncestor[]
}

/** pick:start 的返回 / pick:result 事件载荷 */
export type PickReply =
  | { ok: true; element: PickedElement; elementId?: string }
  | { ok: true; cancelled: true }
  | { ok: false; error: string }

/** pick:stop 的返回 */
export interface PickStopReply {
  ok: boolean
  /** 是否真的中断了一次进行中的拾取 */
  stopped?: boolean
  error?: string
}

/** 回放实际命中的定位策略（选择器回退链各级） */
export type ClickStrategy =
  | 'strict' // 全部非空强特征精确匹配
  | 'property' // 任一非空特征宽松匹配（切片 1 语义）
  | 'ancestor' // 祖先链逐级下钻定位
  | 'index' // 父级 children 按序号定位
  | 'coords' // 拾取时包围盒中心坐标兜底

/** pickElement 指令回放：/desktop/click_element 的返回 */
export interface ClickElementReply {
  ok: boolean
  /** 命中的回退链策略（sidecar 上报；供日志展示与元素库校验） */
  strategy?: ClickStrategy
  error?: string
}

/** 元素库「校验」/ dry-run：/desktop/locate_element 的返回（只定位不点击） */
export interface LocateElementReply {
  ok: boolean
  /** 是否按回退链定位成功 */
  found?: boolean
  /** 命中策略（strict/property/ancestor/index/coords）；未命中为 'none' */
  strategy?: ClickStrategy | 'none'
  error?: string
}
