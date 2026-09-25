/**
 * 文件监听触发器（M5-5）：fs.watch 监听目录，新文件落盘时跑一次流程。
 *
 * 设计：
 *  - reload(tasks) 全量重建 watcher；每个启用的 file 任务一个 fs.FSWatcher；
 *  - fs.watch 的 'rename' 事件对一次创建会触发多次，这里用 400ms 防抖 +
 *    stat 确认是普通文件才触发；同一文件短时间内不重复触发；
 *  - 复用与调度器/热键同一把 isRunning() 互斥锁；
 *  - 未做递归（recursive 仅 macOS/Windows，MVP 单层目录）。
 */
import { watch, type FSWatcher, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { FlowDoc } from '../shared/ast'
import type { TaskRecord } from './store/db'

export interface FileWatchCtx {
  loadFlow(flowId: string): FlowDoc | null
  fire(flow: FlowDoc, task: TaskRecord): void
  markRan(id: string, nextRunAt: number | null): void
  isRunning(): boolean
}

const DEBOUNCE_MS = 400
/** 同一文件多少毫秒内不重复触发 */
const DEDUP_MS = 5_000

export class FileWatchManager {
  private watchers = new Map<string, FSWatcher>()
  /** taskId -> 待处理防抖定时器 */
  private pending = new Map<string, ReturnType<typeof setTimeout>>()
  /** "taskId|file" -> 上次触发时间戳 */
  private lastFired = new Map<string, number>()

  constructor(private readonly ctx: FileWatchCtx) {}

  reload(tasks: TaskRecord[]): void {
    this.stop()
    for (const t of tasks) {
      if (t.triggerType !== 'file' || !t.watchPath) continue
      try {
        if (!existsSync(t.watchPath)) continue
        const w = watch(t.watchPath, (_eventType, filename) => {
          if (!filename || filename.startsWith('.')) return
          this.schedule(t, String(filename))
        })
        w.on('error', (err) => console.warn(`监听目录 ${t.watchPath} 出错：`, err))
        this.watchers.set(t.id, w)
      } catch (err) {
        console.warn(`监听目录 ${t.watchPath} 失败：`, err)
      }
    }
  }

  /** 防抖合并连续 rename 事件 */
  private schedule(t: TaskRecord, filename: string): void {
    const prev = this.pending.get(t.id)
    if (prev) clearTimeout(prev)
    this.pending.set(
      t.id,
      setTimeout(() => this.onFile(t, filename), DEBOUNCE_MS)
    )
  }

  private onFile(t: TaskRecord, filename: string): void {
    this.pending.delete(t.id)
    const full = join(t.watchPath, filename)
    let st
    try {
      st = statSync(full)
    } catch {
      return // 防抖窗口内被删，忽略
    }
    if (!st.isFile()) return

    // 去重：同一文件 5s 内不重复触发
    const key = `${t.id}|${filename}`
    const now = Date.now()
    const last = this.lastFired.get(key) ?? 0
    if (now - last < DEDUP_MS) return
    this.lastFired.set(key, now)

    if (this.ctx.isRunning()) return
    const flow = this.ctx.loadFlow(t.flowId)
    if (!flow) return
    this.ctx.fire(flow, t)
    this.ctx.markRan(t.id, null)
  }

  stop(): void {
    for (const w of this.watchers.values()) w.close()
    this.watchers.clear()
    for (const h of this.pending.values()) clearTimeout(h)
    this.pending.clear()
  }

  get size(): number {
    return this.watchers.size
  }
}
