/**
 * 计划任务调度器（M5 调度切片）。
 *
 * 不依赖 Electron：构造时注入 loadFlow / fire / markRan 回调，主进程在
 * whenReady 后传入 RunManager 与 DB；单测可用 fake 回调。
 *
 * 两种触发：
 *  - cron：croner 解析标准 cron 表达式；
 *  - interval：setInterval 每 intervalMs 触发一次。
 *
 * reload(tasks) 全量重建定时器；stop() 停掉全部。启停/增删后由主进程调 reload。
 */
import { Cron } from 'croner'
import type { FlowDoc } from '../shared/ast'
import type { TaskRecord } from './store/db'

export interface TaskFireContext {
  /** 按 flowId 加载流程；不存在返回 null（跳过本次触发） */
  loadFlow(flowId: string): FlowDoc | null
  /** 触发一次运行（主进程接到后交给 RunManager） */
  fire(flow: FlowDoc, task: TaskRecord): void
  /** 回写 last_run_at / run_count / next_run_at */
  markRan(id: string, nextRunAt: number | null): void
}

export class TaskScheduler {
  private crons = new Map<string, Cron>()
  private intervals = new Map<string, ReturnType<typeof setInterval>>()

  constructor(private readonly ctx: TaskFireContext) {}

  /** 全量重建定时器 */
  reload(tasks: TaskRecord[]): void {
    this.stop()
    for (const t of tasks) {
      if (t.triggerType === 'cron') {
        let cron: Cron
        try {
          cron = new Cron(t.cronExpr, () => void this.run(t))
        } catch {
          continue // 非法 cron 表达式跳过（UI 已校验）
        }
        this.crons.set(t.id, cron)
      } else {
        const ms = Math.max(1000, t.intervalMs)
        const handle = setInterval(() => void this.run(t), ms)
        // 允许 Node 在只有定时器时退出
        if (typeof handle.unref === 'function') handle.unref()
        this.intervals.set(t.id, handle)
      }
    }
  }

  /** 停掉全部定时器 */
  stop(): void {
    for (const c of this.crons.values()) c.stop()
    this.crons.clear()
    for (const h of this.intervals.values()) clearInterval(h)
    this.intervals.clear()
  }

  /** 当前注册了多少个启用任务（测试/诊断用） */
  get size(): number {
    return this.crons.size + this.intervals.size
  }

  private run(t: TaskRecord): void {
    const flow = this.ctx.loadFlow(t.flowId)
    if (!flow) return
    this.ctx.fire(flow, t)
    const cron = this.crons.get(t.id)
    const next = cron?.nextRun()?.getTime() ?? null
    // interval 型：下一次 = 现在 + intervalMs
    const nextAt = next ?? Date.now() + Math.max(1000, t.intervalMs)
    this.ctx.markRan(t.id, nextAt)
  }
}
