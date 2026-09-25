/**
 * 数据抓取向导 V2：离线 10 形态基准（M4 切片 2）。
 *
 * 计划书 M3 验收「10 个典型目标站抓取成功率 ≥80%」的 CI 可衡量版：
 * 把 10 种典型列表页 HTML 形态做成 fixture，每个 fixture 断言
 *  ① 兄弟聚类能识别出正确列表项（itemCount 命中数正确）；
 *  ② 用识别出的 listSelector 跑 scrapeInPage，关键字段值正确。
 * 真站冒烟（真实 Chrome/Edge 打开电商/搜索/后台）由用户手动做，这里只锁算法。
 */
import { describe, expect, it } from 'vitest'
import { parseHTML } from 'linkedom'
import { INSPECT_FN_BODY, SCRAPE_FN_BODY } from './page-script'

interface BenchCase {
  name: string
  html: string
  /** 示例项选择器 */
  sample: string
  /** 期望识别出的列表项数量 */
  expectCount: number
  /** 用于验证字段提取的映射（相对列表项） */
  fields: Array<{ name: string; subSelector: string; attr?: string }>
  /** 第一行期望值 */
  expectFirstRow: Record<string, string>
}

const CASES: BenchCase[] = [
  {
    name: '1 电商卡片（div.product-card）',
    html: `<div class="list">
      <div class="product-card"><h3 class="title">商品甲</h3><span class="price">¥10</span><a class="d" href="/a">详情</a></div>
      <div class="product-card"><h3 class="title">商品乙</h3><span class="price">¥20</span><a class="d" href="/b">详情</a></div>
      <div class="product-card"><h3 class="title">商品丙</h3><span class="price">¥30</span><a class="d" href="/c">详情</a></div>
    </div>`,
    sample: '.product-card',
    expectCount: 3,
    fields: [
      { name: 'title', subSelector: '.title' },
      { name: 'price', subSelector: '.price' }
    ],
    expectFirstRow: { title: '商品甲', price: '¥10' }
  },
  {
    name: '2 搜索结果（div.result-item）',
    html: `<div id="results">
      <div class="result-item"><h3><a class="t" href="/r1">结果一</a></h3><p class="snippet">摘要一</p></div>
      <div class="result-item"><h3><a class="t" href="/r2">结果二</a></h3><p class="snippet">摘要二</p></div>
      <div class="result-item"><h3><a class="t" href="/r3">结果三</a></h3><p class="snippet">摘要三</p></div>
    </div>`,
    sample: '.result-item',
    expectCount: 3,
    fields: [
      { name: 'title', subSelector: '.t' },
      { name: 'url', subSelector: '.t', attr: 'href' }
    ],
    expectFirstRow: { title: '结果一', url: '/r1' }
  },
  {
    name: '3 table 表格（tbody tr）',
    html: `<table class="grid"><tbody>
      <tr><td class="name">行一</td><td class="price">100</td></tr>
      <tr><td class="name">行二</td><td class="price">200</td></tr>
      <tr><td class="name">行三</td><td class="price">300</td></tr>
    </tbody></table>`,
    sample: 'tbody tr',
    expectCount: 3,
    fields: [
      { name: 'name', subSelector: '.name' },
      { name: 'price', subSelector: '.price' }
    ],
    expectFirstRow: { name: '行一', price: '100' }
  },
  {
    name: '4 新闻列表（ul.news > li）',
    html: `<ul class="news">
      <li><a href="/n1">标题一</a><time>2026-09-01</time></li>
      <li><a href="/n2">标题二</a><time>2026-09-02</time></li>
      <li><a href="/n3">标题三</a><time>2026-09-03</time></li>
    </ul>`,
    sample: 'ul.news li',
    expectCount: 3,
    fields: [
      { name: 'title', subSelector: 'a' },
      { name: 'link', subSelector: 'a', attr: 'href' }
    ],
    expectFirstRow: { title: '标题一', link: '/n1' }
  },
  {
    name: '5 商品网格（嵌套层）',
    html: `<div class="shop-page"><header>广告</header><div class="shop-grid">
      <div class="card"><img src="i1.jpg"/><p class="name">A</p></div>
      <div class="card"><img src="i2.jpg"/><p class="name">B</p></div>
      <div class="card"><img src="i3.jpg"/><p class="name">C</p></div>
    </div></div>`,
    sample: '.card',
    expectCount: 3,
    fields: [
      { name: 'name', subSelector: '.name' },
      { name: 'img', subSelector: 'img', attr: 'src' }
    ],
    expectFirstRow: { name: 'A', img: 'i1.jpg' }
  },
  {
    name: '6 尾部 hash 类名（product_abc123 → product）',
    html: `<div class="wrap">
      <div class="product_abc123"><span class="n">甲</span></div>
      <div class="product_def456"><span class="n">乙</span></div>
      <div class="product_ghi789"><span class="n">丙</span></div>
    </div>`,
    sample: '.product_abc123',
    expectCount: 3,
    fields: [{ name: 'name', subSelector: '.n' }],
    expectFirstRow: { name: '甲' }
  },
  {
    name: '7 emotion/css-in-js（css-1a2b3cd → css）',
    html: `<div class="app">
      <div class="css-1a2b3cd"><b class="t">X</b></div>
      <div class="css-9z8y7x"><b class="t">Y</b></div>
      <div class="css-3w4v5u"><b class="t">Z</b></div>
    </div>`,
    sample: '.css-1a2b3cd',
    expectCount: 3,
    fields: [{ name: 'text', subSelector: 'b' }],
    expectFirstRow: { text: 'X' }
  },
  {
    name: '8 无 class 纯标签兄弟',
    html: `<div class="list">
      <div><span>一</span></div>
      <div><span>二</span></div>
      <div><span>三</span></div>
    </div>`,
    sample: '.list > div',
    expectCount: 3,
    fields: [{ name: 'text', subSelector: 'span' }],
    expectFirstRow: { text: '一' }
  },
  {
    name: '9 项内嵌套小列表不被误抓（向上选最大兄弟组）',
    html: `<div class="list">
      <div class="item"><h3 class="t">甲</h3><ul class="tags"><li>x</li><li>y</li></ul></div>
      <div class="item"><h3 class="t">乙</h3><ul class="tags"><li>x</li><li>y</li></ul></div>
      <div class="item"><h3 class="t">丙</h3><ul class="tags"><li>x</li><li>y</li></ul></div>
    </div>`,
    sample: '.item',
    expectCount: 3,
    fields: [{ name: 'title', subSelector: '.t' }],
    expectFirstRow: { title: '甲' }
  },
  {
    name: '10 文章标题链（h2 + a）',
    html: `<section class="posts">
      <article class="post"><h2 class="title"><a href="/p1">文章一</a></h2></article>
      <article class="post"><h2 class="title"><a href="/p2">文章二</a></h2></article>
      <article class="post"><h2 class="title"><a href="/p3">文章三</a></h2></article>
    </section>`,
    sample: '.post',
    expectCount: 3,
    fields: [
      { name: 'title', subSelector: '.title' },
      { name: 'url', subSelector: 'a', attr: 'href' }
    ],
    expectFirstRow: { title: '文章一', url: '/p1' }
  }
]

function runInspect(html: string, sampleSelector: string) {
  const { document } = parseHTML(`<html><body>${html}</body></html>`)
  const fn = new Function(
    'document',
    'sampleSelector',
    `return (${INSPECT_FN_BODY})(sampleSelector)`
  ) as (doc: unknown, sel: string) => {
    ok: boolean
    listSelector?: string
    itemCount?: number
    error?: string
  }
  return fn(document, sampleSelector)
}

function runScrape(html: string, listSelector: string, fields: BenchCase['fields']) {
  const { document } = parseHTML(`<html><body>${html}</body></html>`)
  const fn = new Function(
    'document',
    'arg',
    `return (${SCRAPE_FN_BODY})(arg)`
  ) as (doc: unknown, arg: unknown) => Array<Record<string, string>>
  return fn(document, { listSelector, fields })
}

describe('离线 10 形态基准（M4-2）', () => {
  let pass = 0
  for (const c of CASES) {
    it(c.name, () => {
      const r = runInspect(c.html, c.sample)
      expect(r.ok, `inspect 应成功，实际 error=${r.error ?? ''}`).toBe(true)
      expect(r.itemCount).toBe(c.expectCount)
      const rows = runScrape(c.html, r.listSelector!, c.fields)
      expect(rows.length).toBe(c.expectCount)
      expect(rows[0]).toEqual(c.expectFirstRow)
      pass++
    })
  }
  // 收尾打印：基准通过率
  it('基准通过率 ≥80%（10 形态至少 8 个通过）', () => {
    expect(pass).toBeGreaterThanOrEqual(8)
  })
})
