/**
 * POC · LLM 双 Provider 切换 + function-calling 生成流程 AST（阶段 4 验收）。
 *
 * 起一个本地 mock OpenAI 兼容服务：
 *  - 带 KEY_A 的请求 → 返回普通聊天内容（证明 Provider A 可达）
 *  - 带 KEY_B 的请求 → 返回 build_flow 工具调用（生成 3 步流程）
 * 然后：LlmClient 在两个 Provider 间切换，断言请求凭据随之切换；
 * 用 B 生成的 FlowDoc 喂给 Interpreter 真实跑通。
 *
 * 运行：npm run poc:llm
 */

import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { LlmClient } from '../src/engine/llm/provider'
import { generateFlow } from '../src/engine/llm/astGen'
import { CommandRegistry } from '../src/engine/commands/registry'
import { registerDemoCommands } from '../src/engine/commands/demo'
import { Interpreter } from '../src/engine/core/interpreter'

function stamp(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}
function log(msg: string): void {
  console.log(`[${stamp()}] ${msg}`)
}

async function main(): Promise<void> {
  const seenAuth: string[] = []
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.statusCode = 404
      res.end()
      return
    }
    const auth = req.headers.authorization ?? ''
    seenAuth.push(auth)
    res.setHeader('Content-Type', 'application/json')

    if (auth === 'Bearer KEY_A') {
      res.end(JSON.stringify({
        choices: [{ message: { content: '你好，我是云端模型 A' } }],
        model: 'mock-a'
      }))
      return
    }
    // KEY_B：返回工具调用，生成流程
    const args = JSON.stringify({
      name: 'AI 比价',
      steps: [
        { cmdId: 'logMessage', params: { message: 'POC 开始', level: 'info' } },
        { cmdId: 'setVar', params: { name: 'price', value: '99' } },
        { cmdId: 'logMessage', params: { message: '价格 ${price}', level: 'success' } }
      ]
    })
    res.end(JSON.stringify({
      choices: [{
        message: {
          content: '',
          tool_calls: [{ id: '1', type: 'function', function: { name: 'build_flow', arguments: args } }]
        }
      }],
      model: 'mock-b'
    }))
  })

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  const base = `http://127.0.0.1:${port}/v1`
  log(`mock LLM server 启动于 ${base}`)

  try {
    const client = new LlmClient([
      { name: 'cloud', baseURL: base, apiKey: 'KEY_A', model: 'a' },
      { name: 'local', baseURL: base, apiKey: 'KEY_B', model: 'b' }
    ])

    // 切到 A：普通聊天
    client.setActive('cloud')
    const a = await client.complete({ messages: [{ role: 'user', content: 'hi' }] })
    log(`Provider A 回复：${a.content}`)
    expectAuth(seenAuth.at(-1), 'KEY_A')

    // 切到 B：生成流程
    client.setActive('local')
    const reg = new CommandRegistry()
    registerDemoCommands(reg)
    const flow = await generateFlow('生成一个打日志的流程', client, reg)
    log(`Provider B 生成流程《${flow.name}》，${flow.steps.length} 步`)
    expectAuth(seenAuth.at(-1), 'KEY_B')

    // 真跑生成的流程
    const logs: string[] = []
    const itp = new Interpreter({ registry: reg, events: { onLog: (_l, m) => logs.push(m) } })
    const result = await itp.run(flow)
    log(`生成流程运行结果：status=${result.status}, steps=${result.stepsExecuted}`)
    log(`  日志：${logs.join(' | ')}`)

    if (result.status !== 'completed' || !logs.includes('价格 99')) {
      throw new Error('生成流程未按预期跑通')
    }
    log('✅ LLM POC 通过：双 Provider 切换凭据正确 + function-calling 生成合法可跑 AST')
  } finally {
    server.close()
  }
}

function expectAuth(auth: string | undefined, key: string): void {
  if (auth !== `Bearer ${key}`) {
    throw new Error(`期望 Authorization=Bearer ${key}，实际 ${auth}`)
  }
}

main().catch((e) => {
  console.error('❌ poc:llm 失败：', e)
  process.exit(1)
})
