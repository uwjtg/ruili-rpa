/**
 * Python sidecar 客户端（阶段 3 POC）。
 *
 * 生命周期：
 *  1. start() 选一个本地空闲端口，spawn `python sidecar/server.py --port N`；
 *  2. 解析 stdout 握手行 `SIDECAR_READY port=N`；
 *  3. GET /health 确认能力（ocr / cv2 是否可用）；
 *  4. ocr() 等业务调用走 HTTP；
 *  5. stop() 杀子进程。
 *
 * 单测不真正 spawn Python：注入 fetch 或直接测试握手解析逻辑即可。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type {
  ClickElementReply,
  LocateElementReply,
  PickReply,
  PickStopReply,
  PickedElement
} from '../../shared/desktop-pick'
import type {
  RecordStartReply,
  RecordStopReply
} from '../../shared/desktop-record'
import type { RecordThresholds } from '../../shared/record-settings'

export interface SidecarHealth {
  ok: boolean
  version: string
  engines: { ocr: boolean; cv2: boolean }
}

export interface OcrResult {
  ok: boolean
  text: string
  lines: Array<{ text: string; score: number }>
}

/**
 * 解析 sidecar 运行时。
 * - 打包态（electron-builder extraResources）：用 resources/python 下自带的
 *   python.exe 与 app/server.py，装机机器无需另装 Python；
 * - 开发态：回退系统 PATH 的 python + 仓库 sidecar/server.py。
 */
function resolveSidecarRuntime(): { cmd: string; script: string } {
  const res = process.resourcesPath
  if (res) {
    const exe = join(res, 'python', 'python.exe')
    const script = join(res, 'python', 'app', 'server.py')
    if (existsSync(exe) && existsSync(script)) {
      return { cmd: exe, script }
    }
  }
  return { cmd: 'python', script: resolve(process.cwd(), 'sidecar', 'server.py') }
}

/** 选一个 127.0.0.1 上的空闲端口 */
function freePort(): Promise<number> {
  return new Promise((resolveP, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port
      srv.close(() => resolveP(port))
    })
  })
}

export class SidecarClient {
  private proc: ChildProcess | null = null
  private baseUrl = ''
  private pythonCmd = 'python'
  private scriptPath: string

  constructor(scriptPath?: string, pythonCmd?: string) {
    const rt = resolveSidecarRuntime()
    this.pythonCmd = pythonCmd ?? rt.cmd
    this.scriptPath = scriptPath ?? rt.script
  }

  isRunning(): boolean {
    return this.proc !== null && this.baseUrl !== ''
  }

  async start(timeoutMs = 15000): Promise<SidecarHealth> {
    if (this.isRunning()) return this.health()
    if (!existsSync(this.scriptPath)) {
      throw new Error(`sidecar 脚本不存在: ${this.scriptPath}`)
    }
    const port = await freePort()
    this.baseUrl = `http://127.0.0.1:${port}`

    const proc = spawn(this.pythonCmd, [this.scriptPath, '--port', String(port)], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.proc = proc

    // 收集 stderr（出错时便于诊断）
    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += String(d)))
    proc.on('exit', (code) => {
      if (this.baseUrl) {
        this.baseUrl = ''
      }
      this.proc = null
      if (code !== 0 && code !== null) {
        // 握手前退出
        throw new Error(`sidecar 意外退出 code=${code}: ${stderr.slice(-500)}`)
      }
    })

    // 等待握手行
    await new Promise<void>((resolveWait, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(`等待 sidecar 握手超时（${timeoutMs}ms）：${stderr.slice(-500)}`)
        )
      }, timeoutMs)
      proc.stdout.on('data', (chunk) => {
        if (String(chunk).includes('SIDECAR_READY')) {
          clearTimeout(timer)
          resolveWait()
        }
      })
    })

    return this.health()
  }

  async health(): Promise<SidecarHealth> {
    const res = await fetch(`${this.baseUrl}/health`)
    return (await res.json()) as SidecarHealth
  }

  async ocr(imagePath: string): Promise<OcrResult> {
    const res = await fetch(`${this.baseUrl}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_path: imagePath })
    })
    return (await res.json()) as OcrResult
  }

  /**
   * 阻塞进入桌面拾取模式（M3 切片 1）：sidecar 弹出全屏遮罩，用户移动鼠标
   * 高亮 UIA 控件、左键点击确认。等待直到点击 / Esc 取消 / 超时。
   */
  async pickStart(timeoutMs = 120_000): Promise<PickReply> {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
      const res = await fetch(`${this.baseUrl}/pick/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: ac.signal
      })
      return (await res.json()) as PickReply
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { ok: false as const, error: 'pick_timeout' }
      }
      return {
        ok: false as const,
        error: `sidecar 拾取请求失败：${e instanceof Error ? e.message : String(e)}`
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /** 取消进行中的桌面拾取 */
  async pickStop(): Promise<PickStopReply> {
    try {
      const res = await fetch(`${this.baseUrl}/pick/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      })
      return (await res.json()) as PickStopReply
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }

  /** pickElement 指令回放：按拾取结果重新定位 UIA 控件并点击中心（retries=回放稳定性重试次数，M3 切片 5） */
  async clickElement(
    target: PickedElement,
    retries?: number
  ): Promise<ClickElementReply> {
    try {
      const body: Record<string, unknown> = { target }
      if (typeof retries === 'number' && Number.isFinite(retries)) {
        body.retries = retries
      }
      const res = await fetch(`${this.baseUrl}/desktop/click_element`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      return (await res.json()) as ClickElementReply
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }

  /** 元素 dry-run：只定位不点击（元素库「校验」；M3 切片 3） */
  async locateElement(target: PickedElement): Promise<LocateElementReply> {
    try {
      const res = await fetch(`${this.baseUrl}/desktop/locate_element`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      })
      return (await res.json()) as LocateElementReply
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }

  /** 录制回放：typeText —— Unicode 逐字符输入到当前焦点窗口 */
  async typeText(text: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/desktop/type_text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      return (await res.json()) as { ok: boolean; error?: string }
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }

  /** 录制回放：scroll —— 在目标控件中心（或坐标）发送滚轮 delta */
  async scroll(opts: {
    target?: PickedElement | null
    x?: number
    y?: number
    delta: number
  }): Promise<{ ok: boolean; error?: string }> {    try {
      const res = await fetch(`${this.baseUrl}/desktop/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: opts.target ?? undefined,
          x: opts.x,
          y: opts.y,
          delta: opts.delta
        })
      })
      return (await res.json()) as { ok: boolean; error?: string }
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }

  /** 录制回放：pressKey —— 按下并释放一个按键/组合键（"Enter" / "Control+A"） */
  async pressKey(keys: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/desktop/press_key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys })
      })
      return (await res.json()) as { ok: boolean; error?: string }
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }

  /** 顶层窗口句柄 → 所属进程 PID（圈定录制范围用；M3 切片 6） */
  async windowPid(hwnd: number): Promise<{ ok: boolean; pid?: number; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/desktop/window_pid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hwnd })
      })
      return (await res.json()) as { ok: boolean; pid?: number }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** M7 切片 22：移动鼠标到屏幕坐标 */
  async moveMouse(x: number, y: number): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/desktop/move_mouse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y })
      })
      return (await res.json()) as { ok: boolean; error?: string }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** M7 切片 22：在屏幕坐标点击（button: left/right/middle；double 双击） */
  async clickCoords(opts: {
    x: number; y: number; button?: 'left' | 'right' | 'middle'; double?: boolean
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/desktop/click_coords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: opts.x, y: opts.y, button: opts.button ?? 'left', double: !!opts.double })
      })
      return (await res.json()) as { ok: boolean; error?: string }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** M7 切片 22：全屏截图保存为 PNG */
  async screenshot(path: string): Promise<{ ok: boolean; path?: string; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/desktop/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      })
      return (await res.json()) as { ok: boolean; path?: string; error?: string }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  /** M7 切片 22：当前前台窗口信息 */
  async foregroundWindow(): Promise<{
    ok: boolean; hwnd?: number; title?: string; pid?: number;
    rect?: { left: number; top: number; right: number; bottom: number }; error?: string
  }> {
    try {
      const res = await fetch(`${this.baseUrl}/desktop/foreground_window`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      })
      return (await res.json()) as { ok: boolean; hwnd?: number; title?: string; pid?: number; rect?: any; error?: string }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  /** 推送 sidecar 运行期配置（M3 切片 18：置前台后短延时 ms，0=关闭） */
  async setDesktopConfig(opts: {
    foregroundDelayMs?: number
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/desktop/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foreground_delay_ms: opts.foregroundDelayMs ?? 0 })
      })
      return (await res.json()) as { ok: boolean; error?: string }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }

  /** 聚合阈值覆盖（M3 切片 8/12）；缺省键沿用 sidecar 默认 */
  recordThresholds?: Partial<RecordThresholds>
  /** 开启桌面智能录制（观察不吞输入；appPid 排除自身；targetPid 圈定目标窗口进程，M3 切片 6；thresholds 聚合阈值，M3 切片 8/12） */
  async recordStart(appPid?: number, targetPid?: number, thresholds?: Partial<RecordThresholds>): Promise<RecordStartReply> {
    try {
      const body: Record<string, unknown> = { app_pid: appPid ?? 0, target_pid: targetPid ?? 0 }
      if (thresholds) {
        body.thresholds = {
          click_debounce_ms: thresholds.clickDebounceMs,
          click_debounce_px: thresholds.clickDebouncePx,
          typing_gap_ms: thresholds.typingGapMs,
          scroll_gap_ms: thresholds.scrollGapMs
        }
      }
      const res = await fetch(`${this.baseUrl}/record/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      return (await res.json()) as RecordStartReply
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }

  /** 结束录制并返回聚合后的指令序列（元素签名随后由主进程写入元素库） */
  async recordStop(): Promise<RecordStopReply> {
    try {
      const res = await fetch(`${this.baseUrl}/record/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      })
      return (await res.json()) as RecordStopReply
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  }

  /** POST /office/<route> 通用封装（M7-39 Office COM） */
  private async officePost(
    route: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    try {
      const res = await fetch(`${this.baseUrl}/office/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      return (await res.json()) as Record<string, unknown>
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  officeExcelOpen(path: string, visible = false) {
    return this.officePost('excel_open', { path, visible })
  }
  officeExcelRead(sheet: string, range: string) {
    return this.officePost('excel_read', { sheet, range })
  }
  officeExcelWrite(sheet: string, range: string, values: unknown[][]) {
    return this.officePost('excel_write', { sheet, range, values })
  }
  officeExcelClose(save = true) {
    return this.officePost('excel_close', { save })
  }
  officeWordOpen(path: string, visible = false) {
    return this.officePost('word_open', { path, visible })
  }
  officeWordReplace(find: string, replace: string, matchCase = false) {
    return this.officePost('word_replace', { find, replace, match_case: matchCase })
  }
  officeWordClose(save = true) {
    return this.officePost('word_close', { save })
  }

  stop(): void {
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
    this.baseUrl = ''
  }
}
