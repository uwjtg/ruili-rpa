/**
 * 主进程桌面拾取控制器（M3 切片 1）。
 *
 * 职责：
 *  - 懒拉起 Python sidecar（首次 pick:start 时经 ensureSidecar() start()，失败结构化报错）；
 *  - 转发 pick:start（阻塞等待用户点击/取消）与 pick:stop；
 *  - 拾取完成/取消/失败时向渲染端推 pick:result 事件（与 invoke 返回一致，
 *    供 UI 事件驱动复位状态）；
 *  - 应用退出时 dispose() 停掉共享 sidecar（M3 切片 3：pick/record/校验共用）。
 */

import { BrowserWindow } from 'electron'
import type {
  PickReply,
  PickStopReply
} from '../shared/desktop-pick'
import { ensureSidecar, sidecarReady, disposeSidecar } from './sidecar'

export class PickController {
  /** 进行中的拾取请求（并发防重入） */
  private startPromise: Promise<PickReply> | null = null

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  private emit(reply: PickReply): void {
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('pick:result', reply)
    }
  }

  /** 进入拾取模式；返回拾取结果 / 取消 / 失败 */
  async start(): Promise<PickReply> {
    if (this.startPromise) {
      const reply: PickReply = { ok: false, error: '已有一次拾取正在进行' }
      this.emit(reply)
      return reply
    }
    const p = (async (): Promise<PickReply> => {
      const client = await ensureSidecar()
      return client.pickStart()
    })().finally(() => {
      this.startPromise = null
    })
    this.startPromise = p
    try {
      const reply = await p
      this.emit(reply)
      return reply
    } catch (e) {
      const reply: PickReply = {
        ok: false,
        error: `拾取失败：${e instanceof Error ? e.message : String(e)}`
      }
      this.emit(reply)
      return reply
    }
  }

  /** 取消进行中的拾取 */
  async stop(): Promise<PickStopReply> {
    if (!sidecarReady()) {
      return { ok: true, stopped: false }
    }
    try {
      const client = await ensureSidecar()
      return await client.pickStop()
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }

  /** 应用退出：停掉共享 sidecar 子进程 */
  dispose(): void {
    this.startPromise = null
    disposeSidecar()
  }
}
