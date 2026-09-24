/**
 * M1 引擎 MVP 端到端 POC（计划书 §7 验收）：
 *
 * 通过真实 RunManager（含资源生命周期）跑 M1_E2E_FLOW：
 *  - 真实 Chromium 打开离线测试页 → 输入 → 点击 → 等待结果元素 → 提取标题
 *  - 新建 Excel → 写表头 → excelWriteRow 写一行 → 保存
 *  - 流程结束后由 RunManager 自动关闭浏览器 / 释放 Excel
 *
 * 断言：
 *  1) flow-end status=completed
 *  2) .runtime/m1-e2e.xlsx 真实落盘
 *  3) 浏览器会话 isRunning()===false（已自动关闭）
 *  4) Excel 会话 isOpen()===false（已自动释放）
 *
 * 运行：npm run poc:m1
 */

import { existsSync, mkdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { RunManager } from '../src/engine/run/runManager'
import { M1_E2E_FLOW, M1_E2E_OUTFILE } from '../src/engine/core/m1-flow'
import { getWebSession } from '../src/engine/web/session'
import { getExcelSession } from '../src/engine/excel/workbook'
import type { RunWireEvent } from '../src/shared/run-protocol'

function stamp(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}
function log(msg: string): void {
  console.log(`[${stamp()}] ${msg}`)
}

function ensureRuntimeDir(): void {
  const dir = resolve(process.cwd(), '.runtime')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

async function main(): Promise<void> {
  ensureRuntimeDir()

  // 预先删除旧产物，确保断言的是本次写入
  if (existsSync(M1_E2E_OUTFILE)) {
    const { unlinkSync } = await import('node:fs')
    unlinkSync(M1_E2E_OUTFILE)
  }

  let flowEnd: Promise<RunWireEvent> = new Promise((resolveP) => {
    const mgr = new RunManager((e: RunWireEvent) => {
      switch (e.type) {
        case 'flow-start':
          log(`▶ 流程开始: ${e.flowName}`)
          break
        case 'step-start':
          log(`  → ${e.stepId} (${e.cmdId})`)
          break
        case 'log':
          log(`    [${e.level}] ${e.message}`)
          break
        case 'flow-end':
          log(`⏹ 流程结束: status=${e.result.status}, steps=${e.result.stepsExecuted}, ${e.result.durationMs}ms`)
          resolveP(e)
          break
        default:
          break
      }
    })
    // 60s 整体超时保险
    mgr.start(M1_E2E_FLOW, { timeoutMs: 60_000 })
  })

  const endEvent = (await flowEnd) as Extract<RunWireEvent, { type: 'flow-end' }>
  if (endEvent.result.status !== 'completed') {
    throw new Error(`M1 端到端未完成: ${JSON.stringify(endEvent.result)}`)
  }

  // 等一拍，让 RunManager finally 里的 disposeResources 跑完
  await new Promise((r) => setTimeout(r, 300))

  // 断言 1：xlsx 落盘
  if (!existsSync(M1_E2E_OUTFILE)) {
    throw new Error(`未找到产物文件: ${M1_E2E_OUTFILE}`)
  }
  const size = statSync(M1_E2E_OUTFILE).size
  log(`✅ 产物已落盘: ${M1_E2E_OUTFILE}（${size} 字节）`)

  // 断言 2/3：资源已自动释放
  const webRunning = getWebSession().isRunning()
  const excelOpen = getExcelSession().isOpen()
  log(`   资源状态 → 浏览器 isRunning=${webRunning}（期望 false）；Excel isOpen=${excelOpen}（期望 false）`)
  if (webRunning) throw new Error('浏览器未被自动关闭')
  if (excelOpen) throw new Error('Excel 工作簿未被自动释放')

  log('✅ M1 端到端 POC 通过：真实浏览器→抓取→写 Excel 全链路 + 运行结束资源自动清理')
}

main().catch((e) => {
  console.error('❌ poc:m1 失败：', e)
  process.exit(1)
})
