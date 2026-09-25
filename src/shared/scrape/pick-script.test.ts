/**
 * CDP 点选拾取：CSS 路径生成单测（M4 切片 3）。
 * 用 linkedom 跑与生产同一份 CSS_PATH_FN。
 */
import { describe, expect, it } from 'vitest'
import { parseHTML } from 'linkedom'
import { CSS_PATH_FN } from './pick-script'

function cssPathOf(html: string, selector: string): string {
  const { document } = parseHTML(`<html><body>${html}</body></html>`)
  const el = document.querySelector(selector)
  const fn = new Function(
    'document',
    'el',
    `return (${CSS_PATH_FN})(el)`
  ) as (doc: unknown, el: unknown) => string
  return fn(document, el)
}

describe('CSS_PATH_FN 选择器生成', () => {
  it('id 优先（祖先 id 截断到 id，保留 el 到 id 路径）', () => {
    const p = cssPathOf('<div id="app"><span class="x">hi</span></div>', '#app .x')
    expect(p).toBe('#app > span.x')
  })

  it('tag.class 链（body 前缀由 linkedom 包裹产生，可接受）', () => {
    const p = cssPathOf(
      '<div class="list"><div class="item"><span class="t">甲</span></div></div>',
      '.item .t'
    )
    expect(p).toContain('div.list > div.item > span.t')
  })

  it('同父同 tag 多个时加 nth-of-type', () => {
    const p = cssPathOf(
      '<div><div>一</div><div class="target">二</div><div>三</div></div>',
      '.target'
    )
    expect(p).toContain(':nth-of-type(2)')
  })

  it('跳过尾部 hash 类名', () => {
    const p = cssPathOf(
      '<div class="product_abc123"><span class="name_xyz789">甲</span></div>',
      '.product_abc123 .name_xyz789'
    )
    // 两段都跳过 hash，退化为 tag + nth
    expect(p).not.toContain('abc123')
    expect(p).not.toContain('xyz789')
  })

  it('空元素返回空串', () => {
    const fn = new Function('el', `return (${CSS_PATH_FN})(el)`) as (el: unknown) => string
    expect(fn(null)).toBe('')
  })
})
