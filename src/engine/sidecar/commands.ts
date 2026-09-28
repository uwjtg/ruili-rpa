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
  officeExcelOpen?(path: string, visible?: boolean, engine?: string): Promise<Record<string, unknown>>
  officeExcelRead?(sheet: string, range: string): Promise<Record<string, unknown>>
  officeExcelWrite?(sheet: string, range: string, values: unknown[][]): Promise<Record<string, unknown>>
  officeExcelClose?(save?: boolean): Promise<Record<string, unknown>>
  officeWordOpen?(path: string, visible?: boolean, engine?: string): Promise<Record<string, unknown>>
  officeWordReplace?(find: string, replace: string, matchCase?: boolean): Promise<Record<string, unknown>>
  officeExcelMerge?(sheet: string, range: string): Promise<Record<string, unknown>>
  officeExcelRecalc?(): Promise<Record<string, unknown>>
  officeExcelAddChart?(opts: {
    sheet: string; chartType: string; source: string;
    left?: number; top?: number; width?: number; height?: number; title?: string
  }): Promise<Record<string, unknown>>
  officeExcelExportPdf?(outPath: string): Promise<Record<string, unknown>>
  officeWordExportPdf?(outPath: string): Promise<Record<string, unknown>>
  officeWordClose?(save?: boolean): Promise<Record<string, unknown>>
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

  // ---- M7 切片 39：Office COM（Excel/Word 自动化） ----
  function needOffice(): NonNullable<SidecarLike['officeExcelOpen']> {
    const fn = client.officeExcelOpen
    if (!fn) throw new Error('当前 sidecar 不支持 Office COM（需新版 Python sidecar）')
    return fn.bind(client)
  }

  registry.register({
    id: 'officeExcelOpen',
    name: 'Excel 打开文件',
    group: 'Office',
    icon: 'file-spreadsheet',
    params: [
      { key: 'path', label: 'xlsx 路径', type: 'text' },
      { key: 'visible', label: '可见（true 显示 Excel 窗口）', type: 'text' },
      { key: 'engine', label: '引擎（excel/wps，默认 excel）', type: 'text' }
    ],
    summary: (p) => `Excel open ${str(p.path)}`,
    runner: async (ctx, p) => {
      const r = await (needOffice())(ctx.interpolate(str(p.path)), str(p.visible) === 'true')
      if (!r.ok) throw new Error('Excel 打开失败：' + (r.error ?? ''))
      ctx.log('success', `已打开 ${str(p.path)}，工作表：${(r.sheets as string[]).join(' ')}`)
      return r
    }
  })

  registry.register({
    id: 'officeExcelReadRange',
    name: 'Excel 读取区域',
    group: 'Office',
    icon: 'table',
    params: [
      { key: 'sheet', label: '工作表名', type: 'text', placeholder: 'Sheet1' },
      { key: 'range', label: '区域', type: 'text', placeholder: 'A1:C10' },
      { key: 'resultVar', label: '结果变量（二维数组）', type: 'text' }
    ],
    summary: (p) => `read ${str(p.sheet)}!${str(p.range)}`,
    runner: async (ctx, p) => {
      if (!client.officeExcelRead) throw new Error('sidecar 不支持 Office COM')
      const r = await client.officeExcelRead(ctx.interpolate(str(p.sheet)), ctx.interpolate(str(p.range)))
      if (!r.ok) throw new Error('Excel 读取失败：' + (r.error ?? ''))
      ctx.setVar(str(p.resultVar), r.values)
      return r.values
    }
  })

  registry.register({
    id: 'officeExcelWriteRange',
    name: 'Excel 写入区域',
    group: 'Office',
    icon: 'pencil',
    params: [
      { key: 'sheet', label: '工作表名', type: 'text' },
      { key: 'range', label: '起始区域', type: 'text', placeholder: 'A1' },
      { key: 'valuesJson', label: '二维数组 JSON', type: 'text', placeholder: '[[1,"a"],[2,"b"]]' }
    ],
    summary: (p) => `write ${str(p.sheet)}!${str(p.range)}`,
    runner: async (ctx, p) => {
      if (!client.officeExcelWrite) throw new Error('sidecar 不支持 Office COM')
      let values: unknown[][]
      try { values = JSON.parse(ctx.interpolate(str(p.valuesJson))) }
      catch { throw new Error('valuesJson 不是合法二维数组 JSON') }
      const r = await client.officeExcelWrite(
        ctx.interpolate(str(p.sheet)), ctx.interpolate(str(p.range)), values
      )
      if (!r.ok) throw new Error('Excel 写入失败：' + (r.error ?? ''))
      return r
    }
  })

  registry.register({
    id: 'officeExcelClose',
    name: 'Excel 关闭保存',
    group: 'Office',
    icon: 'x',
    params: [{ key: 'save', label: '保存（true/false）', type: 'text' }],
    summary: () => 'Excel close',
    runner: async (_ctx, p) => {
      if (!client.officeExcelClose) throw new Error('sidecar 不支持 Office COM')
      const r = await client.officeExcelClose(str(p.save) !== 'false')
      if (!r.ok) throw new Error('Excel 关闭失败：' + (r.error ?? ''))
      return true
    }
  })

  registry.register({
    id: 'officeWordOpen',
    name: 'Word 打开文档',
    group: 'Office',
    icon: 'file-text',
    params: [
      { key: 'path', label: 'docx 路径', type: 'text' },
      { key: 'visible', label: '可见', type: 'text' }
    ],
    summary: (p) => `Word open ${str(p.path)}`,
    runner: async (ctx, p) => {
      if (!client.officeWordOpen) throw new Error('sidecar 不支持 Office COM')
      const r = await client.officeWordOpen(ctx.interpolate(str(p.path)), str(p.visible) === 'true')
      if (!r.ok) throw new Error('Word 打开失败：' + (r.error ?? ''))
      return r
    }
  })

  registry.register({
    id: 'officeWordFindReplace',
    name: 'Word 全文替换',
    group: 'Office',
    icon: 'replace',
    params: [
      { key: 'find', label: '查找内容', type: 'text' },
      { key: 'replace', label: '替换为', type: 'text' }
    ],
    summary: (p) => `${str(p.find)} -> ${str(p.replace)}`,
    runner: async (ctx, p) => {
      if (!client.officeWordReplace) throw new Error('sidecar 不支持 Office COM')
      const r = await client.officeWordReplace(
        ctx.interpolate(str(p.find)), ctx.interpolate(str(p.replace))
      )
      if (!r.ok) throw new Error('Word 替换失败：' + (r.error ?? ''))
      return r
    }
  })

  registry.register({
    id: 'officeWordClose',
    name: 'Word 关闭保存',
    group: 'Office',
    icon: 'x',
    params: [{ key: 'save', label: '保存（true/false）', type: 'text' }],
    summary: () => 'Word close',
    runner: async (_ctx, p) => {
      if (!client.officeWordClose) throw new Error('sidecar 不支持 Office COM')
      const r = await client.officeWordClose(str(p.save) !== 'false')
      if (!r.ok) throw new Error('Word 关闭失败：' + (r.error ?? ''))
      return true
    }
  })

  registry.register({
    id: 'officeExcelMerge',
    name: 'Excel 合并单元格',
    group: 'Office',
    icon: 'grid',
    params: [
      { key: 'sheet', label: '工作表名', type: 'text' },
      { key: 'range', label: '区域', type: 'text', placeholder: 'A1:C1' }
    ],
    summary: (p) => `merge ${str(p.sheet)}!${str(p.range)}`,
    runner: async (ctx, p) => {
      if (!client.officeExcelMerge) throw new Error('sidecar 不支持 Office COM')
      const r = await client.officeExcelMerge(
        ctx.interpolate(str(p.sheet)), ctx.interpolate(str(p.range)))
      if (!r.ok) throw new Error('合并失败：' + (r.error ?? ''))
      return r
    }
  })

  registry.register({
    id: 'officeExcelRecalc',
    name: 'Excel 公式重算',
    group: 'Office',
    icon: 'refresh',
    params: [],
    summary: () => '强制重算公式',
    runner: async (ctx) => {
      if (!client.officeExcelRecalc) throw new Error('sidecar 不支持 Office COM')
      const r = await client.officeExcelRecalc()
      if (!r.ok) throw new Error('公式重算失败：' + (r.error ?? ''))
      ctx.log('success', '公式已重算')
      return r
    }
  })

  registry.register({
    id: 'officeExcelAddChart',
    name: 'Excel 插入图表',
    group: 'Office',
    icon: 'chart',
    params: [
      { key: 'sheet', label: '工作表名', type: 'text' },
      { key: 'chartType', label: '图表类型', type: 'select', options: [
        { value: 'column', label: '柱状图' },
        { value: 'bar', label: '条形图' },
        { value: 'line', label: '折线图' },
        { value: 'pie', label: '饼图' }
      ] },
      { key: 'source', label: '数据区域', type: 'text', placeholder: 'A1:B4' },
      { key: 'title', label: '图表标题', type: 'text' }
    ],
    summary: (p) => `${str(p.chartType)}图 ${str(p.source)}`,
    runner: async (ctx, p) => {
      if (!client.officeExcelAddChart) throw new Error('sidecar 不支持 Office COM')
      const r = await client.officeExcelAddChart({
        sheet: ctx.interpolate(str(p.sheet)),
        chartType: str(p.chartType),
        source: ctx.interpolate(str(p.source)),
        title: ctx.interpolate(str(p.title))
      })
      if (!r.ok) throw new Error('插入图表失败：' + (r.error ?? ''))
      ctx.log('success', `已插入${str(p.chartType)}图（${str(p.source)}）`)
      return r
    }
  })

  registry.register({
    id: 'officeExcelExportPdf',
    name: 'Excel 导出 PDF',
    group: 'Office',
    icon: 'file-text',
    params: [{ key: 'outPath', label: 'PDF 输出路径', type: 'text' }],
    summary: (p) => `excel -> ${str(p.outPath)}`,
    runner: async (ctx, p) => {
      if (!client.officeExcelExportPdf) throw new Error('sidecar 不支持 Office COM')
      const r = await client.officeExcelExportPdf(ctx.interpolate(str(p.outPath)))
      if (!r.ok) throw new Error('导出 PDF 失败：' + (r.error ?? ''))
      return r
    }
  })

  registry.register({
    id: 'officeWordExportPdf',
    name: 'Word 导出 PDF',
    group: 'Office',
    icon: 'file-text',
    params: [{ key: 'outPath', label: 'PDF 输出路径', type: 'text' }],
    summary: (p) => `word -> ${str(p.outPath)}`,
    runner: async (ctx, p) => {
      if (!client.officeWordExportPdf) throw new Error('sidecar 不支持 Office COM')
      const r = await client.officeWordExportPdf(ctx.interpolate(str(p.outPath)))
      if (!r.ok) throw new Error('导出 PDF 失败：' + (r.error ?? ''))
      return r
    }
  })
}
