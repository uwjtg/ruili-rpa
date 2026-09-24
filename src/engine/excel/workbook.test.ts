import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RealExcelSession } from './workbook'

/**
 * 真实 exceljs round-trip（纯 JS，不启动 Office）。
 * 写临时 xlsx → 关闭 → 重新打开 → 读回，断言值一致。
 */
describe('exceljs round-trip（临时文件）', () => {
  it('写入数字/字符串并读回一致', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ruili-excel-'))
    const file = join(dir, 'roundtrip.xlsx')

    const w = new RealExcelSession()
    w.create()
    w.writeCell('Sheet1', 1, 1, '商品')
    w.writeCell('Sheet1', 1, 2, '价格')
    w.writeCell('Sheet1', 2, 1, '机械键盘')
    w.writeCell('Sheet1', 2, 2, 299)
    await w.saveAs(file)
    w.close()

    const r = new RealExcelSession()
    await r.open(file)
    expect(await r.readCell('Sheet1', 1, 1)).toBe('商品')
    expect(await r.readCell('Sheet1', 2, 1)).toBe('机械键盘')
    expect(await r.readCell('Sheet1', 2, 2)).toBe(299)
    r.close()
  })
})
