/**
 * AI 报错解释（M5-12）：流程运行失败时，把本次日志喂给当前激活的 LLM，
 * 让它用中文给出失败原因与修复建议。
 *
 * 不依赖 Electron，便于单测 stub fetch；主进程 IPC 负责读 DB 日志后调用本模块。
 * 与 generateFlow 不同：这里不要求 function-calling，普通 chat 即可，temperature 略高。
 */
import type { LlmClient } from './provider'

export interface ExplainLogRow {
  level: string
  message: string
}

/** 把一次运行的日志拼成给 LLM 的解释 prompt。 */
export function buildExplainPrompt(
  flowName: string | null,
  entries: ExplainLogRow[],
  error?: string
): string {
  const lines = entries
    .slice(-80) // 最多带最近 80 条，避免超长
    .map((e) => `[${e.level}] ${e.message}`)
    .join('\n')
  const err = error ? `\n\n引擎错误信息：${error}` : ''
  return (
    `以下是锐流 RPA 一次失败运行的日志（流程名：${flowName ?? '未命名'}）。` +
    `请用简洁的中文回答：1) 最可能的失败原因；2) 用户下一步该怎么排查或修改。` +
    `不要复述全部日志，直接给结论。\n\n日志：\n${lines}${err}`
  )
}

/** 调当前激活 Provider 解释失败；返回解释文本。 */
export async function explainRunError(
  client: LlmClient,
  flowName: string | null,
  entries: ExplainLogRow[],
  error?: string
): Promise<string> {
  const prompt = buildExplainPrompt(flowName, entries, error)
  const resp = await client.complete({
    messages: [
      {
        role: 'system',
        content:
          '你是锐流 RPA 的故障排查助手。用户刚跑完一条自动化流程失败了。' +
          '根据日志给出最可能的原因和具体修复建议（中文，简洁，3-6 行）。'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3
  })
  return resp.content.trim() || '（模型未返回内容）'
}
