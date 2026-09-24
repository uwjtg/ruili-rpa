/**
 * 网页自动化指令（阶段 3 · 真实链路）。
 *
 * 通过 WebSession 抽象调用真实浏览器（Playwright CDP）。
 * 单测时注入假会话，不在 CI 里真起浏览器。
 *
 * 指令清单：
 *  1. webOpenBrowser   打开浏览器（独立 profile）
 *  2. webOpenUrl       打开网址
 *  3. webClick         点击元素
 *  4. webInput         输入文本
 *  5. webExtractText   提取元素文本 → 变量
 *  6. webCloseBrowser   关闭浏览器
 */

import type { RegisteredCommand } from '../commands/registry'
import { getWebSession, type WebSession } from './session'
import { SCRAPE_FN_BODY } from '../../shared/scrape/page-script'
import type { ScrapeFieldSpec } from '../../shared/scrape/spec'
import { writeFile } from 'node:fs/promises'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

/** CSV 单元格转义（含逗号/引号/换行则双引号包裹，引号双写） */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

/** dict 数组 → UTF-8 BOM CSV（Excel 双击不乱码） */
function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const lines = [headers.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(','))
  }
  // BOM + CRLF（Excel 友好）
  return '\uFEFF' + lines.join('\r\n')
}

export interface WebCommandsDeps {
  session?: WebSession
}

export function registerWebCommands(
  registry: RegistryLike,
  deps: WebCommandsDeps = {}
): void {
  const session = deps.session ?? getWebSession()

  registry.register({
    id: 'webOpenBrowser',
    name: '打开浏览器',
    group: '网页',
    icon: 'globe',
    params: [
      {
        key: 'channel',
        label: '浏览器',
        type: 'select',
        default: 'auto',
        options: [
          { value: 'auto', label: '自动（Edge/Chrome）' },
          { value: 'msedge', label: 'Edge' },
          { value: 'chrome', label: 'Chrome' }
        ]
      }
    ],
    summary: () => '打开浏览器（独立 profile）',
    runner: async (ctx, p) => {
      const channel = str(p.channel, 'auto')
      ctx.log('info', `启动浏览器（channel=${channel}）…`)
      // start() 内部已处理 channel 回退；这里直接 start
      await session.start()
      ctx.log('success', '浏览器已启动')
      return true
    }
  })

  registry.register({
    id: 'webOpenUrl',
    name: '打开网址',
    group: '网页',
    icon: 'globe',
    params: [
      { key: 'url', label: '网址', type: 'text', placeholder: 'https://… 支持 ${变量}' },
      { key: 'titleVar', label: '标题存入变量（可选）', type: 'text' }
    ],
    summary: (p) => `打开 ${str(p.url)}`,
    runner: async (ctx, p) => {
      const url = ctx.interpolate(str(p.url))
      ctx.log('info', `打开 ${url}`)
      await session.goto(url)
      const title = await session.getTitle()
      ctx.log('success', `页面加载完成，标题：${title || '（无）'}`)
      const titleVar = str(p.titleVar)
      if (titleVar) ctx.setVar(titleVar, title)
      return title
    }
  })

  registry.register({
    id: 'webClick',
    name: '点击元素',
    group: '网页',
    icon: 'mouse',
    params: [{ key: 'selector', label: '选择器', type: 'text', placeholder: 'CSS / text=…' }],
    summary: (p) => `点击 ${str(p.selector)}`,
    runner: async (ctx, p) => {
      const selector = ctx.interpolate(str(p.selector))
      await session.click(selector)
      ctx.log('success', `已点击 ${selector}`)
      return true
    }
  })

  registry.register({
    id: 'webInput',
    name: '输入文本',
    group: '网页',
    icon: 'keyboard',
    params: [
      { key: 'selector', label: '选择器', type: 'text' },
      { key: 'value', label: '内容', type: 'text', placeholder: '支持 ${变量} 插值' }
    ],
    summary: (p) => `输入 ${str(p.value)} → ${str(p.selector)}`,
    runner: async (ctx, p) => {
      const selector = ctx.interpolate(str(p.selector))
      const value = ctx.interpolate(str(p.value))
      await session.fill(selector, value)
      ctx.log('success', `已在 ${selector} 输入文本`)
      return true
    }
  })

  registry.register({
    id: 'webExtractText',
    name: '提取元素文本',
    group: '网页',
    icon: 'scissors',
    params: [
      { key: 'selector', label: '选择器', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    summary: (p) => `提取 ${str(p.selector)} → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const selector = ctx.interpolate(str(p.selector))
      const resultVar = str(p.resultVar)
      const text = await session.getText(selector)
      ctx.setVar(resultVar, text)
      ctx.log('success', `提取文本（${text.length} 字）→ ${resultVar}`)
      return text
    }
  })

  registry.register({
    id: 'webWaitFor',
    name: '等待元素出现',
    group: '网页',
    icon: 'clock',
    params: [
      { key: 'selector', label: '选择器', type: 'text' },
      { key: 'timeoutMs', label: '超时（毫秒）', type: 'number', default: 5000 }
    ],
    summary: (p) => `等待 ${str(p.selector, '…')} 出现（${str(p.timeoutMs, '5000')}ms）`,
    runner: async (ctx, p) => {
      const selector = ctx.interpolate(str(p.selector))
      const timeoutMs = Number(p.timeoutMs) || 5000
      await session.waitFor(selector, timeoutMs)
      ctx.log('success', `元素 ${selector} 已出现`)
      return true
    }
  })

  registry.register({
    id: 'webScrapeList',
    name: '抓取列表数据',
    group: '网页',
    icon: 'scissors',
    params: [
      { key: 'listSelector', label: '列表项选择器', type: 'text', placeholder: '如 .product-card（向导生成）' },
      {
        key: 'fieldsJson',
        label: '字段映射 JSON',
        type: 'text',
        placeholder: '[{"name":"标题","subSelector":".title"}]'
      },
      { key: 'resultVar', label: '结果变量', type: 'text', default: 'rows' },
      { key: 'maxItems', label: '最多抓取条数（0=不限）', type: 'number', default: 0 },
      { key: 'csvPath', label: '导出 CSV 路径（可选）', type: 'text', placeholder: '如 D:\\out.csv，支持 ${变量}' }
    ],
    summary: (p) => `抓取 ${str(p.listSelector, '…')} → ${str(p.resultVar, 'rows')}`,
    runner: async (ctx, p) => {
      const listSelector = ctx.interpolate(str(p.listSelector))
      const resultVar = str(p.resultVar, 'rows')
      const maxItems = Number(p.maxItems) || 0
      const csvPath = ctx.interpolate(str(p.csvPath)).trim()

      let fields: ScrapeFieldSpec[] = []
      try {
        fields = JSON.parse(str(p.fieldsJson))
        if (!Array.isArray(fields) || fields.length === 0) {
          throw new Error('fieldsJson 必须是非空数组')
        }
      } catch (e) {
        throw new Error(`字段映射 JSON 解析失败：${e instanceof Error ? e.message : String(e)}`)
      }

      ctx.log('info', `开始抓取 ${listSelector}（${fields.length} 个字段）…`)
      const rows = (await session.eval(SCRAPE_FN_BODY, {
        listSelector,
        fields,
        maxItems
      })) as Array<Record<string, unknown>>

      if (!Array.isArray(rows)) throw new Error('页面抓取返回格式异常（非数组）')
      ctx.setVar(resultVar, rows)
      ctx.log('success', `抓取完成：${rows.length} 行 → 变量 ${resultVar}`)

      if (csvPath) {
        const headers = fields.map((f) => f.name)
        await writeFile(csvPath, toCsv(rows, headers), 'utf8')
        ctx.log('success', `已导出 CSV（${rows.length} 行）→ ${csvPath}`)
      }
      return rows
    }
  })

  registry.register({
    id: 'webCloseBrowser',
    name: '关闭浏览器',
    group: '网页',
    icon: 'power',
    params: [],
    summary: () => '关闭浏览器',
    runner: async (ctx) => {
      await session.close()
      ctx.log('success', '浏览器已关闭')
      return true
    }
  })
}
