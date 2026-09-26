/**
 * 系统级指令（M7 切片 10）：剪贴板 / 对话框 / 等待 / 提示音。
 *
 * 全部基于 Electron 内置能力（clipboard / dialog / shell.beep），零新 npm 依赖。
 * 为便于 vitest（node 环境无 Electron），把"系统能力"抽象成 SystemLike，
 * 默认实现懒加载 electron；测试注入 stub。
 *
 * 清单（8 条）：
 *  clipboardCopy / clipboardPaste
 *  showInfo / showError / showConfirm
 *  showOpenFile / showSaveFile
 *  sleep / beep
 */

import type { RegisteredCommand } from './registry'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

/** 系统能力抽象（测试可 stub） */
export interface SystemLike {
  clipboardReadText(): string
  clipboardWriteText(text: string): void
  /** 信息/错误对话框，返回点击的按钮索引（一般为 0） */
  showMessageBox(opts: { type: 'info' | 'error'; title: string; message: string }): Promise<number>
  /** 确认框，返回 true=确定 false=取消 */
  showConfirm(opts: { title: string; message: string }): Promise<boolean>
  showOpenFile(opts: { title: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>
  showSaveFile(opts: { title: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null>
  beep(): void
}

/** 默认实现：懒加载 electron。不在顶层 import，避免 vitest 环境崩。 */
function defaultSystem(): SystemLike {
  return {
    clipboardReadText: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { clipboard } = require('electron') as any
      return clipboard.readText()
    },
    clipboardWriteText: (t) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { clipboard } = require('electron') as any
      clipboard.writeText(t)
    },
    showMessageBox: async (opts) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { dialog } = require('electron') as any
      const r = await dialog.showMessageBox({ type: opts.type, title: opts.title, message: opts.message })
      return r.response
    },
    showConfirm: async (opts) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { dialog } = require('electron') as any
      const r = await dialog.showMessageBox({
        type: 'question',
        title: opts.title,
        message: opts.message,
        buttons: ['确定', '取消'],
        defaultId: 0,
        cancelId: 1
      })
      return r.response === 0
    },
    showOpenFile: async (opts) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { dialog } = require('electron') as any
      const r = await dialog.showOpenDialog({ title: opts.title, properties: ['openFile'], filters: opts.filters })
      return r.canceled ? null : r.filePaths[0] ?? null
    },
    showSaveFile: async (opts) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { dialog } = require('electron') as any
      const r = await dialog.showSaveDialog({ title: opts.title, defaultPath: opts.defaultPath, filters: opts.filters })
      return r.canceled ? null : r.filePath
    },
    beep: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { shell } = require('electron') as any
      shell.beep()
    }
  }
}

export interface SystemCommandsDeps {
  system?: SystemLike
}

export function registerSystemCommands(
  registry: RegistryLike,
  deps: SystemCommandsDeps = {}
): void {
  const sys: SystemLike = deps.system ?? defaultSystem()

  // ---------- 剪贴板 ----------

  registry.register({
    id: 'clipboardCopy',
    name: '复制到剪贴板',
    group: '系统',
    icon: 'copy',
    params: [{ key: 'text', label: '文本内容', type: 'text' }],
    summary: (p) => `复制 ${str(p.text)}`,
    runner: async (ctx, p) => {
      const text = ctx.interpolate(str(p.text))
      sys.clipboardWriteText(text)
      ctx.log('success', `已复制到剪贴板（${text.length} 字符）`)
      return text
    }
  })

  registry.register({
    id: 'clipboardPaste',
    name: '从剪贴板粘贴',
    group: '系统',
    icon: 'clipboard',
    params: [{ key: 'resultVar', label: '结果变量', type: 'text' }],
    summary: (p) => `粘贴 → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const resultVar = str(p.resultVar)
      const text = sys.clipboardReadText()
      ctx.setVar(resultVar, text)
      ctx.log('info', `已读剪贴板（${text.length} 字符）→ ${resultVar}`)
      return text
    }
  })

  // ---------- 对话框 ----------

  registry.register({
    id: 'showInfo',
    name: '提示信息框',
    group: '系统',
    icon: 'info',
    params: [
      { key: 'title', label: '标题', type: 'text' },
      { key: 'message', label: '内容', type: 'text' }
    ],
    summary: (p) => `ℹ ${str(p.title)}`,
    runner: async (ctx, p) => {
      const title = ctx.interpolate(str(p.title))
      const message = ctx.interpolate(str(p.message))
      await sys.showMessageBox({ type: 'info', title, message })
      return true
    }
  })

  registry.register({
    id: 'showError',
    name: '错误提示框',
    group: '系统',
    icon: 'warning',
    params: [
      { key: 'title', label: '标题', type: 'text', default: '出错了' },
      { key: 'message', label: '内容', type: 'text' }
    ],
    summary: (p) => `⚠ ${str(p.title)}`,
    runner: async (ctx, p) => {
      const title = ctx.interpolate(str(p.title))
      const message = ctx.interpolate(str(p.message))
      await sys.showMessageBox({ type: 'error', title, message })
      return false
    }
  })

  registry.register({
    id: 'showConfirm',
    name: '确认对话框',
    group: '系统',
    icon: 'help',
    params: [
      { key: 'title', label: '标题', type: 'text', default: '确认' },
      { key: 'message', label: '内容', type: 'text' },
      { key: 'resultVar', label: '结果变量（true/false）', type: 'text' }
    ],
    summary: (p) => `❓ ${str(p.message)}`,
    runner: async (ctx, p) => {
      const title = ctx.interpolate(str(p.title))
      const message = ctx.interpolate(str(p.message))
      const resultVar = str(p.resultVar)
      const ok = await sys.showConfirm({ title, message })
      ctx.setVar(resultVar, ok)
      return ok
    }
  })

  registry.register({
    id: 'showOpenFile',
    name: '选择文件',
    group: '系统',
    icon: 'folder-open',
    params: [
      { key: 'title', label: '对话框标题', type: 'text', default: '选择文件' },
      { key: 'resultVar', label: '结果变量（路径）', type: 'text' }
    ],
    summary: (p) => `打开文件 → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const title = ctx.interpolate(str(p.title))
      const resultVar = str(p.resultVar)
      const path = await sys.showOpenFile({ title })
      ctx.setVar(resultVar, path ?? '')
      return path
    }
  })

  registry.register({
    id: 'showSaveFile',
    name: '保存文件',
    group: '系统',
    icon: 'save',
    params: [
      { key: 'title', label: '对话框标题', type: 'text', default: '保存文件' },
      { key: 'defaultName', label: '默认文件名', type: 'text' },
      { key: 'resultVar', label: '结果变量（路径）', type: 'text' }
    ],
    summary: (p) => `保存 → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const title = ctx.interpolate(str(p.title))
      const defaultName = ctx.interpolate(str(p.defaultName))
      const resultVar = str(p.resultVar)
      const path = await sys.showSaveFile({ title, defaultPath: defaultName || undefined })
      ctx.setVar(resultVar, path ?? '')
      return path
    }
  })

  // ---------- 等待 / 提示音 ----------

  registry.register({
    id: 'sleep',
    name: '等待',
    group: '系统',
    icon: 'clock',
    params: [{ key: 'ms', label: '毫秒', type: 'number', default: 1000 }],
    summary: (p) => `等待 ${str(p.ms)} ms`,
    runner: async (_ctx, p) => {
      const ms = Number(p.ms ?? 1000)
      await new Promise((r) => setTimeout(r, ms))
      return ms
    }
  })

  registry.register({
    id: 'beep',
    name: '系统提示音',
    group: '系统',
    icon: 'bell',
    params: [],
    summary: () => '叮',
    runner: async (ctx) => {
      sys.beep()
      ctx.log('info', '已播放系统提示音')
      return true
    }
  })
}
