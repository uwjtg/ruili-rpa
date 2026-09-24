/**
 * generateScrapeFlow 纯函数测试（M4 切片 1）。
 */
import { describe, expect, it } from 'vitest'
import { generateScrapeFlow } from './generate'
import type { ScrapeWizardSpec } from './spec'

const SPEC: ScrapeWizardSpec = {
  url: 'https://example.com/list',
  listSelector: 'div.product-card',
  fields: [
    { name: 'title', subSelector: '.title' },
    { name: 'price', subSelector: '.price' },
    { name: 'url', subSelector: 'a.detail', attr: 'href' }
  ],
  resultVar: 'rows',
  csvPath: 'D:\\out.csv',
  maxItems: 20
}

describe('generateScrapeFlow', () => {
  it('按 打开浏览器→打开网址→抓取→日志 顺序产出 4 步', () => {
    const { steps } = generateScrapeFlow(SPEC)
    expect(steps.map((s) => s.cmdId)).toEqual([
      'webOpenBrowser',
      'webOpenUrl',
      'webScrapeList',
      'logMessage'
    ])
  })

  it('webScrapeList 参数完整（选择器/字段 JSON/变量/CSV/条数）', () => {
    const { steps } = generateScrapeFlow(SPEC)
    const scrape = steps[2]
    expect(scrape.params.listSelector).toBe('div.product-card')
    expect(scrape.params.resultVar).toBe('rows')
    expect(scrape.params.csvPath).toBe('D:\\out.csv')
    expect(scrape.params.maxItems).toBe(20)
    const fields = JSON.parse(String(scrape.params.fieldsJson))
    expect(fields).toHaveLength(3)
    expect(fields[2]).toEqual({ name: 'url', subSelector: 'a.detail', attr: 'href' })
  })

  it('结果变量声明为 list，带说明', () => {
    const { newVars } = generateScrapeFlow(SPEC)
    expect(newVars).toEqual([
      { name: 'rows', type: 'list', value: [], description: '数据抓取向导生成：列表项字段结果' }
    ])
  })

  it('csvPath 留空时参数为空串', () => {
    const { steps } = generateScrapeFlow({ ...SPEC, csvPath: '' })
    expect(steps[2].params.csvPath).toBe('')
  })
})
