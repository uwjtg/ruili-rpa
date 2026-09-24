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
import { resolve } from 'node:path'

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

  constructor(scriptPath?: string) {
    this.scriptPath =
      scriptPath ?? resolve(process.cwd(), 'sidecar', 'server.py')
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

  stop(): void {
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
    this.baseUrl = ''
  }
}
