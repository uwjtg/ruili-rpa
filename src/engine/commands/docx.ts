/**
 * Word (.docx) 文档生成指令（M7 切片 17）：基于 docx 库。
 *
 * 清单（2 条）：
 *  docxCreateText   新建文档：标题 + 多行段落
 *  docxCreateTable  新建文档：表格（二维数组或对象数组）
 *
 * docx 库一次性构建整个文档，不支持追加；要追加就读旧文档再改（暂不做）。
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from 'docx'
import * as fsp from 'node:fs/promises'
import path from 'node:path'
import type { RegisteredCommand } from './registry'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

export function registerDocxCommands(registry: RegistryLike): void {
  registry.register({
    id: 'docxCreateText',
    name: '新建 Word 文档（段落）',
    group: 'Word',
    icon: 'file-text',
    params: [
      { key: 'path', label: '保存路径', type: 'text' },
      { key: 'title', label: '标题（可空）', type: 'text' },
      { key: 'lines', label: '段落（每行一条，\n 分隔）', type: 'text' }
    ],
    summary: (p) => `Word → ${str(p.path)}`,
    runner: async (ctx, p) => {
      const outPath = ctx.interpolate(str(p.path))
      const title = ctx.interpolate(str(p.title))
      const lines = ctx.interpolate(str(p.lines)).split(/\r?\n/)
      const children: Paragraph[] = []
      if (title) {
        children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }))
      }
      for (const line of lines) {
        if (!line.trim()) continue
        children.push(new Paragraph({ children: [new TextRun(line)] }))
      }
      const doc = new Document({ sections: [{ children }] })
      const buf = await Packer.toBuffer(doc)
      await fsp.mkdir(path.dirname(outPath), { recursive: true })
      await fsp.writeFile(outPath, buf)
      ctx.log('success', `已生成 ${outPath}（${buf.length} 字节）`)
      return outPath
    }
  })

  registry.register({
    id: 'docxCreateTable',
    name: '新建 Word 文档（表格）',
    group: 'Word',
    icon: 'table',
    params: [
      { key: 'path', label: '保存路径', type: 'text' },
      { key: 'rowsVar', label: '二维数组变量', type: 'text' },
      { key: 'header', label: '首行是否表头', type: 'boolean', default: true }
    ],
    summary: (p) => `Word 表格 → ${str(p.path)}`,
    runner: async (ctx, p) => {
      const outPath = ctx.interpolate(str(p.path))
      const rows = ctx.getVar<unknown[][]>(str(p.rowsVar)) ?? []
      const header = p.header !== false
      const tableRows = rows.map((r, ri) => new TableRow({
        children: r.map((cell) => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: String(cell), bold: header && ri === 0 })] })]
        }))
      }))
      const doc = new Document({
        sections: [{
          children: [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows })]
        }]
      })
      const buf = await Packer.toBuffer(doc)
      await fsp.mkdir(path.dirname(outPath), { recursive: true })
      await fsp.writeFile(outPath, buf)
      ctx.log('success', `已生成 ${outPath}（${rows.length} 行）`)
      return outPath
    }
  })
}
