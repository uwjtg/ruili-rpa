/**
 * 网页自动化指令扩展（M7 切片 21）：基于已有 WebSession。
 *
 * 清单（9 条）：
 *  webGetTitle     取当前页标题
 *  webGetUrl       取当前页 URL
 *  webEval         执行 JS 并返回结果
 *  webGoBack       浏览器后退
 *  webGoForward    浏览器前进
 *  webRefresh      刷新页面
 *  webCheckElement 检查元素是否存在（true/false）
 *  webClearInput   清空输入框
 *  webSelectOption 选择下拉框选项（eval 实现）
 */

import type { RegisteredCommand } from '../commands/registry'
import type { WebSession } from './session'
import { getWebSession } from './session'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

export interface WebExtraDeps {
  session?: WebSession
}

export function registerWebExtraCommands(
  registry: RegistryLike,
  deps: WebExtraDeps = {}
): void {
  const session = deps.session ?? getWebSession()

  registry.register({
    id: 'webGetTitle',
    name: '取页面标题',
    group: '网页',
    icon: 'tag',
    params: [{ key: 'resultVar', label: '结果变量', type: 'text' }],
    summary: (p) => `title → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const title = await session.getTitle()
      ctx.setVar(str(p.resultVar), title)
      return title
    }
  })

  registry.register({
    id: 'webGetUrl',
    name: '取当前 URL',
    group: '网页',
    icon: 'link',
    params: [{ key: 'resultVar', label: '结果变量', type: 'text' }],
    summary: (p) => `url → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const url = await session.eval('() => location.href', undefined)
      const out = String(url ?? '')
      ctx.setVar(str(p.resultVar), out)
      return out
    }
  })

  registry.register({
    id: 'webEval',
    name: '执行 JavaScript',
    group: '网页',
    icon: 'code',
    params: [
      { key: 'fnBody', label: 'JS 函数体（return 表达式）', type: 'text', placeholder: '() => document.title' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    summary: (p) => `eval(...) → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const fn = ctx.interpolate(str(p.fnBody))
      const out = await session.eval(fn, undefined)
      ctx.setVar(str(p.resultVar), out)
      return out
    }
  })

  registry.register({
    id: 'webGoBack',
    name: '浏览器后退',
    group: '网页',
    icon: 'arrow-left',
    params: [],
    summary: () => 'back',
    runner: async () => {
      await session.eval('() => history.back()', undefined)
      return true
    }
  })

  registry.register({
    id: 'webGoForward',
    name: '浏览器前进',
    group: '网页',
    icon: 'arrow-right',
    params: [],
    summary: () => 'forward',
    runner: async () => {
      await session.eval('() => history.forward()', undefined)
      return true
    }
  })

  registry.register({
    id: 'webRefresh',
    name: '刷新页面',
    group: '网页',
    icon: 'refresh',
    params: [],
    summary: () => 'refresh',
    runner: async () => {
      await session.eval('() => location.reload()', undefined)
      return true
    }
  })

  registry.register({
    id: 'webCheckElement',
    name: '检查元素是否存在',
    group: '网页',
    icon: 'search',
    params: [
      { key: 'selector', label: '选择器', type: 'text' },
      { key: 'resultVar', label: '结果变量（true/false）', type: 'text' }
    ],
    summary: (p) => `exists(${str(p.selector)})`,
    runner: async (ctx, p) => {
      const selector = ctx.interpolate(str(p.selector))
      const out = await session.eval(`(sel) => !!document.querySelector(sel)`, selector)
      const bool = Boolean(out)
      ctx.setVar(str(p.resultVar), bool)
      return bool
    }
  })

  registry.register({
    id: 'webClearInput',
    name: '清空输入框',
    group: '网页',
    icon: 'edit',
    params: [{ key: 'selector', label: '选择器', type: 'text' }],
    summary: (p) => `clear(${str(p.selector)})`,
    runner: async (ctx, p) => {
      const selector = ctx.interpolate(str(p.selector))
      await session.fill(selector, '')
      return true
    }
  })

  registry.register({
    id: 'webSelectOption',
    name: '选择下拉框选项',
    group: '网页',
    icon: 'chevron-down',
    params: [
      { key: 'selector', label: 'select 选择器', type: 'text' },
      { key: 'value', label: '选项 value', type: 'text' }
    ],
    summary: (p) => `select ${str(p.value)}`,
    runner: async (ctx, p) => {
      const selector = ctx.interpolate(str(p.selector))
      const value = ctx.interpolate(str(p.value))
      await session.eval(
        `(args) => { const s = document.querySelector(args.sel); if (s) { s.value = args.v; s.dispatchEvent(new Event('change', {bubbles:true})) } }`,
        { sel: selector, v: value }
      )
      return true
    }
  })
}
