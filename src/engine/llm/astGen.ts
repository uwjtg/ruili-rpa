/**
 * function-calling 生成流程 AST（阶段 4 POC）。
 *
 * 策略（对应计划书 I4「指令子集」）：把已注册指令目录压缩成一个
 * `build_flow` 工具（cmdId 用 enum 列出可用指令），让模型一次返回结构化
 * steps 数组，再映射成 FlowDoc。生成结果随后经 validateFlow + Interpreter
 * 验证「合法且可跑」。
 */

import type { FlowDoc, StepNode } from '../../shared/ast'
import type { CommandRegistry } from '../commands/registry'
import type { ChatTool, LlmClient } from './provider'

export function buildFlowTool(registry: CommandRegistry): ChatTool {
  const cmds = registry.list()
  return {
    type: 'function',
    function: {
      name: 'build_flow',
      description:
        '根据用户的自动化目标，生成一条 RPA 流程。steps 按执行顺序排列；' +
        'cmdId 必须从可用指令中选择；params 为该指令的参数键值对。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '流程名称' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                cmdId: {
                  type: 'string',
                  enum: cmds.map((c) => c.id),
                  description: '可用指令：' + cmds.map((c) => `${c.id}(${c.name})`).join(', ')
                },
                params: {
                  type: 'object',
                  description: '指令参数，键名参考指令定义'
                }
              },
              required: ['cmdId']
            }
          }
        },
        required: ['steps']
      }
    }
  }
}

interface RawStep {
  cmdId: string
  params?: Record<string, unknown>
}

export async function generateFlow(
  prompt: string,
  client: LlmClient,
  registry: CommandRegistry
): Promise<FlowDoc> {
  const tool = buildFlowTool(registry)
  const resp = await client.complete({
    messages: [
      {
        role: 'system',
        content:
          '你是锐流 RPA 流程生成器。调用 build_flow 工具，把用户目标翻译成按顺序执行的步骤。' +
          '只输出工具调用，不要解释。'
      },
      { role: 'user', content: prompt }
    ],
    tools: [tool],
    temperature: 0
  })

  const call = resp.toolCalls[0]
  if (!call) {
    throw new Error('模型未返回工具调用（tool_calls 为空）')
  }
  let parsed: { name?: string; steps?: RawStep[] }
  try {
    parsed = JSON.parse(call.function.arguments)
  } catch (e) {
    throw new Error(`工具参数不是合法 JSON: ${e instanceof Error ? e.message : e}`)
  }
  if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error('模型未生成任何步骤')
  }

  const steps: StepNode[] = parsed.steps.map((s, i) => ({
    id: `s${i + 1}`,
    cmdId: s.cmdId,
    params: s.params ?? {}
  }))

  return {
    version: 1,
    name: parsed.name ?? 'AI 生成流程',
    vars: [],
    steps
  }
}
