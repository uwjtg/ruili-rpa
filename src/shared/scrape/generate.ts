/**
 * 数据抓取向导 V1：把向导规格编译成 FlowDoc 步骤（M4 切片 1）。
 *
 * 纯函数：不碰 DOM / 浏览器 / Electron，可单测。
 * 产出步骤（顺序）：
 *   1. webOpenBrowser   打开浏览器（独立 profile）
 *   2. webOpenUrl       打开目标网址
 *   3. webScrapeList    列表项批量提取 → 结果变量（可选 CSV 导出）
 *   4. logMessage       抓取完成提示
 *
 * 返回的 step.id 为占位 g1/g2…；渲染层追加时用 nextStepId 重写（与录制追加同模式）。
 * 结果变量自动声明为 list（元素 dict），已存在同名变量则跳过声明。
 */
import type { FlowVar, StepNode } from '../ast'
import type { ScrapeWizardSpec } from './spec'

export interface GeneratedScrapeFlow {
  steps: StepNode[]
  /** 需要新增到 flow.vars 的变量（已与现有变量去重） */
  newVars: FlowVar[]
}

export function generateScrapeFlow(spec: ScrapeWizardSpec): GeneratedScrapeFlow {
  const fieldsJson = JSON.stringify(spec.fields)
  const csvPath = (spec.csvPath ?? '').trim()
  const maxItems = Number(spec.maxItems) || 0
  const nextSelector = (spec.nextSelector ?? '').trim()
  const maxPages = Number(spec.maxPages) || 1

  const steps: StepNode[] = [
    { id: 'g1', cmdId: 'webOpenBrowser', params: { channel: 'auto' } },
    { id: 'g2', cmdId: 'webOpenUrl', params: { url: spec.url, titleVar: '' } },
    {
      id: 'g3',
      cmdId: 'webScrapeList',
      params: {
        listSelector: spec.listSelector,
        fieldsJson,
        resultVar: spec.resultVar,
        csvPath,
        maxItems,
        nextSelector,
        maxPages
      }
    },
    {
      id: 'g4',
      cmdId: 'logMessage',
      params: {
        message: `数据抓取完成，结果已存入变量 ${spec.resultVar}`,
        level: 'success'
      }
    }
  ]

  const newVars: FlowVar[] = [
    { name: spec.resultVar, type: 'list', value: [], description: '数据抓取向导生成：列表项字段结果' }
  ]

  return { steps, newVars }
}
