import { afterEach, describe, expect, it, vi } from 'vitest'
import { LlmClient } from './provider'

const okResponse = {
  ok: true,
  json: async () => ({
    choices: [{ message: { content: 'hello', tool_calls: [] } }],
    model: 'test-model'
  })
}

afterEach(() => vi.restoreAllMocks())

describe('LlmClient · Provider 切换', () => {
  it('默认用第一个 Provider，请求打到对应 baseURL 并带 Bearer 凭据', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => okResponse as Response)
    vi.stubGlobal('fetch', fetchMock)

    const client = new LlmClient([
      { name: 'cloud', baseURL: 'https://cloud.example/v1', apiKey: 'KEY_A', model: 'm-a' },
      { name: 'local', baseURL: 'http://127.0.0.1:11434/v1', apiKey: 'ollama', model: 'm-b' }
    ])
    expect(client.active().name).toBe('cloud')

    await client.complete({ messages: [{ role: 'user', content: 'hi' }] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://cloud.example/v1/chat/completions')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer KEY_A' })
  })

  it('setActive 切到第二个 Provider 后，请求凭据随之切换', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => okResponse as Response)
    vi.stubGlobal('fetch', fetchMock)

    const client = new LlmClient([
      { name: 'cloud', baseURL: 'https://cloud.example/v1', apiKey: 'KEY_A', model: 'm-a' },
      { name: 'local', baseURL: 'http://127.0.0.1:11434/v1', apiKey: 'ollama', model: 'm-b' }
    ])
    client.setActive('local')
    expect(client.active().name).toBe('local')

    await client.complete({ messages: [{ role: 'user', content: 'hi' }] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('http://127.0.0.1:11434/v1/chat/completions')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer ollama' })
  })

  it('未知 Provider 抛错', () => {
    const client = new LlmClient([
      { name: 'a', baseURL: 'https://a', apiKey: 'k', model: 'm' }
    ])
    expect(() => client.setActive('nope')).toThrow(/未知/)
  })
})
