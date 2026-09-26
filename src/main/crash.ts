/**
 * 崩溃上报（M6-3）：未捕获异常落盘，不上传。
 *
 * 自用模式下不接远程崩溃收集，只做本地文本日志：
 *   - 主进程 uncaughtException / unhandledRejection → userData/crash.log
 *   - renderer 未捕获错误（window.onerror / unhandledrejection）→ IPC → 同一文件
 *   - renderer 进程崩溃（render-process-gone）→ 同一文件
 *
 * 日志路径：%APPDATA%\ruili-rpa\crash.log（追加写，带 ISO 时间戳）。
 */
import { app } from 'electron'
import {
  appendFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  statSync,
  unlinkSync
} from 'node:fs'
import { join } from 'node:path'

let crashLogPath = ''

/** M7-1：crash.log 轮转阈值。保留 crash.log.1 / crash.log.2 两个备份。 */
const MAX_CRASH_LOG_BYTES = 1_000_000 // 1 MB

/**
 * 启动时轮转：若 crash.log 已超阈值，滚动为 .1，旧 .1→.2，删 .2。
 * 失败静默（轮转失败不能阻断崩溃记录本身）。
 */
function rotateCrashLogIfNeeded(): void {
  if (!crashLogPath) return
  try {
    if (!existsSync(crashLogPath)) return
    const st = statSync(crashLogPath)
    if (st.size < MAX_CRASH_LOG_BYTES) return
    const older2 = `${crashLogPath}.2`
    const older1 = `${crashLogPath}.1`
    if (existsSync(older2)) unlinkSync(older2)
    if (existsSync(older1)) renameSync(older1, older2)
    renameSync(crashLogPath, older1)
  } catch {
    /* 轮转失败不阻断 */
  }
}

function writeCrash(level: string, message: string, stack?: string): void {
  if (!crashLogPath) return
  try {
    const body = stack ? `${message}\n${stack}` : message
    appendFileSync(crashLogPath, `[${new Date().toISOString()}] [${level}] ${body}\n\n`, 'utf8')
  } catch {
    /* 写崩溃日志再失败就静默 */
  }
}

/** 注册主进程未捕获异常监听（在 app.whenReady 之前调用）。 */
export function initCrashHandler(): void {
  crashLogPath = join(app.getPath('userData'), 'crash.log')
  // 确保目录存在（Electron 一般已建，但兜底）
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
  } catch {
    /* 已存在 */
  }

  // M7-1：启动时按大小轮转 crash.log
  rotateCrashLogIfNeeded()

  process.on('uncaughtException', (err) => {
    writeCrash('uncaughtException', err.message, err.stack)
  })
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    writeCrash('unhandledRejection', err.message, err.stack)
  })
}

/** renderer 侧未捕获错误通过 IPC 转发过来落盘。 */
export function reportRendererError(message: string, stack?: string): void {
  writeCrash('renderer-error', message, stack)
}

/** renderer 进程崩溃（render-process-gone / unresponsive）落盘。 */
export function reportRenderProcessGone(details: {
  reason: string
  exitCode?: number
}): void {
  writeCrash(
    'render-process-gone',
    `reason=${details.reason} exitCode=${details.exitCode ?? '?'}`,
    undefined
  )
}

/** 返回 crash.log 完整路径（M6-6：设置页「查看崩溃日志」按钮用）。 */
export function getCrashLogPath(): string {
  return crashLogPath
}
