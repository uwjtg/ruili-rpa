import { describe, expect, it } from 'vitest'
import { buildFallbackSelectors, stripHashClass } from './fallback'

describe('stripHashClass', () => {
  it('去掉尾部构建 hash', () => {
    expect(stripHashClass('product_abc123')).toBe('product')
    expect(stripHashClass('css-1a2b3cd')).toBe('css')
    expect(stripHashClass('btn primary')).toBe('btn')
  })
  it('普通 class 原样返回第一段', () => {
    // 现有启发式会剥掉 dash+6 字符尾（与 pick-script 一致），'button' 恰好 6 字符 -> submit
    expect(stripHashClass('submit-button')).toBe('submit')
  })
})

describe('buildFallbackSelectors 回退链', () => {
  it('按稳定性排序：id→testid→aria→name→role→tag.class→text→cssPath', () => {
    const list = buildFallbackSelectors({
      id: 'loginBtn',
      dataTestid: 'login',
      ariaLabel: '登录',
      name: 'login',
      role: 'button',
      tag: 'button',
      classStem: 'btn',
      text: '登 录',
      cssPath: 'div.box > button.btn'
    })
    expect(list).toEqual([
      '#loginBtn',
      '[data-testid="login"]',
      '[aria-label="登录"]',
      '[name="login"]',
      '[role="button"]',
      'button.btn',
      'text=登 录',
      'div.box > button.btn'
    ])
  })

  it('跳过空值与未提供的特征', () => {
    const list = buildFallbackSelectors({ id: 'only' })
    expect(list).toEqual(['#only'])
  })

  it('去重（cssPath 与某候选相同时只留一份）', () => {
    const list = buildFallbackSelectors({
      id: 'x',
      cssPath: '#x'
    })
    expect(list).toEqual(['#x'])
  })

  it('属性值含引号/反斜杠时转义', () => {
    const list = buildFallbackSelectors({ ariaLabel: '说"你好"\\结束' })
    expect(list[0]).toBe('[aria-label="说\\"你好\\"\\\\结束"]')
  })

  it('过长文本不进 text 候选（避免误匹配大段正文）', () => {
    const long = '这是一段非常长的按钮文字'.repeat(6)
    const list = buildFallbackSelectors({ tag: 'div', text: long })
    expect(list.some((s) => s.startsWith('text='))).toBe(false)
  })

  it('空特征包返回空数组', () => {
    expect(buildFallbackSelectors({})).toEqual([])
  })
})
