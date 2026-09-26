/**
 * 文件监听触发器（M5-5）：fs.watch 监听目录，新文件落盘时跑一次流程。
 *
 * 设计：
 *  - reload(tasks) 全量重建 watcher；每个启用的 file 任务一个 fs.FSWatcher；
 *  - fs.watch 的 'rename' 事件对一次创建会触发多次，这里用 400ms 防抖 +
 *    stat 确认是普通文件才触发；同一文件短时间内不重复触发；
 *  - 复用与调度器/热键同一把 isRunning() 互斥锁；
 *  - recursive 递归监听子目录（M5-13，Windows 原生支持）；等文件 size 稳定再触发。
 */
import { watch, type FSWatcher, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { FlowDoc } from '../shared/ast'
import type { TaskRecord } from './store/db'

export interface FileWatchCtx {
  loadFlow(flowId: string): FlowDoc | null
  fire(flow: FlowDoc, task: TaskRecord, extraVars?: Record<string, unknown>): void
  markRan(id: string, nextRunAt: number | null): void
  isRunning(): boolean
}

const DEBOUNCE_MS = 400
/** 同一文件多少毫秒内不重复触发 */
const DEDUP_MS = 5_000
/** M5-13：等文件写完——连续两次 stat size 不变才认为落盘完成 */
const STABLE_INTERVAL_MS = 200
/** M5-13：等文件写完最多多久（超时后按当前 size 触发，避免永远挂着） */
const STABLE_TIMEOUT_MS = 5_000

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
        // M5-13：recursive 递归监听子目录（Windows 原生支持）；filename 是相对 watchPath 的路径
        const w = watch(t.watchPath, { recursive: true }, (_eventType, filename) => {
          console.log('FW-RAW:', _eventType, JSON.stringify(filename));
          if (!filename) return
          const base = String(filename).replace(/\\+/g, '/')
          if (base.split('/').some((seg) => seg.startsWith('.'))) return
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
    // M5-13：按 taskId|filename 独立防抖，避免目录变更事件覆盖同 task 下其他文件的 pending
    const key = `${t.id}|${filename}`
    const prev = this.pending.get(key)
    if (prev) clearTimeout(prev)
    this.pending.set(
      key,
      setTimeout(() => {
        void this.onFile(t, filename).catch((err) =>
          console.warn('文件监听触发异常：', err)
        )
      }, DEBOUNCE_MS)
    )
  }

  /** M5-13：轮询 size 稳定后才触发，避免读到拷贝到一半的文件。返回 false=不存在/非文件/被删。 */
  private async waitStable(full: string): Promise<boolean> {
    const deadline = Date.now() + STABLE_TIMEOUT_MS
    let prevSize = -1
    while (Date.now() < deadline) {
      let st
      try {
        st = statSync(full)
      } catch {
        return false // 等待期间被删
      }
      if (!st.isFile()) return false
      if (st.size === prevSize) return true
      prevSize = st.size
      await new Promise((r) => setTimeout(r, STABLE_INTERVAL_MS))
    }
    return true // 超时按当前 size 触发
  }

  private async onFile(t: TaskRecord, filename: string): Promise<void> {
    const key = `${t.id}|${filename}`
    this.pending.delete(key)
    const full = join(t.watchPath, filename)
    if (!(await this.waitStable(full))) return

    // 去重：同一文件 5s 内不重复触发
    const now = Date.now()
    const last = this.lastFired.get(key) ?? 0
    if (now - last < DEDUP_MS) return
    this.lastFired.set(key, now)

    if (this.ctx.isRunning()) return
    const flow = this.ctx.loadFlow(t.flowId)
    if (!flow) return
    this.ctx.fire(flow, t, { triggerFile: full })
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
