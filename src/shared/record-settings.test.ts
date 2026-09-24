/**
 * 录制聚合阈值设置纯函数单测（M3 切片 12）。
 */
import { describe, expect, it } from 'vitest'
import {
  RECORD_THRESHOLD_DEFAULTS,
  mergeRecordThresholds,
  sanitizeRecordThresholds
} from './record-settings'

describe('record-settings 阈值设置', () => {
  it('默认值与 sidecar 常量一致', () => {
    expect(RECORD_THRESHOLD_DEFAULTS).toEqual({
      clickDebounceMs: 350,
      clickDebouncePx: 10,
      typingGapMs: 800,
      scrollGapMs: 400
    })
  })

  it('sanitize 接受合法整数（含数字字符串），未知键/缺键忽略', () => {
    expect(
      sanitizeRecordThresholds({
        clickDebounceMs: 500,
        clickDebouncePx: '12',
        typingGapMs: 900,
        scrollGapMs: 600,
        bogusKey: 1
      })
    ).toEqual({ clickDebounceMs: 500, clickDebouncePx: 12, typingGapMs: 900, scrollGapMs: 600 })
  })

  it('sanitize 忽略负数/非数字/None/非整数/非对象', () => {
    expect(
      sanitizeRecordThresholds({
        clickDebounceMs: -5,
        clickDebouncePx: 'abc',
        typingGapMs: null,
        scrollGapMs: 1.5,
        clickDebouncePx2: 42 // 键名不匹配，忽略
      } as unknown)
    ).toEqual({})
    expect(sanitizeRecordThresholds('350')).toEqual({})
    expect(sanitizeRecordThresholds(null)).toEqual({})
    expect(sanitizeRecordThresholds(undefined)).toEqual({})
  })

  it('sanitize 部分合法时只保留合法键', () => {
    expect(
      sanitizeRecordThresholds({ clickDebounceMs: 0, typingGapMs: -1, scrollGapMs: 300 })
    ).toEqual({ clickDebounceMs: 0, scrollGapMs: 300 })
  })

  it('merge 显式覆盖优先、缺省沿用 base，且不改入参', () => {
    const base = { ...RECORD_THRESHOLD_DEFAULTS }
    const merged = mergeRecordThresholds(base, { clickDebounceMs: 200, typingGapMs: 1000 })
    expect(merged).toEqual({ ...RECORD_THRESHOLD_DEFAULTS, clickDebounceMs: 200, typingGapMs: 1000 })
    // 入参未被修改
    expect(base).toEqual(RECORD_THRESHOLD_DEFAULTS)
  })

  it('merge 无覆盖/空覆盖时原样返回 base', () => {
    expect(mergeRecordThresholds(RECORD_THRESHOLD_DEFAULTS, undefined)).toEqual(
      RECORD_THRESHOLD_DEFAULTS
    )
    expect(mergeRecordThresholds(RECORD_THRESHOLD_DEFAULTS, {})).toEqual(
      RECORD_THRESHOLD_DEFAULTS
    )
    // 非法覆盖值不污染 base
    expect(mergeRecordThresholds(RECORD_THRESHOLD_DEFAULTS, { clickDebounceMs: -1 })).toEqual(
      RECORD_THRESHOLD_DEFAULTS
    )
  })
})
