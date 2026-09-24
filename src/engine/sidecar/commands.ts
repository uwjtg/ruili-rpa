/**
 * Sidecar 指令（阶段 3 POC）。
 *
 *  1. sidecarStart   启动 Python sidecar
 *  2. sidecarOcr     OCR 识别图片文字 → 变量
 *  3. sidecarStop    停止 sidecar
 */

import type { RegisteredCommand } from '../commands/registry'
import { SidecarClient } from './client'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

/** 最小客户端接口（测试可注入 stub） */
export interface SidecarLike {
  start(): Promise<unknown>
  ocr(imagePath: string): Promise<{ ok: boolean; text: string }>
  stop(): void
  isRunning(): boolean
}

export interface SidecarCommandsDeps {
  client?: SidecarLike
}

export function registerSidecarCommands(
  registry: RegistryLike,
  deps: SidecarCommandsDeps = {}
): void {
  const client: SidecarLike = deps.client ?? new SidecarClient()

  registry.register({
    id: 'sidecarStart',
    name: '启动 Python 助手',
    group: '系统',
    icon: 'cpu',
    params: [],
    summary: () => '启动 Python sidecar（OCR/找图）',
    runner: async (ctx) => {
      ctx.log('info', '启动 Python sidecar…')
      const health = (await client.start()) as {
        version: string
        engines: { ocr: boolean; cv2: boolean }
      }
      ctx.log(
        'success',
        `sidecar v${health.version} 就绪；OCR=${health.engines.ocr ? '可用' : '未安装（降级）'}，找图=${health.engines.cv2 ? '可用' : '未安装（降级）'}`
      )
      return health
    }
  })

  registry.register({
    id: 'sidecarOcr',
    name: 'OCR 识别图片',
    group: '图像',
    icon: 'scan',
    params: [
      { key: 'imagePath', label: '图片路径', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    summary: (p) => `OCR ${str(p.imagePath)} → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const imagePath = ctx.interpolate(str(p.imagePath))
      const resultVar = str(p.resultVar)
      const r = await client.ocr(imagePath)
      if (!r.ok) {
        throw new Error(`OCR 失败（引擎可能未安装）：${JSON.stringify(r)}`)
      }
      ctx.setVar(resultVar, r.text)
      ctx.log('success', `OCR 识别 ${r.text.length} 字 → ${resultVar}`)
      return r.text
    }
  })

  registry.register({
    id: 'sidecarStop',
    name: '停止 Python 助手',
    group: '系统',
    icon: 'power',
    params: [],
    summary: () => '停止 Python sidecar',
    runner: async (ctx) => {
      client.stop()
      ctx.log('success', 'sidecar 已停止')
      return true
    }
  })
}
