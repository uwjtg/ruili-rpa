import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const tokensCss = readFileSync(resolve(import.meta.dirname, './tokens.css'), 'utf-8')

/** 设计系统关键 token：值与 V3 交接文档 §3.1 一致 */
const KEY_TOKENS: Record<string, string> = {
  '--red': '#e64340',
  '--red-hover': '#cf3a37',
  '--red-soft': '#fdecec',
  '--purple': '#7c5cfc',
  '--purple-2': '#a855f7',
  '--purple-soft': '#f1edff',
  '--purple-line': '#c9b8ff',
  '--green': '#1dbf73',
  '--blue': '#2f80ed',
  '--blue-soft': '#e8f0fe',
  '--bg': '#f2f3f5',
  '--canvas': '#f7f8fa',
  '--panel': '#ffffff',
  '--border': '#e5e6eb',
  '--text': '#1f2329',
  '--text-2': '#51565d',
  '--text-3': '#8a8f99',
  '--text-4': '#b0b6bf',
  '--success': '#0e9f5d',
  '--warning': '#c46211',
  '--error': '#e64340',
  '--radius': '6px',
  '--radius-lg': '8px',
  '--radius-xl': '10px',
  '--radius-pill': '99px'
}

describe('设计 Token（tokens.css）', () => {
  it('关键 token 全部存在且值与设计定稿一致', () => {
    for (const [name, value] of Object.entries(KEY_TOKENS)) {
      const re = new RegExp(`${name}\\s*:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      expect(re.test(tokensCss), `缺少或值不一致: ${name} 应为 ${value}`).toBe(true)
    }
  })

  it('字体与字阶 token 存在', () => {
    expect(tokensCss).toContain('--font:')
    expect(tokensCss).toContain('--mono:')
    expect(tokensCss).toContain('--fs-title:')
    expect(tokensCss).toContain('--fs-body:')
    expect(tokensCss).toContain('--fs-badge:')
  })

  it('阴影 token 存在（悬停/浮层用 md）', () => {
    expect(tokensCss).toContain('--shadow-sm:')
    expect(tokensCss).toContain('--shadow-md:')
  })
})
