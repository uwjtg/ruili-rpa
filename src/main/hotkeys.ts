/**
 * 热键触发器（M5-4）：用 Electron globalShortcut 注册全局快捷键，
 * 按下时加载对应流程并交给 RunManager。
 *
 * 不依赖具体任务表结构，构造注入 loadFlow/fire/markRan 回调；
 * reload(tasks) 全量重注册（启停/增删后由主进程调用）；stop() 全部注销。
 *
 * 与 cron/interval 不同：热键没有「下一次」时间，触发后 markRan(id, null) 只记计数与上次时间。
 */
import { globalShortcut } from 'electron'
import type { FlowDoc } from '../shared/ast'
import type { TaskRecord } from './store/db'

export interface HotkeyCtx {
  loadFlow(flowId: string): FlowDoc | null
  fire(flow: FlowDoc, task: TaskRecord): void
  markRan(id: string, nextRunAt: number | null): void
  /** 运行中则跳过（与调度器同一把全局锁） */
  isRunning(): boolean
}

export class HotkeyManager {
  private registered: string[] = []

  constructor(private readonly ctx: HotkeyCtx) {}

  /** 全量重注册：先清空旧的，再为启用中的 hotkey 任务注册 */
  reload(tasks: TaskRecord[]): void {
    this.stop()
    for (const t of tasks) {
      if (t.triggerType !== 'hotkey' || !t.hotkey) continue
      const acc = t.hotkey
      try {
        const ok = globalShortcut.register(acc, () => this.run(t))
        if (ok) {
          this.registered.push(acc)
        } else {
          console.warn(`热键 ${acc} 注册失败（可能被其他程序占用）`)
        }
      } catch (err) {
        console.warn(`热键 ${acc} 注册异常：`, err)
      }
    }
  }

  private run(t: TaskRecord): void {
    if (this.ctx.isRunning()) return // 与计划任务同一把互斥锁
    const flow = this.ctx.loadFlow(t.flowId)
    if (!flow) return
    this.ctx.fire(flow, t)
    this.ctx.markRan(t.id, null)
  }

  /** 注销全部热键 */
  stop(): void {
    for (const acc of this.registered) globalShortcut.unregister(acc)
    this.registered = []
  }

  /** 当前注册了几个热键（测试/诊断用） */
  get size(): number {
    return this.registered.length
  }
}
