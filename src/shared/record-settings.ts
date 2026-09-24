/**
 * 录制聚合阈值设置（M3 切片 12）。
 *
 * 切片 8 把聚合阈值做成 /record/start 可选 thresholds（透传不落盘）；本模块补上
 * 「编辑器可调 + 持久化 + 录制自动带上」闭环：
 *  - 默认值与 sidecar 常量一致（desktop_pick.py CLICK_DEBOUNCE_MS 等）；
 *  - sanitizeRecordThresholds：与 sidecar _apply_thresholds 语义一致——只收有限
 *    非负整数（数字或数字字符串），忽略 None/非数字/负数/未知键；
 *  - mergeRecordThresholds：显式覆盖优先、缺省沿用 base，主进程起录制时用它把
 *    DB 里的持久化阈值与调用方显式值合并。
 *
 * 本模块纯函数，供 renderer / main / sidecar client 共用。
 */

/** 录制聚合阈值（camelCase，经 SidecarClient 转 snake_case 发出） */
export interface RecordThresholds {
  /** 点击防抖：间隔内同位置点击合并为一次（ms） */
  clickDebounceMs: number
  /** 点击防抖距离：两次点击坐标差小于该值视为同位置（px） */
  clickDebouncePx: number
  /** 键盘输入分段：停顿超过该时长视为新输入段（ms） */
  typingGapMs: number
  /** 滚动聚合：间隔内的同位置滚动 delta 累加（ms） */
  scrollGapMs: number
}

/** 阈值键（与 sidecar snake_case 键一一对应） */
export const RECORD_THRESHOLD_KEYS: ReadonlyArray<keyof RecordThresholds> = [
  'clickDebounceMs',
  'clickDebouncePx',
  'typingGapMs',
  'scrollGapMs'
]

/** 默认值（与 sidecar desktop_pick.py 模块常量一致） */
export const RECORD_THRESHOLD_DEFAULTS: RecordThresholds = {
  clickDebounceMs: 350,
  clickDebouncePx: 10,
  typingGapMs: 800,
  scrollGapMs: 400
}

/**
 * 净化用户输入为合法的非负整数阈值。
 * 输入可以是数字或数字字符串（UI 输入框给 string）；非有限/非数字/负数/未知键
 * 一律忽略（不写进结果）。与 sidecar `_apply_thresholds` 的静默忽略语义对齐。
 */
export function sanitizeRecordThresholds(raw: unknown): Partial<RecordThresholds> {
  const out: Partial<RecordThresholds> = {}
  if (raw === null || typeof raw !== 'object') return out
  const obj = raw as Record<string, unknown>
  for (const key of RECORD_THRESHOLD_KEYS) {
    const v = obj[key]
    if (v === undefined || v === null) continue
    const num = typeof v === 'number' ? v : Number(String(v))
    if (!Number.isFinite(num)) continue
    if (num < 0 || !Number.isInteger(num)) continue
    out[key] = num
  }
  return out
}

/** 合并：显式覆盖优先，缺省沿用 base（base 通常为 DB 值或默认值）。不改入参。 */
export function mergeRecordThresholds(
  base: RecordThresholds,
  overrides?: Partial<RecordThresholds>
): RecordThresholds {
  const clean = overrides ? sanitizeRecordThresholds(overrides) : {}
  return { ...base, ...clean }
}
