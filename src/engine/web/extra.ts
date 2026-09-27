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
import { buildFallbackSelectors, type ElementFeatures } from '../../shared/scrape/fallback'
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

  // 选择器回退链（M7-36）：点选录制存的特征包，回放按 id->testid->aria->... 顺序定位
  registry.register({
    id: 'webClickSmart',
    name: '智能点击（回退链）',
    group: '网页',
    icon: 'mouse-pointer',
    params: [
      {
        key: 'featuresJson',
        label: '元素特征 JSON（点选录制产物）',
        type: 'text',
        placeholder: '{"id":"loginBtn","ariaLabel":"登录",...}'
      },
      { key: 'cssPath', label: '兜底 CSS 路径', type: 'text', placeholder: 'div.box > button' }
    ],
    summary: (p) => `smart click ${str(p.cssPath)}`,
    runner: async (ctx, p) => {
      const raw = ctx.interpolate(str(p.featuresJson))
      let feats: ElementFeatures = {}
      if (raw.trim()) {
        try { feats = JSON.parse(raw) as ElementFeatures } catch { throw new Error('featuresJson 不是合法 JSON') }
      }
      const cssPath = ctx.interpolate(str(p.cssPath))
      if (cssPath) feats.cssPath = cssPath
      const candidates = buildFallbackSelectors(feats)
      if (candidates.length === 0) throw new Error('没有可用的元素特征，请至少填 cssPath')
      const hit = await session.locateFirst(candidates)
      if (!hit) throw new Error('回退链全部未命中：' + candidates.join(' | '))
      ctx.log('info', `回退链命中：${hit}（共试 ${candidates.length} 个候选）`)
      await session.click(hit)
      return { ok: true, used: hit, tried: candidates.length }
    }
  })

  registry.register({
    id: 'webInputSmart',
    name: '智能输入（回退链）',
    group: '网页',
    icon: 'edit-3',
    params: [
      { key: 'featuresJson', label: '元素特征 JSON', type: 'text' },
      { key: 'cssPath', label: '兜底 CSS 路径', type: 'text' },
      { key: 'value', label: '要输入的内容', type: 'text' }
    ],
    summary: (p) => `smart input ${str(p.cssPath)}`,
    runner: async (ctx, p) => {
      const raw = ctx.interpolate(str(p.featuresJson))
      let feats = {} as any
      if (raw.trim()) {
        try { feats = JSON.parse(raw) } catch { throw new Error('featuresJson 不是合法 JSON') }
      }
      const cssPath = ctx.interpolate(str(p.cssPath))
      if (cssPath) feats.cssPath = cssPath
      const candidates = buildFallbackSelectors(feats)
      if (candidates.length === 0) throw new Error('没有可用的元素特征')
      const hit = await session.locateFirst(candidates)
      if (!hit) throw new Error('回退链全部未命中：' + candidates.join(' | '))
      await session.fill(hit, ctx.interpolate(str(p.value)))
      return { ok: true, used: hit }
    }
  })

  // 相对位置锚点：在 anchor 所在行/容器内，点含某文本的可点元素（常见"这一行的删除/编辑按钮"）
  registry.register({
    id: 'webClickRelative',
    name: '相对位置点击（行内锚点）',
    group: '网页',
    icon: 'crosshair',
    params: [
      { key: 'anchorSelector', label: '锚点选择器（如某行单元格）', type: 'text', placeholder: 'td.order-no' },
      { key: 'relativeText', label: '同行要点击的元素文本', type: 'text', placeholder: '删除' }
    ],
    summary: (p) => `row click "${str(p.relativeText)}" near ${str(p.anchorSelector)}`,
    runner: async (ctx, p) => {
      const anchor = ctx.interpolate(str(p.anchorSelector))
      const rel = ctx.interpolate(str(p.relativeText))
      const out = await session.eval(
        `(args) => {
          const a = document.querySelector(args.anchor);
          if (!a) return { ok: false, reason: 'anchor 未命中' };
          let scope = a;
          for (let i = 0; i < 3 && scope.parentElement; i++) scope = scope.parentElement;
          const cands = Array.from(scope.querySelectorAll('button,a,[role=button],.btn,[onclick]'));
          const hit = cands.find((el) => (el.textContent || '').indexOf(args.rel) >= 0);
          if (!hit) return { ok: false, reason: '行内未找到含文本的可点元素' };
          hit.scrollIntoView({ block: 'center' });
          hit.click();
          return { ok: true, text: (hit.textContent || '').trim().slice(0, 30) };
        }`,
        { anchor, rel }
      )
      if (!out || !(out as any).ok) throw new Error('相对位置点击失败：' + ((out as any)?.reason ?? '未知'))
      return out
    }
  })
}
