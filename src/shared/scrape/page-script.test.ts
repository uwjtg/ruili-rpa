/**
 * 数据抓取向导 V1 页面脚本测试（M4 切片 1）。
 *
 * 用 linkedom 构造列表 HTML，在 Node 侧以 new Function 跑与生产同一份
 * INSPECT_FN_BODY / SCRAPE_FN_BODY 字符串——生产（Playwright 注入页面）
 * 与测试跑同一段逻辑。
 */
import { describe, expect, it } from 'vitest'
import { parseHTML } from 'linkedom'
import { INSPECT_FN_BODY, SCRAPE_FN_BODY } from './page-script'
import type { ScrapeInspectResult } from './spec'

const LIST_HTML = `
<html><body>
<div class="header">导航</div>
<div class="product-list">
  <div class="product-card">
    <h3 class="title">商品 Alpha</h3>
    <span class="price">¥10.00</span>
    <a class="detail" href="/item/1">查看详情</a>
  </div>
  <div class="product-card">
    <h3 class="title">商品 Beta</h3>
    <span class="price">¥20.00</span>
    <a class="detail" href="/item/2">查看详情</a>
  </div>
  <div class="product-card">
    <h3 class="title">商品 Gamma</h3>
    <span class="price">¥30.00</span>
    <a class="detail" href="/item/3">查看详情</a>
  </div>
</div>
</body></html>`

function runInspect(html: string, sampleSelector: string): ScrapeInspectResult {
  const { document } = parseHTML(html)
  const fn = new Function(
    'document',
    'sampleSelector',
    `return (${INSPECT_FN_BODY})(sampleSelector)`
  ) as (doc: Document, sel: string) => ScrapeInspectResult
  return fn(document as unknown as Document, sampleSelector)
}

function runScrape(
  html: string,
  arg: { listSelector: string; fields: Array<{ name: string; subSelector: string; attr?: string }>; maxItems?: number }
): Array<Record<string, string>> {
  const { document } = parseHTML(html)
  const fn = new Function(
    'document',
    'arg',
    `return (${SCRAPE_FN_BODY})(arg)`
  ) as (doc: Document, arg: unknown) => Array<Record<string, string>>
  return fn(document as unknown as Document, arg)
}

describe('INSPECT_FN_BODY 兄弟节点聚类', () => {
  it('识别出同类兄弟组成的列表项选择器', () => {
    const r = runInspect(LIST_HTML, '.product-card')
    expect(r.ok).toBe(true)
    expect(r.itemCount).toBe(3)
    // 组 key = tag.className → div.product-card
    expect(r.listSelector).toBe('div.product-card')
    expect(r.samples?.[0]).toContain('商品 Alpha')
  })

  it('返回示例项内可标注的候选字段（含 href）', () => {
    const r = runInspect(LIST_HTML, '.product-card')
    expect(r.candidates && r.candidates.length).toBeGreaterThan(0)
    const title = r.candidates!.find((c) => c.selector.includes('.title'))
    expect(title?.sampleText).toContain('商品 Alpha')
    const link = r.candidates!.find((c) => c.href === '/item/1')
    expect(link?.tag).toBe('a')
  })

  it('示例选择器找不到元素时返回错误', () => {
    const r = runInspect(LIST_HTML, '.not-exist')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('未找到示例元素')
  })

  it('孤立元素（无同类兄弟）返回聚类失败', () => {
    const solo = `<html><body><div class="only-one"><span>x</span></div></body></html>`
    const r = runInspect(solo, '.only-one')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('相似列表项')
  })
})

describe('SCRAPE_FN_BODY 批量取字段', () => {
  it('按字段映射提取文本与属性', () => {
    const rows = runScrape(LIST_HTML, {
      listSelector: 'div.product-card',
      fields: [
        { name: 'title', subSelector: '.title' },
        { name: 'price', subSelector: '.price' },
        { name: 'url', subSelector: 'a.detail', attr: 'href' }
      ]
    })
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ title: '商品 Alpha', price: '¥10.00', url: '/item/1' })
    expect(rows[2]).toEqual({ title: '商品 Gamma', price: '¥30.00', url: '/item/3' })
  })

  it('subSelector 未命中时该字段为空串', () => {
    const rows = runScrape(LIST_HTML, {
      listSelector: 'div.product-card',
      fields: [{ name: 'title', subSelector: '.title' }, { name: 'badge', subSelector: '.badge' }]
    })
    expect(rows[0].badge).toBe('')
  })

  it('maxItems 限制抓取条数', () => {
    const rows = runScrape(LIST_HTML, {
      listSelector: 'div.product-card',
      fields: [{ name: 'title', subSelector: '.title' }],
      maxItems: 2
    })
    expect(rows).toHaveLength(2)
  })
})
