import { describe, expect, it, vi, afterEach } from 'vitest'
import { TaskScheduler } from './scheduler'
import type { TaskRecord } from './store/db'

function mkTask(over: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 't1',
    flowId: 'f1',
    name: '任务',
    triggerType: 'interval',
    cronExpr: '',
    intervalMs: 50,
    hotkey: '',
    watchPath: '',
    enabled: true,
    lastRunAt: null,
    nextRunAt: null,
    runCount: 0,
    createdAt: 0,
    updatedAt: 0,
    ...over
  }
}

/** 造一份带 markTick/isRunning 的 fake ctx */
function mkCtx(opts: {
  loadFlow?: () => any
  fire?: (...a: any[]) => void
  running?: boolean
} = {}) {
  const markRan = vi.fn()
  const markTick = vi.fn()
  const fire = vi.fn(opts.fire as any)
  return {
    ctx: {
      loadFlow: opts.loadFlow ?? (() => ({ version: 1, name: 'x', vars: [], steps: [] })),
      fire,
      markRan,
      markTick,
      isRunning: () => opts.running ?? false
    },
    fire,
    markRan,
    markTick
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('TaskScheduler', () => {
  it('interval 任务到点触发并回写 nextRunAt', async () => {
    const { ctx, fire, markRan } = mkCtx()
    const scheduler = new TaskScheduler(ctx)
    scheduler.reload([mkTask({ intervalMs: 1000 })])
    expect(scheduler.size).toBe(1)

    await new Promise((r) => setTimeout(r, 2300))
    scheduler.stop()
    expect(fire.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(markRan.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('cron 任务注册成功且能算出 nextRun', async () => {
    const { ctx, fire } = mkCtx()
    const scheduler = new TaskScheduler(ctx)
    scheduler.reload([mkTask({ triggerType: 'cron', cronExpr: '0 * * * *' })])
    expect(scheduler.size).toBe(1)
    await new Promise((r) => setTimeout(r, 20))
    scheduler.stop()
    expect(fire).not.toHaveBeenCalled()
  })

  it('非法 cron 表达式被跳过不抛', () => {
    const { ctx } = mkCtx({ loadFlow: () => null })
    const scheduler = new TaskScheduler(ctx)
    expect(() => scheduler.reload([mkTask({ triggerType: 'cron', cronExpr: 'not a cron' })])).not.toThrow()
    expect(scheduler.size).toBe(0)
    scheduler.stop()
  })

  it('loadFlow 返回 null 时跳过本次触发', async () => {
    const { ctx, fire, markTick } = mkCtx({ loadFlow: () => null })
    const scheduler = new TaskScheduler(ctx)
    scheduler.reload([mkTask({ intervalMs: 1000 })])
    await new Promise((r) => setTimeout(r, 1200))
    scheduler.stop()
    expect(fire).not.toHaveBeenCalled()
    expect(markTick).toHaveBeenCalled()
  })

  it('互斥：正在运行时跳过本次，不调 fire 只 markTick', async () => {
    const { ctx, fire, markTick } = mkCtx({ running: true })
    const scheduler = new TaskScheduler(ctx)
    scheduler.reload([mkTask({ intervalMs: 1000 })])
    await new Promise((r) => setTimeout(r, 1200))
    scheduler.stop()
    expect(fire).not.toHaveBeenCalled()
    expect(markTick).toHaveBeenCalled()
  })

  it('补跑：nextRunAt 落在 grace 窗口内启动后立即跑一次', async () => {
    const { ctx, fire, markRan } = mkCtx()
    const scheduler = new TaskScheduler(ctx)
    const twoMinAgo = Date.now() - 2 * 60_000
    scheduler.reload([mkTask({ triggerType: 'interval', intervalMs: 60_000, nextRunAt: twoMinAgo })], {
      catchUp: true
    })
    // queueMicrotask 立即跑一次
    await new Promise((r) => setTimeout(r, 20))
    scheduler.stop()
    expect(fire).toHaveBeenCalledTimes(1)
    expect(markRan).toHaveBeenCalledTimes(1)
  })

  it('不补跑：nextRunAt 超过 grace 窗口不跑；未传 catchUp 也不补跑', async () => {
    const { ctx, fire } = mkCtx()
    const scheduler = new TaskScheduler(ctx)
    const oneHourAgo = Date.now() - 60 * 60_000
    scheduler.reload([mkTask({ triggerType: 'interval', intervalMs: 60_000, nextRunAt: oneHourAgo })], {
      catchUp: true
    })
    await new Promise((r) => setTimeout(r, 20))
    scheduler.stop()
    expect(fire).not.toHaveBeenCalled()

    // 未传 catchUp：即使 nextRunAt 在窗口内也不补跑
    const { ctx: ctx2, fire: fire2 } = mkCtx()
    const s2 = new TaskScheduler(ctx2)
    const twoMinAgo = Date.now() - 2 * 60_000
    s2.reload([mkTask({ triggerType: 'interval', intervalMs: 60_000, nextRunAt: twoMinAgo })])
    await new Promise((r) => setTimeout(r, 20))
    s2.stop()
    expect(fire2).not.toHaveBeenCalled()
  })
})
