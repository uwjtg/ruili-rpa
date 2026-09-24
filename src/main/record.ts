/**
 * 主进程桌面录制控制器（M3 切片 3）。
 *
 * 录制链路：
 *  - record:start → 共享 sidecar /record/start（观察模式全局钩子，不吞输入；
 *    传入主进程 PID 过滤点到自己应用/编辑器的杂音事件）；
 *  - 用户在目标窗口执行操作（点击 / 输入 / 滚动）→ sidecar 事件流；
 *  - record:stop → sidecar 按阈值聚合为指令序列；
 *  - 本控制器把指令里的元素签名写入元素库（与拾取共用 saveElement 签名去重：
 *    录制即入库），renderer 再把指令追加为流程步骤。
 */
import { BrowserWindow } from 'electron'
import type {
  RecordStartReply,
  RecordStopReply,
  RecordedInstruction
} from '../shared/desktop-record'
import type { PickedElement } from '../shared/desktop-pick'
import { ensureSidecar } from './sidecar'
import { saveElement } from './store/db'

export class RecordController {
  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  /** 开启录制：sidecar 观察模式钩子就绪后立即返回（不阻塞用户操作）；thresholds 聚合阈值（M3 切片 8） */
  async start(targetPid?: number, thresholds?: {
    clickDebounceMs?: number; clickDebouncePx?: number; typingGapMs?: number; scrollGapMs?: number
  }): Promise<RecordStartReply> {
    try {
      const client = await ensureSidecar()
      return await client.recordStart(process.pid, targetPid, thresholds)
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** 结束录制：sidecar 聚合指令序列 → 元素签名写入元素库（录制即入库） */
  async stop(): Promise<RecordStopReply> {
    try {
      const client = await ensureSidecar()
      const reply = await client.recordStop()
      if (reply.ok) {
        this.saveRecordedElements(reply.instructions)
        this.notify(reply)
      }
      return reply
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** 录制即入库：指令中的元素签名走与拾取相同的 saveElement 去重 upsert */
  private saveRecordedElements(instructions: RecordedInstruction[]): void {
    const seen = new Set<string>()
    for (const ins of instructions) {
      const target = ins.params?.target
      if (!target || typeof target !== 'object') continue
      const sig = target as PickedElement
      if (typeof sig !== 'object' || sig === null) continue
      if (!Number.isFinite(sig.windowHandle ?? NaN) && !sig.boundingBox) continue
      const key = [
        sig.windowHandle,
        sig.automationId ?? '',
        sig.name ?? '',
        sig.controlType ?? ''
      ].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      void saveElement(sig)
    }
  }

  /** 录制结束事件（供 UI 在无 invoke 返回值时也能复位；当前仅日志留痕用） */
  private notify(reply: RecordStopReply): void {
    const win = this.getWindow()
    if (win && !win.isDestroyed() && reply.ok) {
      win.webContents.send('record:result', reply)
    }
  }
}
