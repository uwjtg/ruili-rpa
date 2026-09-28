/**
 * R3 流程失败通知：把 flow.onFailureNotify 转成一个 HTTP 请求（纯函数，便于单测）。
 * 真正发请求由调用方 RunManager 完成（fire-and-forget，失败只记 warn，不影响流程结果）。
 */
import type { FlowFailureNotify, RunResult } from '../../shared/ast'

export interface FailureNotifyRequest {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: string
}

export function buildFailureNotifyRequest(
  cfg: FlowFailureNotify,
  result: RunResult
): FailureNotifyRequest {
  const channel = cfg.channel ?? 'webhook'
  const text = `【锐流RPA】流程「${result.flowName}」运行失败\n错误：${result.error ?? '未知'}\n已执行步骤：${result.stepsExecuted}\n耗时：${Math.round(result.durationMs / 1000)}s`
  const base: FailureNotifyRequest = {
    url: cfg.webhook,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: ''
  }
  if (channel === 'feishu') {
    base.body = JSON.stringify({ msg_type: 'text', content: { text } })
  } else if (channel === 'dingtalk') {
    base.body = JSON.stringify({ msgtype: 'text', text: { content: text } })
  } else {
    base.body = JSON.stringify({ text })
  }
  return base
}
