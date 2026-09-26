/**
 * 系统托盘 + 开机自启（M7 切片 9）。
 *
 * 行为：
 *  - 关闭主窗口时默认收到托盘（不退出），从托盘菜单"退出"才真退。
 *  - 托盘左键点击 / 双击菜单"显示主窗口"：显示并聚焦主窗口。
 *  - 菜单带"开机自启"勾选，走 app.setLoginItemSettings（注册表 Run 键）。
 *  - 带 --hidden 启动时（开机自启场景）不主动弹主窗口。
 *
 * 不依赖任何新 npm 包。
 */

import { app, Tray, Menu, BrowserWindow, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

let tray: Tray | null = null
let isQuitting = false

function resolveIconPath(): string | undefined {
  // dev: build/icon.png；packaged: electron-builder 已把 icon 打进 resources，
  // 但 Tray 在 Windows 上需要绝对路径，优先用 build/icon.png（打安装包时一起带出去）。
  const candidates = [
    join(process.cwd(), 'build', 'icon.png'),
    join(__dirname, '../../build/icon.png')
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return undefined
}

export function isAutoLaunch(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin
  } catch {
    return false
  }
}

export function setAutoLaunch(enabled: boolean): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      // 开机启动时静默进托盘，不弹主窗口
      args: enabled ? ['--hidden'] : []
    })
  } catch {
    /* 非 Windows/macOS 静默失败 */
  }
}

export function shouldStartHidden(): boolean {
  return process.argv.includes('--hidden')
}

export interface TrayHooks {
  showWindow: () => void
  checkForUpdates: () => void
  quit: () => void
}

export function initTray(hooks: TrayHooks): Tray | null {
  const iconPath = resolveIconPath()
  if (!iconPath) {
    console.warn('[tray] 未找到 icon.png，托盘未创建')
    return null
  }
  const image = nativeImage.createFromPath(iconPath)
  // 托盘图标小尺寸，缩到 16x16 避免模糊
  const small = image.resize({ width: 16, height: 16 })
  tray = new Tray(small)
  tray.setToolTip('锐流 RPA')

  const rebuildMenu = () => {
    const auto = isAutoLaunch()
    const menu = Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => hooks.showWindow() },
      { type: 'separator' },
      { label: '开机自启', type: 'checkbox', checked: auto, click: (item) => setAutoLaunch(item.checked) },
      { label: '检查更新', click: () => hooks.checkForUpdates() },
      { type: 'separator' },
      { label: '退出', click: () => hooks.quit() }
    ])
    tray?.setContextMenu(menu)
  }
  rebuildMenu()

  tray.on('click', () => hooks.showWindow())
  tray.on('double-click', () => hooks.showWindow())

  return tray
}

/** 标记"真退出"：窗口关闭时不再拦。 */
export function markQuitting(): void {
  isQuitting = true
}

/** 把主窗口 close 事件改成"收托盘"。需要在创建窗口后调用。 */
export function attachCloseToTray(win: BrowserWindow): void {
  win.on('close', (e) => {
    if (isQuitting) return
    e.preventDefault()
    win.hide()
  })
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
