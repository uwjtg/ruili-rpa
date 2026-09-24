/**
 * LLM 适配层（阶段 4）：OpenAI 兼容协议，Provider 配置化、可切换。
 *
 * 决策⑤（计划书 §11）：baseURL / apiKey / model 全部可配，支持
 * 智谱/DeepSeek/通义/Kimi/OpenAI/Ollama 本地。apiKey 在主进程内存持有，
 * 经 IPC 调用，不下发渲染端。
 *
 * 本文件不直接依赖外部 SDK，用全局 fetch 打 `${baseURL}/chat/completions`，
 * 便于在单测里 stub fetch、在 POC 里对本地 mock server。
 */

export interface LlmProviderConfig {
  name: string
  baseURL: string
  apiKey: string
  model: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** function-calling 工具描述（OpenAI tools 子集） */
export interface ChatTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ChatCompletion {
  content: string
  toolCalls: ToolCall[]
  model: string
}

export interface ChatOptions {
  messages: ChatMessage[]
  tools?: ChatTool[]
  temperature?: number
}

export class LlmClient {
  private providers = new Map<string, LlmProviderConfig>()
  private activeName = ''

  constructor(providers: LlmProviderConfig[] = []) {
    for (const p of providers) this.add(p)
    if (providers.length > 0) this.activeName = providers[0].name
  }

  add(p: LlmProviderConfig): void {
    this.providers.set(p.name, p)
  }

  /** 切换当前使用的 Provider */
  setActive(name: string): void {
    if (!this.providers.has(name)) throw new Error(`未知 LLM Provider: ${name}`)
    this.activeName = name
  }

  active(): LlmProviderConfig {
    const p = this.providers.get(this.activeName)
    if (!p) throw new Error('尚未配置任何 LLM Provider')
    return p
  }

  listProviders(): string[] {
    return [...this.providers.keys()]
  }

  /** 调用 chat/completions；tools 存在时模型可返回 tool_calls */
  async complete(opts: ChatOptions): Promise<ChatCompletion> {
    const p = this.active()
    const body: Record<string, unknown> = {
      model: p.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2
    }
    if (opts.tools) body.tools = opts.tools

    const res = await fetch(`${p.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.apiKey}`
      },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`LLM 调用失败 ${res.status}: ${text.slice(0, 300)}`)
    }
    const data = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string; tool_calls?: ToolCall[] }
      }>
      model?: string
    }
    const choice = data.choices?.[0]
    const msg = choice?.message ?? {}
    return {
      content: msg.content ?? '',
      toolCalls: msg.tool_calls ?? [],
      model: data.model ?? p.model
    }
  }
}
