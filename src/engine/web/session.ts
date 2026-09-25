/**
 * 网页会话抽象（阶段 3 · 真实链路 POC）。
 *
 * 设计：
 *  - `WebSession` 是一个薄接口，引擎指令依赖它而非直接依赖 playwright-core，
 *    便于在 vitest 里注入假会话（不在 CI 里真起浏览器）。
 *  - `RealWebSession` 用 playwright-core 的 `launchPersistentContext` 附加到
 *    真实 Chrome/Edge（独立 userDataDir profile，见计划书 B4：独立 profile 启动，
 *    目标站需重新登录）。channel 按 msedge → chrome → 系统默认 Chromium 回退。
 *  - 模块级单例 `defaultSession`；POC 脚本与指令共用同一个浏览器实例。
 */

import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { CSS_PATH_FN, PICK_START_FN, PICK_READ_FN } from '../../shared/scrape/pick-script'
import { REC_START_FN, REC_STOP_FN, type WebRecordEvent } from '../../shared/scrape/record-script'

/** 浏览器会话接口（指令只依赖此接口） */
export interface WebSession {
  /** 启动浏览器（幂等：已启动则直接返回） */
  start(): Promise<void>
  /** 打开 URL（新开一个标签页） */
  goto(url: string): Promise<void>
  /** 点击选择器 */
  click(selector: string): Promise<void>
  /** 在选择器处输入文本 */
  fill(selector: string, value: string): Promise<void>
  /** 鼠标滚轮滚动（M4-5）：deltaY 正向下负向上 */
  scroll(deltaY: number): Promise<void>
  /** 读取选择器的可见文本 */
  getText(selector: string): Promise<string>
  /** 当前页标题 */
  getTitle(): Promise<string>
  /** 等待选择器可见（超时抛错；Playwright auto-waiting 之外的显式等待） */
  waitFor(selector: string, timeoutMs: number): Promise<void>
  /**
   * 在当前页面上下文里执行一段自包含函数体（M4 切片 1 数据抓取）。
   * fnBody 形如 `function myFn(arg){…return x}`；生产由 Playwright
   * Runtime.callFunctionOn 注入页面（不受页面 CSP 影响），返回值可 JSON 序列化。
   */
  eval(fnBody: string, arg: unknown): Promise<unknown>
  /**
   * 进入浏览器页面拾取模式（M4 切片 3）：注入高亮/监听脚本，阻塞等用户点击或 Esc。
   * 返回选中元素的 CSS 路径；cancelled=true 表示用户按 Esc 取消。
   */
  startPagePick(timeoutMs?: number): Promise<{
    selector?: string
    tag?: string
    text?: string
    cancelled?: boolean
  }>
  /** 开始录制页面操作（M4 切片 4）：注入 mousedown/input 监听 */
  startWebRecord(): Promise<void>
  /** 停止录制并返回事件数组 */
  stopWebRecord(): Promise<WebRecordEvent[]>
  /** 关闭浏览器 */
  close(): Promise<void>
  /** 是否已启动 */
  isRunning(): boolean
}

export interface RealWebSessionOptions {
  /** 浏览器 channel 覆盖；默认按 msedge→chrome→auto 自动探测 */
  channel?: string
  /** 独立 profile 目录；默认 <repo>/.runtime/web-profile */
  userDataDir?: string
  /** 是否有头（默认无头，CI/POC 稳定） */
  headless?: boolean
}

const DEFAULT_PROFILE_DIR = resolve(process.cwd(), '.runtime', 'web-profile')

export class RealWebSession implements WebSession {
  private context: BrowserContext | null = null
  private page: Page | null = null
  /** 录制中标志：导航后自动重注入 */
  private recording = false
  /** framenavigated 监听句柄（防重复挂） */
  private navHandler: (() => void) | null = null
  private readonly channel?: string
  private readonly userDataDir: string
  private readonly headless: boolean

  constructor(opts: RealWebSessionOptions = {}) {
    this.channel = opts.channel
    this.userDataDir = opts.userDataDir ?? DEFAULT_PROFILE_DIR
    this.headless = opts.headless ?? true
  }

  isRunning(): boolean {
    return this.context !== null
  }

  async start(): Promise<void> {
    if (this.context) return
    if (!existsSync(this.userDataDir)) mkdirSync(this.userDataDir, { recursive: true })

    const channels = this.channel
      ? [this.channel]
      : (['msedge', 'chrome'] as const)

    let lastErr: unknown = null
    for (const ch of channels) {
      try {
        this.context = await chromium.launchPersistentContext(this.userDataDir, {
          channel: ch,
          headless: this.headless,
          args: ['--no-first-run', '--no-default-browser-check']
        })
        this.page = this.context.pages()[0] ?? (await this.context.newPage())
        return
      } catch (e) {
        lastErr = e
      }
    }
    // 最后兜底：不带 channel（playwright-core 期望自带 chromium，没有则报错信息清晰）
    try {
      this.context = await chromium.launchPersistentContext(this.userDataDir, {
        headless: this.headless,
        args: ['--no-first-run', '--no-default-browser-check']
      })
      this.page = this.context.pages()[0] ?? (await this.context.newPage())
      return
    } catch (e) {
      throw new Error(
        `无法启动浏览器（已尝试 ${channels.join('/')} 及默认）：${
          lastErr instanceof Error ? lastErr.message : String(lastErr)
        }；最后一次错误：${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  private requirePage(): Page {
    if (!this.page || !this.context) {
      throw new Error('浏览器未启动，请先执行「打开浏览器」')
    }
    return this.page
  }

  async goto(url: string): Promise<void> {
    await this.start()
    await this.requirePage().goto(url, { waitUntil: 'domcontentloaded' })
  }

  async click(selector: string): Promise<void> {
    await this.requirePage().click(selector)
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.requirePage().fill(selector, value)
  }

  async scroll(deltaY: number): Promise<void> {
    await this.requirePage().mouse.wheel(0, deltaY)
  }

  async getText(selector: string): Promise<string> {
    return (await this.requirePage().locator(selector).first().textContent()) ?? ''
  }

  async getTitle(): Promise<string> {
    return await this.requirePage().title()
  }

  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    await this.requirePage()
      .locator(selector)
      .first()
      .waitFor({ state: 'visible', timeout: timeoutMs })
  }

  async eval(fnBody: string, arg: unknown): Promise<unknown> {
    // 包成函数对象交给 Playwright：内部用 Runtime.callFunctionOn，
    // 不受目标页面 CSP / 全局污染影响。fnBody 必须自包含（不闭包外部变量）。
    const fn = new Function(
      'arg',
      `"use strict"; return (${fnBody})(arg)`
    ) as (arg: unknown) => unknown
    return await this.requirePage().evaluate(fn, arg)
  }

  async startPagePick(timeoutMs = 120000): Promise<{
    selector?: string
    tag?: string
    text?: string
    cancelled?: boolean
  }> {
    const page = this.requirePage()
    // 三段函数拼一起包成函数对象注入（同作用域可调 cssPathOf/startPagePick）
    const injector = new Function(
      `"use strict";\n${CSS_PATH_FN}\n${PICK_START_FN}\nstartPagePick();`
    )
    await page.evaluate(injector as unknown as () => void)
    await page.waitForFunction('window.__ruiliPickDone === true', null, {
      timeout: timeoutMs
    })
    const reader = new Function(`"use strict"; return (${PICK_READ_FN})();`) as () => {
      cancelled: boolean
      result: { selector: string; tag: string; text: string } | null
    }
    const r = await page.evaluate(reader)
    if (r.cancelled || !r.result) return { cancelled: true }
    return {
      selector: r.result.selector,
      tag: r.result.tag,
      text: r.result.text,
      cancelled: false
    }
  }

  async startWebRecord(): Promise<void> {
    const page = this.requirePage()
    const injector = () => new Function(
      '"use strict";\n' + CSS_PATH_FN + '\n' + REC_START_FN + '\nstartWebRecord();'
    ) as unknown as () => void
    await page.evaluate(injector())
    // 导航后自动重注入（SPA/多页跳转场景）
    this.recording = true
    this.navHandler = () => {
      if (!this.recording || !this.page) return
      this.page.evaluate(injector()).catch(() => undefined)
    }
    page.on('framenavigated', this.navHandler)
  }

  async stopWebRecord(): Promise<WebRecordEvent[]> {
    const page = this.requirePage()
    if (this.navHandler) {
      page.off('framenavigated', this.navHandler)
      this.navHandler = null
    }
    this.recording = false
    const reader = new Function(
      '"use strict"; return (' + REC_STOP_FN + ')();'
    ) as () => WebRecordEvent[]
    return (await page.evaluate(reader as unknown as () => WebRecordEvent[])) || []
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => undefined)
    }
    this.context = null
    this.page = null
  }
}

/** 模块级默认会话（POC 脚本与指令共用） */
let defaultSession: WebSession = new RealWebSession()

export function getWebSession(): WebSession {
  return defaultSession
}

/** 测试注入假会话；生产/POC 不传参即用真实会话 */
export function setWebSessionForTesting(session: WebSession): void {
  defaultSession = session
}
