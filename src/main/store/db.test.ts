/**
 * SQLite 存储单测（M2 切片 2）。
 * 用内存库（:memory:）跑 flow:save/list/load/delete 全链路，不依赖 Electron。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDb,
  deleteElement,
  deleteFlow,
  elementLabel,
  getElement,
  listElements,
  listFlows,
  loadFlow,
  loadRecordThresholds,
  openDb,
  saveElement,
  saveFlow,
  saveRecordThresholds
} from './db'
import { RECORD_THRESHOLD_DEFAULTS } from '../../shared/record-settings'
import type { PickedElement } from '../../shared/desktop-pick'
import type { FlowDoc } from '../../shared/ast'

function makeFlow(name: string, stepCount = 2): FlowDoc {
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    id: `s${i + 1}`,
    cmdId: 'logMessage',
    params: { message: `${name}-${i + 1}`, level: 'info' }
  }))
  return { version: 1, name, vars: [], steps }
}

describe('SQLite 流程持久化', () => {
  beforeEach(() => openDb(':memory:'))
  afterEach(() => closeDb())

  it('保存新建流程后能按 id 加载回来（深等）', () => {
    const flow = makeFlow('我的比价流程', 3)
    const saved = saveFlow(flow)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    const loaded = loadFlow(saved.id)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.flow).toEqual(flow)
    expect(loaded.flow.name).toBe('我的比价流程')
    expect(loaded.flow.steps).toHaveLength(3)
  })

  it('列表按最近编辑倒序，且带步骤数', () => {
    const a = saveFlow(makeFlow('流程A', 1))
    const b = saveFlow(makeFlow('流程B', 5))
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return

    const list = listFlows()
    expect(list.ok).toBe(true)
    if (!list.ok) return
    expect(list.items.length).toBe(2)
    // 后保存的 B 排在前
    expect(list.items[0].name).toBe('流程B')
    expect(list.items[0].stepCount).toBe(5)
    expect(list.items[1].stepCount).toBe(1)
  })

  it('按 id 再次保存为更新（同名同 id，不产生新行）', () => {
    const flow = makeFlow('待改名', 2)
    const r1 = saveFlow(flow)
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    const updated: FlowDoc = { ...flow, name: '已改名', steps: flow.steps.slice(0, 1) }
    const r2 = saveFlow(updated, r1.id)
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(r2.id).toBe(r1.id)

    const list = listFlows()
    expect(list.ok && list.items.length === 1).toBe(true)
    const loaded = loadFlow(r1.id)
    expect(loaded.ok && loaded.flow.name === '已改名').toBe(true)
  })

  it('删除流程后列表与加载都为空/报错', () => {
    const flow = makeFlow('临时', 2)
    const r = saveFlow(flow)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(deleteFlow(r.id)).toEqual({ ok: true })
    const list = listFlows()
    expect(list).toEqual({ ok: true, items: [] })
    const gone = loadFlow(r.id)
    expect(gone.ok).toBe(false)
  })

  it('加载不存在的 id 返回错误而非抛异常', () => {
    const r = loadFlow('no-such-id')
    expect(r.ok).toBe(false)
  })

  it('嵌套 children 步骤数统计正确', () => {
    const flow: FlowDoc = {
      version: 1,
      name: '嵌套',
      vars: [],
      steps: [
        { id: 's1', cmdId: 'logMessage', params: {}, children: [
          { id: 's1-1', cmdId: 'delay', params: {} },
          { id: 's1-2', cmdId: 'logMessage', params: {} }
        ] },
        { id: 's2', cmdId: 'logMessage', params: {} }
      ]
    }
    const r = saveFlow(flow)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const list = listFlows()
    expect(list.ok && list.items[0].stepCount).toBe(4)
  })

  it('M3 切片 17：flow.recordThresholds 流程级覆盖随流程往返持久化', () => {
    const flow: FlowDoc = {
      version: 1,
      name: '阈值覆盖流程',
      vars: [],
      steps: [{ id: 's1', cmdId: 'logMessage', params: {} }],
      recordThresholds: { clickDebounceMs: 200, scrollGapMs: 900 }
    }
    const saved = saveFlow(flow)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    const loaded = loadFlow(saved.id)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.flow.recordThresholds).toEqual({ clickDebounceMs: 200, scrollGapMs: 900 })
    const legacy = makeFlow('旧流程', 1)
    const r2 = saveFlow(legacy)
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    const loadedLegacy = loadFlow(r2.id)
    expect(loadedLegacy.ok && loadedLegacy.flow.recordThresholds === undefined).toBe(true)
  })
})

function makeElement(overrides: Partial<PickedElement> = {}): PickedElement {
  return {
    windowHandle: 123,
    automationId: 'btn_ok',
    name: '确定',
    controlType: 'ButtonControl',
    className: 'Button',
    boundingBox: { x: 10, y: 20, width: 100, height: 30 },
    windowTitle: '主窗口',
    processId: 4242,
    text: '确定',
    index: 2,
    ancestor: [{ controlType: 'PaneControl', automationId: 'panel_main', name: '' }],
    ...overrides
  }
}

describe('元素库（M3 切片 2）', () => {
  beforeEach(() => openDb(':memory:'))
  afterEach(() => closeDb())

  it('保存元素后可列出，签名完整往返', () => {
    const sig = makeElement()
    const saved = saveElement(sig)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    const list = listElements()
    expect(list.ok).toBe(true)
    if (!list.ok) return
    expect(list.items).toHaveLength(1)
    expect(list.items[0].label).toBe('确定')
    expect(list.items[0].signature).toEqual(sig)
    expect(list.items[0].signature.ancestor).toEqual(sig.ancestor)
    expect(list.items[0].signature.index).toBe(2)
  })

  it('同一签名去重 upsert（重复拾取不新增行）', () => {
    const a = saveElement(makeElement())
    const b = saveElement(makeElement())
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(b.id).toBe(a.id) // 去重命中保持原 id

    const list = listElements()
    expect(list.ok && list.items.length).toBe(1)
  })

  it('不同特征视为不同元素', () => {
    saveElement(makeElement())
    saveElement(makeElement({ automationId: 'btn_cancel', name: '取消' }))
    const list = listElements()
    expect(list.ok && list.items.length).toBe(2)
  })

  it('删除元素后列表为空', () => {
    const r = saveElement(makeElement())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(deleteElement(r.id)).toEqual({ ok: true })
    const list = listElements()
    expect(list.ok && list.items.length).toBe(0)
  })

  it('elementLabel 兜底命名', () => {
    const full = makeElement()
    expect(elementLabel(full)).toBe('确定')
    expect(elementLabel({ ...full, name: '' })).toBe('btn_ok')
    expect(elementLabel({ ...full, name: '', automationId: '' })).toBe('ButtonControl')
    expect(
      elementLabel({ ...full, name: '', automationId: '', controlType: '' })
    ).toBe('未命名元素')
  })

  // M3 切片 3：元素库「校验」按 id 取回
  it('getElement 按 id 取回完整签名', () => {
    const sig = makeElement()
    const saved = saveElement(sig)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    const got = getElement(saved.id)
    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.element.signature).toEqual(sig)
    expect(got.element.id).toBe(saved.id)
  })

  it('getElement 不存在的 id 返回错误', () => {
    const got = getElement('no-such-element')
    expect(got.ok).toBe(false)
  })
})

describe('录制聚合阈值持久化（M3 切片 12）', () => {
  beforeEach(() => openDb(':memory:'))
  afterEach(() => closeDb())

  it('未保存时读取返回全量默认值', () => {
    expect(loadRecordThresholds()).toEqual(RECORD_THRESHOLD_DEFAULTS)
  })

  it('保存后可完整读回', () => {
    const saved = saveRecordThresholds({
      clickDebounceMs: 500,
      clickDebouncePx: 12,
      typingGapMs: 900,
      scrollGapMs: 600
    })
    expect(saved.ok).toBe(true)
    expect(loadRecordThresholds()).toEqual({
      clickDebounceMs: 500,
      clickDebouncePx: 12,
      typingGapMs: 900,
      scrollGapMs: 600
    })
  })

  it('部分保存与现存值合并（未传键保留旧值/默认值）', () => {
    saveRecordThresholds({ clickDebounceMs: 500 })
    saveRecordThresholds({ typingGapMs: 1000 })
    expect(loadRecordThresholds()).toEqual({
      clickDebounceMs: 500,
      clickDebouncePx: 10,
      typingGapMs: 1000,
      scrollGapMs: 400
    })
  })

  it('非法值（负数/非数字/未知键）净化后不落盘', () => {
    const saved = saveRecordThresholds({
      clickDebounceMs: -1,
      clickDebouncePx: 'abc',
      typingGapMs: 700,
      scrollGapMs: null,
      bogus: 5
    })
    expect(saved.ok).toBe(true)
    expect(loadRecordThresholds()).toEqual({
      clickDebounceMs: 350,
      clickDebouncePx: 10,
      typingGapMs: 700,
      scrollGapMs: 400
    })
  })
})
