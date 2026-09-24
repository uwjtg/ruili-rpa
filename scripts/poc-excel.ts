/**
 * POC · Excel round-trip（阶段 3 验收）。
 *
 * 新建工作簿 → 写几行 → 保存 .xlsx → 重新打开 → 读回断言。
 * 用 exceljs 纯 JS，不依赖本机 Office/WPS。
 *
 * 运行：npm run poc:excel
 */

import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { RealExcelSession } from '../src/engine/excel/workbook'

const OUT_DIR = resolve(process.cwd(), '.runtime')
const OUT_FILE = resolve(OUT_DIR, 'poc-excel.xlsx')

function stamp(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })

  log('新建工作簿…')
  const w = new RealExcelSession()
  w.create()

  const rows = [
    ['商品', '价格'],
    ['机械键盘 A', 299],
    ['机械键盘 B', 349]
  ]
  rows.forEach((row, r) => {
    row.forEach((v, c) => w.writeCell('Sheet1', r + 1, c + 1, v))
  })
  log(`写入 ${rows.length} 行 → ${OUT_FILE}`)
  await w.saveAs(OUT_FILE)
  w.close()

  log('重新打开读回…')
  const r = new RealExcelSession()
  await r.open(OUT_FILE)
  const header = await r.readCell('Sheet1', 1, 1)
  const price = await r.readCell('Sheet1', 3, 2)
  log(`A1 = ${header}；B3 = ${price}`)
  r.close()

  if (header !== '商品' || price !== 349) {
    throw new Error(`断言失败：A1="${header}", B3=${price}`)
  }
  log('✅ Excel round-trip POC 通过：新建→写入→保存→重开→读回 一致')
}

function log(msg: string): void {
  console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${msg}`)
}

main().catch((e) => {
  console.error('❌ poc:excel 失败：', e)
  process.exit(1)
})
