/**
 * 计划任务调度器（M5 调度切片；M5-2 加固：运行中互斥 + 错过补跑）。
 *
 * 不依赖 Electron：构造时注入 loadFlow / fire / markRan / markTick / isRunning 回调，
 * 主进程在 whenReady 后传入 RunManager 与 DB；单测可用 fake 回调。
 *
 * 两种触发：
 *  - cron：croner 解析标准 cron 表达式；
 *  - interval：setInterval 每 intervalMs 触发一次（floor 1000ms，unref）。
 *
 * 互斥：isRunning() 为真时本次到点跳过，只推进 next_run_at（不增 run_count）。
 * 补跑：reload(tasks, { catchUp: true }) 时，若 DB 里存的 next_run_at 已在过去且在
 *  graceMs 窗口内（默认 5 分钟），说明关机/睡眠期间错过一次，立即补跑一次。
 *  启停/增删后的 reload 不传 catchUp，不补跑。
 */
import { Cron } from 'croner'
import type { FlowDoc } from '../shared/ast'
import type { TaskRecord } from './store/db'

export interface TaskFireContext {
  /** 按 flowId 加载流程；不存在返回 null（跳过本次触发） */
  loadFlow(flowId: string): FlowDoc | null
  /** 触发一次运行（主进程接到后交给 RunManager） */
  fire(flow: FlowDoc, task: TaskRecord): void
  /** 实际跑了一次：回写 last_run_at / run_count / next_run_at */
  markRan(id: string, nextRunAt: number | null): void
  /** 跳过本次（互斥/loadFlow 缺失）：只推进 next_run_at */
  markTick(id: string, nextRunAt: number | null): void
  /** 是否有流程正在运行（全局互斥） */
  isRunning(): boolean
}

export interface ReloadOptions {
  /** 启动时为 true：对落在 grace 窗口内的错过触发点补跑一次 */
  catchUp?: boolean
  /** 补跑容忍窗口（毫秒），默认 5 分钟；超过则不补跑，直接对齐下一次 */
  graceMs?: number
}

export class TaskScheduler {
  private crons = new Map<string, Cron>()
  private intervals = new Map<string, ReturnType<typeof setInterval>>()

  constructor(private readonly ctx: TaskFireContext) {}

  /** 全量重建定时器；opts.catchUp=true 时对错过触发点补跑一次（仅启动时用） */
  reload(tasks: TaskRecord[], opts: ReloadOptions = {}): void {
    this.stop()
    const now = Date.now()
    const grace = opts.graceMs ?? 5 * 60_000
    for (const t of tasks) {
      if (t.triggerType === 'cron') {
        let cron: Cron
        try {
          cron = new Cron(t.cronExpr, () => void this.run(t))
        } catch {
          continue // 非法 cron 表达式跳过（UI 已校验）
        }
        this.crons.set(t.id, cron)
        if (opts.catchUp && this.isMissed(t.nextRunAt, now, grace)) {
          // 错过补跑：下一个 tick 跑一次
          queueMicrotask(() => void this.run(t))
        }
      } else {
        const ms = Math.max(1000, t.intervalMs)
        const handle = setInterval(() => void this.run(t), ms)
        if (typeof handle.unref === 'function') handle.unref()
        this.intervals.set(t.id, handle)
        if (opts.catchUp && this.isMissed(t.nextRunAt, now, grace)) {
          queueMicrotask(() => void this.run(t))
        }
      }
    }
  }

  private isMissed(storedNext: number | null, now: number, grace: number): boolean {
    if (storedNext == null) return false
    const age = now - storedNext
    return age > 0 && age <= grace
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

  /** 计算某任务下一次触发时间（供回写） */
  private nextAt(t: TaskRecord): number | null {
    const cron = this.crons.get(t.id)
    const next = cron?.nextRun()?.getTime()
    return next ?? Date.now() + Math.max(1000, t.intervalMs)
  }

  private run(t: TaskRecord): void {
    // 互斥：有流程在跑就跳过本次（不覆盖 interpreter）
    if (this.ctx.isRunning()) {
      this.ctx.markTick(t.id, this.nextAt(t))
      return
    }
    const flow = this.ctx.loadFlow(t.flowId)
    if (!flow) {
      this.ctx.markTick(t.id, this.nextAt(t))
      return
    }
    this.ctx.fire(flow, t)
    this.ctx.markRan(t.id, this.nextAt(t))
  }
}
