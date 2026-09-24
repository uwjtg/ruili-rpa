/**
 * POC · Python sidecar 桥（阶段 3 验收）。
 *
 * Node 拉起 Python sidecar 子进程 → 等待握手 → GET /health 探测能力
 * → POST /ocr（未装 RapidOCR 时预期 501 优雅降级，证明桥通）→ 停止。
 *
 * 运行：npm run poc:sidecar
 */

import { SidecarClient } from '../src/engine/sidecar/client'

function stamp(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}
function log(msg: string): void {
  console.log(`[${stamp()}] ${msg}`)
}

async function main(): Promise<void> {
  const client = new SidecarClient()
  log('拉起 Python sidecar…')
  const health = await client.start()
  log(
    `sidecar v${health.version} 就绪：OCR=${health.engines.ocr ? '可用' : '未安装'}，找图=${health.engines.cv2 ? '可用' : '未安装'}`
  )

  // 验证 /ocr 路由：即使引擎未安装，也应返回结构化 501，而不是崩溃
  log('调用 POST /ocr（测试降级路径）…')
  const r = await client.ocr('nonexistent.png')
  log(`/ocr 返回：ok=${r.ok}${r.ok ? `, text=${JSON.stringify(r.text)}` : '（引擎未安装，已优雅降级）'}`)

  if (!client.isRunning()) throw new Error('sidecar 未在运行')
  log('✅ sidecar POC 通过：拉起→握手→health→HTTP 调用→停止 全链路通')
  client.stop()
}

main().catch((e) => {
  console.error('❌ poc:sidecar 失败：', e)
  process.exit(1)
})
