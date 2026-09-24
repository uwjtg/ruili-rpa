import { describe, expect, it, vi } from 'vitest'
import { RunManager, buildEngineRegistry } from './runManager'
import type { RunWireEvent } from '../../shared/run-protocol'
import type { FlowDoc } from '../../shared/ast'

describe('RunManager · 事件流转线', () => {
  it('把演示流程跑成一条事件流（含 log/step/flow-end）', async () => {
    const events: RunWireEvent[] = []
    const mgr = new RunManager((e) => events.push(e))
    const flow: FlowDoc = {
      version: 1,
      name: 't',
      vars: [],
      steps: [
        { id: 'a', cmdId: 'logMessage', params: { message: 'hi', level: 'info' } }
      ]
    }
    mgr.start(flow)
    // 等待异步结束
    await new Promise((r) => setTimeout(r, 50))
    const types = events.map((e) => e.type)
    expect(types[0]).toBe('flow-start')
    expect(types).toContain('step-start')
    expect(events.find((e) => e.type === 'log')).toMatchObject({ message: 'hi' })
    const end = events.find((e) => e.type === 'flow-end') as Extract<
      RunWireEvent,
      { type: 'flow-end' }
    >
    expect(end.result.status).toBe('completed')
  })

  it('未注册指令 → 校验抛错并带 issues', async () => {
    const mgr = new RunManager(() => {})
    const flow: FlowDoc = {
      version: 1,
      name: 'bad',
      vars: [],
      steps: [{ id: 'x', cmdId: 'noSuchCmd', params: {} }]
    }
    expect(() => mgr.start(flow)).toThrow(/未注册的指令/)
  })

  it('buildEngineRegistry 聚合了全部指令组', () => {
    const ids = buildEngineRegistry().list().map((c) => c.id)
    expect(ids).toContain('logMessage') // 通用
    expect(ids).toContain('webOpenUrl') // 网页
    expect(ids).toContain('excelWriteCell') // Excel
    expect(ids).toContain('sidecarOcr') // sidecar
  })

  it('流程结束后统一调用 disposer 释放浏览器与 Excel（无论成功失败）', async () => {
    const events: RunWireEvent[] = []
    const disposer = {
      disposeWeb: vi.fn(async () => true),
      disposeExcel: vi.fn(async () => true)
    }
    const mgr = new RunManager(
      (e) => events.push(e),
      undefined,
      disposer
    )
    const flow: FlowDoc = {
      version: 1,
      name: 'cleanup',
      vars: [],
      steps: [
        { id: 'a', cmdId: 'logMessage', params: { message: 'hi', level: 'info' } }
      ]
    }
    mgr.start(flow)
    // 等 flow-end + disposeResources 跑完
    await new Promise((r) => setTimeout(r, 100))

    expect(disposer.disposeWeb).toHaveBeenCalledTimes(1)
    expect(disposer.disposeExcel).toHaveBeenCalledTimes(1)
    // 清理动作以 info 日志追加在 flow-end 之后
    const cleanupLogs = events.filter(
      (e) => e.type === 'log' && (e as { message: string }).message.includes('运行结束')
    )
    expect(cleanupLogs.length).toBe(2)
  })

  it('disposer 返回 false（无资源）时不发清理日志', async () => {
    const events: RunWireEvent[] = []
    const disposer = {
      disposeWeb: vi.fn(async () => false),
      disposeExcel: vi.fn(async () => false)
    }
    const mgr = new RunManager((e) => events.push(e), undefined, disposer)
    mgr.start({
      version: 1,
      name: 'no-res',
      vars: [],
      steps: [
        { id: 'a', cmdId: 'logMessage', params: { message: 'hi', level: 'info' } }
      ]
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(disposer.disposeWeb).toHaveBeenCalledTimes(1)
    expect(disposer.disposeExcel).toHaveBeenCalledTimes(1)
    const cleanupLogs = events.filter(
      (e) => e.type === 'log' && (e as { message: string }).message.includes('运行结束')
    )
    expect(cleanupLogs.length).toBe(0)
  })

  it('整体超时：到期推 warn 日志并触发 stop', async () => {
    const events: RunWireEvent[] = []
    const mgr = new RunManager((e) => events.push(e))
    // delay 200ms；给 30ms 超时
    mgr.start(
      {
        version: 1,
        name: 'timeout',
        vars: [],
        steps: [{ id: 'a', cmdId: 'delay', params: { ms: 200 } }]
      },
      { timeoutMs: 30 }
    )
    await new Promise((r) => setTimeout(r, 80))
    const warn = events.find(
      (e) => e.type === 'log' && (e as { level: string }).level === 'warn'
    )
    expect(warn).toMatchObject({ message: expect.stringContaining('运行超时') })
  })
})
