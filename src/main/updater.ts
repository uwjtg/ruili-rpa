/**
 * 自动更新（M5-26：接入 electron-updater）。
 *
 * 更新源：GitHub Releases（见 package.json build.publish，owner/repo 当前为占位，
 * 发版前需改成真实仓库）。dev 环境不注册 autoUpdater（缺 app-update.yml 会报错）。
 *
 * 生命周期：
 *   1. app ready → initUpdater(getWindow) 注册事件监听；
 *   2. 启动后自动 checkForUpdates()（生产环境）；
 *   3. 有更新 → 自动下载；下载完成 → dialog 提示「立即重启 / 稍后」；
 *   4. renderer 可通过 updater:check 手动检查、updater:quit-and-install 触发安装。
 */
import { app, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

type GetWindow = () => BrowserWindow | null

/** 推给渲染端的更新状态（M6 体验打磨时可做 toast/设置页入口） */
export type UpdaterStatus =
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes?: string }
  | { status: 'downloading'; percent: number }
  | { status: 'not-available'; version?: string }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }

let configured = false

function send(win: BrowserWindow | null, s: UpdaterStatus): void {
  win?.webContents.send('updater:status', s)
}

/** 注册 autoUpdater 事件监听（只跑一次；dev 环境空跑）。 */
export function initUpdater(getWindow: GetWindow): void {
  if (configured) return
  configured = true

  if (!app.isPackaged) {
    // eslint-disable-next-line no-console
    console.log('[updater] 开发环境：electron-updater 不注册（缺 app-update.yml）')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // 静默 logger：info/warn/debug 不向 stdout 灌日志；error 保留，
  // 便于离线/无网络时在 crash.log 旁定位更新失败原因（P2 加固）。
  autoUpdater.logger = {
    info: () => {},
    warn: () => {},
    debug: () => {},
    error: (...args: unknown[]) => console.error('[updater]', ...args)
  }

  autoUpdater.on('checking-for-update', () => {
    send(getWindow(), { status: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    send(getWindow(), {
      status: 'available',
      version: info.version,
      releaseNotes:
        typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
    })
  })
  autoUpdater.on('update-not-available', (info) => {
    send(getWindow(), { status: 'not-available', version: info?.version })
  })
  autoUpdater.on('download-progress', (p) => {
    send(getWindow(), { status: 'downloading', percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    const win = getWindow()
    send(win, { status: 'downloaded', version: info.version })
    const opts = {
      type: 'info' as const,
      title: '更新就绪',
      message: `锐流RPA v${info.version} 已下载完成`,
      detail: '重启应用后更新生效。',
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1
    }
    void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
      .catch(() => {})
  })
  autoUpdater.on('error', (err) => {
    send(getWindow(), {
      status: 'error',
      message: err instanceof Error ? err.message : String(err)
    })
  })
}

/** 启动后自动检查更新（生产环境）；dev 环境空跑。 */
export function checkForUpdates(): void {
  if (!app.isPackaged) {
    // eslint-disable-next-line no-console
    console.log('[updater] 开发环境跳过检查更新')
    return
  }
  autoUpdater
    .checkForUpdates()
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[updater] 检查更新失败：', err)
    })
}

/** 下载完成后重启并安装（renderer 调）。 */
export function quitAndInstall(): void {
  if (!app.isPackaged) return
  autoUpdater.quitAndInstall()
}
