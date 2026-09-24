/**
 * 数据抓取向导 V1：主进程侧「识别相似项」桥（M4 切片 1）。
 *
 * 渲染层向导拿到示例项选择器后调 IPC → 这里在已打开的页面里跑
 * INSPECT_FN_BODY（兄弟节点聚类），把识别结果回传给向导做字段标注。
 * 真正的批量抓取由 webScrapeList 指令在流程运行时完成。
 */
import { getWebSession } from '../engine/web/session'
import { INSPECT_FN_BODY } from '../shared/scrape/page-script'
import type { ScrapeInspectResult } from '../shared/scrape/spec'

export async function inspectForWizard(sampleSelector: string): Promise<ScrapeInspectResult> {
  const selector = (sampleSelector ?? '').trim()
  if (!selector) return { ok: false, error: '请填写示例项选择器' }

  const session = getWebSession()
  if (!session.isRunning()) {
    return {
      ok: false,
      error: '浏览器未启动：请先在流程里加「打开浏览器」「打开网址」并运行到目标列表页，或用工具栏「M1 端到端」旁的浏览器入口打开页面后再识别'
    }
  }

  try {
    const r = (await session.eval(INSPECT_FN_BODY, selector)) as ScrapeInspectResult
    if (r && typeof r === 'object' && 'ok' in r) return r
    return { ok: false, error: '页面识别返回格式异常' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
