/**
 * 浏览器 CDP 点选拾取（M4 切片 3）：主进程桥。
 *
 * 渲染层向导点「在页面中点选」→ IPC web-pick:start → 这里在已开页面里注入
 * 高亮/监听脚本，阻塞等用户点击或 Esc → 返回选中元素 CSS 路径。
 * 浏览器未启动时返回结构化错误。
 */
import { getWebSession } from '../engine/web/session'

export interface WebPickReply {
  ok: boolean
  cancelled?: boolean
  selector?: string
  tag?: string
  text?: string
  error?: string
}

export async function startWebPick(timeoutMs = 120000): Promise<WebPickReply> {
  const session = getWebSession()
  if (!session.isRunning()) {
    return { ok: false, error: '浏览器未启动：请先运行「打开浏览器/打开网址」到目标页面，再点选' }
  }
  try {
    const r = await session.startPagePick(timeoutMs)
    if (r.cancelled) return { ok: true, cancelled: true }
    if (!r.selector) return { ok: false, error: '未选中任何元素' }
    return {
      ok: true,
      cancelled: false,
      selector: r.selector,
      tag: r.tag,
      text: r.text
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
