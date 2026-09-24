import { afterEach, describe, expect, it, vi } from 'vitest'
import { LlmClient } from './provider'
import { generateFlow } from './astGen'
import { CommandRegistry } from '../commands/registry'
import { registerDemoCommands } from '../commands/demo'
import { Interpreter } from '../core/interpreter'

afterEach(() => vi.restoreAllMocks())

function registry(): CommandRegistry {
  const r = new CommandRegistry()
  registerDemoCommands(r)
  return r
}

describe('generateFlow · function-calling → AST', () => {
  it('解析工具调用为 FlowDoc，且能被解释器真实跑通', async () => {
    const args = JSON.stringify({
      name: 'AI 生成流程',
      steps: [
        { cmdId: 'logMessage', params: { message: 'AI 第 1 步', level: 'info' } },
        { cmdId: 'setVar', params: { name: 'x', value: '42' } },
        { cmdId: 'logMessage', params: { message: '读到 ${x}', level: 'success' } }
      ]
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'build_flow', arguments: args }
                  }
                ]
              }
            }
          ],
          model: 'm'
        })
      }))
    )

    const client = new LlmClient([
      { name: 'cloud', baseURL: 'https://x/v1', apiKey: 'k', model: 'm' }
    ])
    const flow = await generateFlow('帮我打两行日志', client, registry())

    expect(flow.steps).toHaveLength(3)
    expect(flow.steps[0].cmdId).toBe('logMessage')

    // 用解释器真跑一遍，证明生成的 AST 合法
    const logs: string[] = []
    const itp = new Interpreter({
      registry: registry(),
      events: { onLog: (_l, m) => logs.push(m) }
    })
    const result = await itp.run(flow)
    expect(result.status).toBe('completed')
    expect(logs).toContain('AI 第 1 步')
    expect(logs).toContain('读到 42')
  })

  it('模型未返回工具调用时抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '我不调用工具' } }] })
      }))
    )
    const client = new LlmClient([
      { name: 'cloud', baseURL: 'https://x/v1', apiKey: 'k', model: 'm' }
    ])
    await expect(generateFlow('x', client, registry())).rejects.toThrow(/工具调用/)
  })
})
