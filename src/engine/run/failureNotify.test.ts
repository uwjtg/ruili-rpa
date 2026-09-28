import { describe, expect, it } from 'vitest'
import { buildFailureNotifyRequest } from './failureNotify'
import type { RunResult } from '../../shared/ast'

const result: RunResult = {
  flowName: '抓报表',
  status: 'error',
  stepsExecuted: 4,
  error: '元素未找到',
  durationMs: 12345
}

describe('failureNotify', () => {
  it('飞书渠道包装为 msg_type=text', () => {
    const req = buildFailureNotifyRequest(
      { channel: 'feishu', webhook: 'https://oapi/xxx' },
      result
    )
    expect(req.url).toBe('https://oapi/xxx')
    const body = JSON.parse(req.body)
    expect(body.msg_type).toBe('text')
    expect(body.content.text).toContain('抓报表')
    expect(body.content.text).toContain('元素未找到')
  })

  it('钉钉渠道包装为 msgtype=text', () => {
    const req = buildFailureNotifyRequest(
      { channel: 'dingtalk', webhook: 'https://oapi/ding' },
      result
    )
    const body = JSON.parse(req.body)
    expect(body.msgtype).toBe('text')
  })

  it('默认 webhook 渠道为 {text}', () => {
    const req = buildFailureNotifyRequest({ webhook: 'https://h' }, result)
    const body = JSON.parse(req.body)
    expect(body.text).toContain('运行失败')
  })
})
