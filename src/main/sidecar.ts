/**
 * 主进程共享的 sidecar 客户端单例（M3 切片 3）。
 *
 * pick / record / elements:verify 共用同一个 Python sidecar 进程（首次调用
 * 懒拉起），避免多控制器各自 spawn 一个 Python。应用退出时 disposeSidecar()
 * 统一回收子进程。
 */
import { SidecarClient } from '../engine/sidecar/client'

let client: SidecarClient | null = null

/** 懒拉起并返回共享 sidecar 客户端 */
export async function ensureSidecar(): Promise<SidecarClient> {
  if (!client) {
    const c = new SidecarClient()
    await c.start()
    client = c
  }
  return client
}

/** 是否已存在可用 sidecar（stop 等只读操作无需拉起） */
export function sidecarReady(): boolean {
  return client !== null && client.isRunning()
}

/** 应用退出：停掉共享 sidecar 子进程 */
export function disposeSidecar(): void {
  client?.stop()
  client = null
}
