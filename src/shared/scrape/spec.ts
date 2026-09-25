/**
 * 数据抓取向导 V1 共享契约（M4 切片 1）。
 *
 * 向导三态：
 *  1. 用户在浏览器打开列表页，提供「示例项选择器」（如 .product-card）；
 *  2. 主进程在页面内跑 inspectInPage：沿祖先找"同 tag+class 兄弟最多"的一层，
 *     聚类出列表项选择器，并列出示例项内可标注的候选子元素；
 *  3. 用户勾选/命名字段，generateScrapeFlow 产出 FlowDoc（webOpenUrl →
 *     webScrapeList → 日志），追加到当前流程。
 *
 * 不做：浏览器内点选高亮拾取（CDP 拾取器，属浏览器录制器备选大项）。
 */

/** 单个抓取字段 */
export interface ScrapeFieldSpec {
  /** 字段名（结果对象的 key；向导默认用候选 tag 名） */
  name: string
  /** 相对列表项内子元素的 CSS 选择器（如 .title / a.price） */
  subSelector: string
  /** 取值方式：缺省=元素 textContent；href/src/alt 等取属性 */
  attr?: string
}

/** 候选项（示例项内可标注的子元素） */
export interface ScrapeCandidate {
  /** 相对示例项的 CSS 选择器 */
  selector: string
  /** 标签名（小写） */
  tag: string
  /** 示例文本（截断 40 字） */
  sampleText: string
  /** 若该元素有 href / src，一并给出（向导默认选「链接/图片」时用） */
  href?: string
  src?: string
}

/** inspectInPage 返回（主进程 → 渲染层向导） */
export interface ScrapeInspectResult {
  ok: boolean
  /** 识别出的列表项选择器（document.querySelectorAll 可复现整列） */
  listSelector?: string
  /** 识别到的列表项数量 */
  itemCount?: number
  /** 前 3 项文本预览（各截断 60 字） */
  samples?: string[]
  /** 示例项内可标注的候选字段 */
  candidates?: ScrapeCandidate[]
  /** 失败原因 */
  error?: string
}

/** 向导最终生成流程所需规格 */
export interface ScrapeWizardSpec {
  /** 目标网址 */
  url: string
  /** 识别出的列表项选择器 */
  listSelector: string
  /** 字段映射 */
  fields: ScrapeFieldSpec[]
  /** 结果变量名（list，元素为 dict） */
  resultVar: string
  /** 可选：导出 CSV 的绝对/相对路径（支持 ${var}）；空=不导出 */
  csvPath?: string
  /** 可选：导出 XLSX 路径（支持 ${var}）；空=不导出 */
  xlsxPath?: string
  /** 最多抓取条数；0=不限 */
  maxItems?: number
  /** 可选：下一页按钮选择器（M4-7 翻页入抓）；空=只抓当前页 */
  nextSelector?: string
  /** 最多翻几页（含当前页）；0=不限（M4-7） */
  maxPages?: number
}
