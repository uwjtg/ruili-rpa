/**
 * 浏览器录制器（M4 切片 4）：主进程桥。
 *
 * renderer 点「录网页」→ web-record:start 注入监听 → 用户在浏览器操作 →
 * web-record:stop 取回事件数组，renderer 转成 webClick/webInput 步骤追加流程。
 */
import { getWebSession } from '../engine/web/session'
import type { WebRecordEvent } from '../shared/scrape/record-script'

export interface WebRecordReply {
  ok: boolean
  events?: WebRecordEvent[]
  error?: string
}

export async function startWebRecord(): Promise<WebRecordReply> {
  const session = getWebSession()
  if (!session.isRunning()) {
    return { ok: false, error: '浏览器未启动：请先「打开浏览器/打开网址」到目标页面' }
  }
  try {
    await session.startWebRecord()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function stopWebRecord(): Promise<WebRecordReply> {
  const session = getWebSession()
  if (!session.isRunning()) {
    return { ok: false, error: '浏览器未启动' }
  }
  try {
    const events = await session.stopWebRecord()
    return { ok: true, events }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
