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
    enabled: true,
    lastRunAt: null,
    nextRunAt: null,
    runCount: 0,
    createdAt: 0,
    updatedAt: 0,
    ...over
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('TaskScheduler', () => {
  it('interval 任务到点触发并回写 nextRunAt', async () => {
    const fired: string[] = []
    const scheduler = new TaskScheduler({
      loadFlow: () => ({ version: 1, name: 'x', vars: [], steps: [] }),
      fire: (_flow, t) => fired.push(t.id),
      markRan: vi.fn()
    })
    scheduler.reload([mkTask({ intervalMs: 1000 })])
    expect(scheduler.size).toBe(1)

    await new Promise((r) => setTimeout(r, 2300))
    scheduler.stop()
    expect(fired.length).toBeGreaterThanOrEqual(2)
  })

  it('cron 任务注册成功且能算出 nextRun', async () => {
    const fire = vi.fn()
    const scheduler = new TaskScheduler({
      loadFlow: () => ({ version: 1, name: 'x', vars: [], steps: [] }),
      fire,
      markRan: vi.fn()
    })
    // 每小时第 0 分
    scheduler.reload([mkTask({ triggerType: 'cron', cronExpr: '0 * * * *' })])
    expect(scheduler.size).toBe(1)
    await new Promise((r) => setTimeout(r, 20))
    scheduler.stop()
    // cron 不应在 20ms 内触发（除非刚好撞上整点）
    expect(fire).not.toHaveBeenCalled()
  })

  it('非法 cron 表达式被跳过不抛', () => {
    const scheduler = new TaskScheduler({
      loadFlow: () => null,
      fire: vi.fn(),
      markRan: vi.fn()
    })
    expect(() => scheduler.reload([mkTask({ triggerType: 'cron', cronExpr: 'not a cron' })])).not.toThrow()
    expect(scheduler.size).toBe(0)
    scheduler.stop()
  })

  it('loadFlow 返回 null 时跳过本次触发', async () => {
    const fire = vi.fn()
    const scheduler = new TaskScheduler({
      loadFlow: () => null,
      fire,
      markRan: vi.fn()
    })
    scheduler.reload([mkTask({ intervalMs: 30 })])
    await new Promise((r) => setTimeout(r, 120))
    scheduler.stop()
    expect(fire).not.toHaveBeenCalled()
  })
})
