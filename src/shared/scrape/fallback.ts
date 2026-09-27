/**
 * 选择器回退链（M7-36，对应计划书 §6.2）。
 *
 * 影刀的核心壁垒是"选择器自愈"。本模块把一个元素在录制时能拿到的多种特征，
 * 编译成一份**按稳定性排序的候选选择器列表**；回放时依次尝试，前一个失效就降级到下一个。
 *
 * 排序（越靠前越稳、越不容易随布局变）：
 *   #id → [data-testid] → [aria-label] → [name] → role → tag.stableClass → text= → 全 CSS 路径
 *
 * 纯函数、无 DOM 依赖，可在 vitest 直接测；浏览器侧拿到这个数组逐个 locator 试即可。
 */

/** 录制时从元素上冗余抓到的特征包（pick 时一次存全） */
export interface ElementFeatures {
  id?: string
  name?: string
  ariaLabel?: string
  dataTestid?: string
  role?: string
  placeholder?: string
  text?: string
  tag?: string
  /** 去掉构建 hash 后的稳定 class（product_abc123 -> product） */
  classStem?: string
  /** 既有全 CSS 路径（最后兜底） */
  cssPath?: string
  /** 元素到根的 XPath（比 CSS 路径更抗 class/结构微调） */
  xpath?: string
}

function cssEscape(s: string): string {
  // 属性值选择器里转义引号与反斜杠
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** 去尾部构建 hash（product_abc123 / css-1a2b3cd -> product / css） */
export function stripHashClass(raw: string): string {
  const first = raw.trim().split(/\s+/)[0] ?? ''
  return first.replace(/[-_][a-zA-Z0-9]{6,}$/, '')
}

/**
 * 由特征包生成按稳定性排序的候选选择器，自动去重、跳过空值。
 * 约定：text 类候选以 "text=" 前缀开头，由调用方映射到 getByText；其余为 CSS 选择器。
 */
export function buildFallbackSelectors(f: ElementFeatures): string[] {
  const out: string[] = []
  const push = (s: string | undefined): void => {
    if (!s) return
    if (!out.includes(s)) out.push(s)
  }

  if (f.id) push('#' + f.id)
  if (f.dataTestid) push(`[data-testid="${cssEscape(f.dataTestid)}"]`)
  if (f.ariaLabel) push(`[aria-label="${cssEscape(f.ariaLabel)}"]`)
  if (f.name) push(`[name="${cssEscape(f.name)}"]`)
  if (f.placeholder) push(`[placeholder="${cssEscape(f.placeholder)}"]`)
  if (f.role) push(`[role="${cssEscape(f.role)}"]`)
  if (f.tag && f.classStem) push(`${f.tag}.${f.classStem}`)
  if (f.text && f.text.length <= 60) push(`text=${cssEscape(f.text)}`)
  if (f.xpath) push(`xpath=${f.xpath}`)
  if (f.cssPath) push(f.cssPath)

  return out
}
