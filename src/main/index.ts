import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'path'
import { RunManager, buildEngineRegistry } from '../engine/run/runManager'
import { setMailAccountProvider } from '../engine/commands/mail'
import type { RunWireEvent } from '../shared/run-protocol'
import type { FlowDoc } from '../shared/ast'
import { buildFlowPackage, parseFlowPackage } from '../shared/flow-package'
import { LlmClient } from '../engine/llm/provider'
import { generateFlow } from '../engine/llm/astGen'
import { explainRunError } from '../engine/llm/explainError'
import { DEMO_FLOW } from '../engine/core/demo-flow'
import { M1_E2E_FLOW } from '../engine/core/m1-flow'
import {
  appendRunLog,
  closeDb,
  deleteElement,
  deleteFlow,
  getElement,
  listElements,
  listFlows,
  loadFlow,
  loadForegroundDelayMs,
  loadRecordThresholds,
  openDb,
  saveElement,
  saveFlow,
  saveForegroundDelayMs,
  saveRecordThresholds,
  createTask,
  listTasks,
  listEnabledTasks,
  setTaskEnabled,
  deleteTask,
  markTaskRan,
  markTaskTick,
  listRunHistory,
  listRunEntries,
  clearRunHistory,
  upsertRunCheckpoint,
  deleteRunCheckpoint,
  getRunCheckpoint,
  listResumableRuns,
  loadLlmConfig,
  saveLlmConfig,
  loadMailAccount,
  saveMailAccount
} from './store/db'
import { TaskScheduler } from './scheduler'
import { HotkeyManager } from './hotkeys'
import { FileWatchManager } from './filewatch'
import type { RunLogEntry } from './store/db'
import type { RecordThresholds } from '../shared/record-settings'
import { PickController } from './pick'
import { RecordController } from './record'
import { inspectForWizard } from './scrape'
import { startWebPick } from './web-pick'
import { startWebRecord, stopWebRecord } from './web-record'
import { ensureSidecar, disposeSidecar } from './sidecar'
import { checkForUpdates, initUpdater, quitAndInstall } from './updater'
import { initCrashHandler, reportRendererError, reportRenderProcessGone, getCrashLogPath } from './crash'
import { initTray, attachCloseToTray, markQuitting, destroyTray, isAutoLaunch, setAutoLaunch, shouldStartHidden } from './tray'
import { randomUUID } from 'node:crypto'

// M7-2: perf instrumentation (gated by RUILI_PERF=1). Read-only timing + memory; no behavior change.
const PERF = process.env.RUILI_PERF === '1'
const perfT0 = process.hrtime.bigint()
function perfMark(label: string): void {
  if (!PERF) return
  const ms = Number(process.hrtime.bigint() - perfT0) / 1e6
  const m = process.memoryUsage()
  console.log(
    `PERF ${label} t=${ms.toFixed(1)}ms rss=${(m.rss / 1048576).toFixed(1)}MB heapUsed=${(m.heapUsed / 1048576).toFixed(1)}MB`
  )
}

// M6-3: register crash handler as early as possible
initCrashHandler()
perfMark('main-eval')
if (PERF) console.log('APPVER=' + app.getVersion())

/** M7-1：从命令行参数里挑出 .rui 文件路径（Windows 双击文件关联传入）。 */
function extractRuiPath(argv: string[]): string | null {
  for (const a of argv) {
    if (typeof a === 'string' && a.toLowerCase().endsWith('.rui') && existsSync(a)) return a
  }
  return null
}

/** M7-1：读 .rui → 解析 FlowDoc → 落库 → 通知渲染端打开编辑器。 */
async function importRuiFile(path: string): Promise<void> {
  try {
    const text = await readFile(path, 'utf8')
    const parsed = parseFlowPackage(text)
    if (!parsed.ok) {
      dialog.showErrorBox('导入流程包失败', parsed.error)
      return
    }
    const saved = saveFlow(parsed.flow)
    if (!saved.ok) {
      dialog.showErrorBox('导入流程包失败', saved.error)
      return
    }
    mainWindow?.webContents.send('app:open-flow', {
      flowId: saved.id,
      name: parsed.flow.name
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    dialog.showErrorBox('导入流程包失败', msg)
  }
}

/** Windows 下 .rui 双击首次启动：文件路径在 argv 里，等窗口就绪后再导入。 */
let pendingRuiPath: string | null = extractRuiPath(process.argv)

// M7-1：单实例锁。第二个实例启动时把它的 .rui 参数交给已有窗口处理。
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
    const p = extractRuiPath(argv)
    if (p) void importRuiFile(p)
  })
}

/** 鍐掔儫妯″紡锛氱獥鍙ｆ樉绀哄悗鎴彇棣栧睆锛坰moke.png锛夊苟鑷姩閫€鍑猴紝渚涙棤浜哄€煎畧楠岃瘉鍩虹嚎绐楀彛锛圧UILI_SMOKE=1锛?*/
const isSmoke = process.env.RUILI_SMOKE === '1'

// P1 兜底：冒烟模式下任何意外（路由切换失败、渲染进程崩溃、截图异常）
// 都不能让进程挂死不退出。30s 硬超时强制退出。
if (isSmoke) {
  const watchdog = setTimeout(() => {
    console.error('SMOKE_WATCHDOG_TIMEOUT: force quit after 30s')
    markQuitting()
    app.quit()
  }, 30000)
  if (typeof watchdog.unref === 'function') watchdog.unref()
}

function createWindow(): BrowserWindow {
  // dev: build/icon.png; packaged: embedded
  const devIcon =
    !app.isPackaged && existsSync(join(process.cwd(), 'build', 'icon.png'))
      ? join(process.cwd(), 'build', 'icon.png')
      : undefined
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 940,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#F2F3F5',
    title: '閿愭祦RPA',
    ...(devIcon ? { icon: devIcon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win
  win.on('ready-to-show', () => {
    perfMark('ready-to-show')
    // M7-9: --hidden（开机自启）启动时不主动弹主窗口
    if (!shouldStartHidden()) win.show()
  })

  // 冒烟模式：首屏渲染后截图 smoke.png，随后退出（验证用户真正看到的层）
  win.webContents.once('did-finish-load', async () => {
    perfMark('did-finish-load')
    if (!isSmoke) return
    // 鍙€夛細鎴寚瀹氳矾鐢憋紙HashRouter锛夛紝濡?RUILI_SMOKE_ROUTE=/editor
    const route = process.env.RUILI_SMOKE_ROUTE
    // P1 修复：整个冒烟流程包进 try/catch/finally，任何一步异常（路由切换失败、
    // 截图失败）都必须走到 finally 退出，杜绝进程挂死。
    try {
      if (route) {
        try {
          await win.webContents.executeJavaScript(
            `location.hash = ${JSON.stringify(route)}`
          )
        } catch (routeErr) {
          console.error('SMOKE_ROUTE_FAILED', routeErr)
        }
        await new Promise((resolve) => setTimeout(resolve, 1200))
      }
      await new Promise((resolve) => setTimeout(resolve, 800))
      const image = await win.webContents.capturePage()
      const out = route
        ? join(
            process.cwd(),
            '.runtime',
            `smoke-${route.replace(/[\\/?&=:#]/g, '_')}.png`
          )
        : join(process.cwd(), 'smoke.png')
      // .runtime 目录可能不存在，先确保建好（此前 ENOENT 导致截图失败）
      await mkdir(join(out, '..'), { recursive: true })
      await writeFile(out, image.toPNG())
      console.log(`SMOKE_SHOT_SAVED ${out}`)
    } catch (err) {
      console.error('SMOKE_SHOT_FAILED', err)
    } finally {
      // markQuitting：否则托盘 close 拦截会让 app.quit() 关不掉窗口
      setTimeout(() => {
        markQuitting()
        app.quit()
      }, 500)
    }
  })

  // M7-1: renderer ready → import pending .rui file (Windows double-click first launch)
  win.webContents.once('did-finish-load', () => {
    if (pendingRuiPath) {
      const p = pendingRuiPath
      pendingRuiPath = null
      void importRuiFile(p)
    }
  })

  // M6-3: renderer process crash
  win.webContents.on('render-process-gone', (_e, details) => {
    reportRenderProcessGone({ reason: details.reason, exitCode: details.exitCode })
  })

  // 澶栭儴閾炬帴涓€寰嬩氦缁欑郴缁熸祻瑙堝櫒锛屼笉鍦ㄥ簲鐢ㄥ唴寮€鏂扮獥鍙?
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 寮€鍙戞ā寮忓姞杞?vite dev server锛岀敓浜у姞杞芥瀯寤轰骇鐗?
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/* ---------- 鏍囬鏍忕獥鍙ｆ帶鍒?IPC ---------- */
ipcMain.on('win:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize()
})

ipcMain.on('win:maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return
  if (win.isMaximized()) {
    win.unmaximize()
  } else {
    win.maximize()
  }
})

ipcMain.on('win:close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close()
})

/* ---------- 娴佺▼杩愯锛堥樁娈?4锛夛細RunManager 浜嬩欢娴?鈫?娓叉煋绔?---------- */
let mainWindow: BrowserWindow | null = null

/** 鏈杩愯褰掑睘鐨勬祦绋?id锛坮enderer 璋?run:start 鏃堕€忎紶锛涘唴缃祦绋嬩负 null锛?*/
let currentFlowId: string | null = null
let pendingRunFlow: FlowDoc | null = null
/** 杩愯鏈熸棩蹇楃紦鍐诧紝flow-end 鏃舵壒閲忚惤 logs 琛?*/
let runLog: {
  flowId: string | null
  runId: string
  flow: FlowDoc
  entries: RunLogEntry[]
} | null = null

function broadcast(event: RunWireEvent): void {
  // 收集运行日志并在 flow-end 落 SQLite（M2 切片 3）
  if (event.type === 'flow-start') {
    runLog = {
      flowId: currentFlowId,
      runId: randomUUID(),
      flow: pendingRunFlow!,
      entries: []
    }
  } else if (event.type === 'checkpoint' && runLog) {
    upsertRunCheckpoint(
      runLog.runId,
      runLog.flowId,
      runLog.flow,
      event.stepId,
      event.completedIndex,
      event.vars
    )
  } else if (event.type === 'log' && runLog) {
    runLog.entries.push({ level: event.level, message: event.message, ts: Date.now() })
  } else if (event.type === 'flow-end' && runLog) {
    appendRunLog(
      runLog.flowId,
      runLog.runId,
      runLog.entries,
      event.result.status,
      event.result.durationMs
    )
    // R2：成功/取消清断点；失败保留供续跑
    if (event.result.status !== 'error') deleteRunCheckpoint(runLog.runId)
    // M5-15锛氭妸 runId+status 鍗曠嫭鎺ㄤ竴浠斤紝缂栬緫鍣ㄥけ璐ユ椂鎸?runId 璋?AI 瑙ｉ噴
    mainWindow?.webContents.send('run:end-meta', {
      runId: runLog.runId,
      status: event.result.status
    })
    runLog = null
  }
  mainWindow?.webContents.send('run:event', event)
}

const runManager = new RunManager(broadcast)

ipcMain.handle('run:start', (_e, flow: FlowDoc, flowId?: string) => {
  try {
    currentFlowId = flowId ?? null
    pendingRunFlow = flow
    runManager.start(flow)
    return { ok: true as const }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
})

// R2：列出可续跑的失败运行
ipcMain.handle('runs:resumable', () => {
  return listResumableRuns().map((c) => ({
    runId: c.runId,
    flowId: c.flowId,
    flowName: c.flow.name,
    completedStepId: c.completedStepId,
    updatedAt: c.updatedAt
  }))
})

// R2：从指定失败运行的断点继续
ipcMain.handle('run:resume-checkpoint', (_e, runId: string) => {
  try {
    const cp = getRunCheckpoint(runId)
    if (!cp) return { ok: false as const, error: '找不到可续跑的断点（可能已完成）' }
    currentFlowId = cp.flowId
    pendingRunFlow = cp.flow
    runManager.start(cp.flow, {
      resume: { completedIndex: cp.completedIndex, vars: cp.vars }
    })
    return { ok: true as const }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.on('run:resume', () => runManager.resume())
ipcMain.on('run:stop', () => runManager.stop())
ipcMain.on('run:step', () => runManager.step())

ipcMain.handle('run:start-demo', () => {
  try {
    runManager.start(DEMO_FLOW)
    return { ok: true as const }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('run:start-m1', () => {
  try {
    // 鐪熷疄娴忚鍣?+ Excel 绔埌绔紱缁?60s 鏁翠綋瓒呮椂淇濋櫓锛屽埌鏃跺崗浣滃紡鍋滄
    runManager.start(M1_E2E_FLOW, { timeoutMs: 60_000 })
    return { ok: true as const }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
})

/* ---------- LLM锛堥樁娈?4锛夛細apiKey 鐣欏湪涓昏繘绋嬶紝娓叉煋绔彧浼?prompt ---------- */
// Provider 閰嶇疆榛樿鍊硷紙鍐崇瓥鈶わ細鍙鐜鍙橀噺瑕嗙洊锛沘piKey 涓嶅叆鍖咃級
// 鐜鍙橀噺榛樿 Provider锛堥娆℃棤 DB 閰嶇疆鏃朵娇鐢紱M5-11 鍚庣敤鎴峰彲鍦ㄨ缃噷鏀癸級
function envDefaultProviders() {
  return [
    {
      name: 'cloud',
      baseURL: process.env.RUILI_LLM_BASE_URL ?? 'https://api.openai.com/v1',
      apiKey: process.env.RUILI_LLM_API_KEY ?? '',
      model: process.env.RUILI_LLM_MODEL ?? 'gpt-4o-mini'
    },
    {
      name: 'local',
      baseURL: process.env.RUILI_LLM_LOCAL_URL ?? 'http://127.0.0.1:11434/v1',
      apiKey: 'ollama',
      model: process.env.RUILI_LLM_LOCAL_MODEL ?? 'qwen2.5'
    }
  ]
}

let llmClient = new LlmClient(envDefaultProviders())

/** safeStorage 瑙ｅ瘑 apiKey锛涘け璐?涓嶅彲鐢ㄥ洖绌轰覆銆?*/
function decryptKey(b64: string): string {
  if (!b64) return ''
  try {
    if (!safeStorage.isEncryptionAvailable()) return ''
    return safeStorage.decryptString(Buffer.from(b64, 'base64'))
  } catch {
    return ''
  }
}

/** safeStorage 鍔犲瘑 apiKey 涓?base64锛涗笉鍙敤鍒欏師鏍峰瓨锛堝厹搴曪級銆?*/
function encryptKey(plain: string): string {
  try {
    if (!plain || !safeStorage.isEncryptionAvailable()) return plain
    return safeStorage.encryptString(plain).toString('base64')
  } catch {
    return plain
  }
}

/** 浠?DB 閲嶅缓 LlmClient锛涙棤閰嶇疆鍒欎繚鎸佺幆澧冨彉閲忛粯璁ゃ€?*/
function reloadLlmClientFromDb(): void {
  const cfg = loadLlmConfig()
  if (!cfg) return
  const providers = cfg.providers.map((p) => ({
    name: p.name,
    baseURL: p.baseURL,
    model: p.model,
    apiKey: decryptKey(p.apiKeyEnc)
  }))
  llmClient = new LlmClient(providers)
  llmClient.setActive(cfg.active)
}

/** M7-30：把 DB 里加密的邮件账号接到引擎 sendMailSaved；惰性读取，改完 IPC 即生效。 */
function wireMailAccountProvider(): void {
  setMailAccountProvider(() => {
    const a = loadMailAccount()
    if (!a) return null
    return {
      host: a.host,
      port: a.port,
      secure: a.secure,
      user: a.user,
      pass: decryptKey(a.passEnc),
      from: a.from
    }
  })
}

ipcMain.handle('mail:get-account', () => {
  const a = loadMailAccount()
  if (!a) {
    return { hasAccount: false, host: '', port: 465, secure: true, user: '', from: '', hasPassword: false }
  }
  return {
    hasAccount: true,
    host: a.host,
    port: a.port,
    secure: a.secure,
    user: a.user,
    from: a.from,
    hasPassword: !!a.passEnc
  }
})

ipcMain.handle('mail:save-account', (_, input: {
  host: string; port?: number; secure?: boolean; user: string; from?: string; pass?: string
}) => {
  try {
    const existing = loadMailAccount()
    let passEnc = existing?.passEnc ?? ''
    if (input.pass && input.pass.trim() !== '') {
      passEnc = encryptKey(input.pass.trim())
    }
    return saveMailAccount({
      host: String(input.host ?? ''),
      port: Number(input.port ?? 465),
      secure: input.secure !== false,
      user: String(input.user ?? ''),
      from: String(input.from ?? input.user ?? ''),
      passEnc
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('llm:list-providers', () => ({
  active: llmClient.active().name,
  providers: llmClient.listProviders()
}))

ipcMain.handle('llm:set-provider', (_e, name: string) => {
  llmClient.setActive(name)
  return { ok: true as const, active: name }
})

ipcMain.handle('llm:generate-flow', async (_e, prompt: string) => {
  try {
    const flow = await generateFlow(prompt, llmClient, buildEngineRegistry())
    return { ok: true as const, flow }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
})

/* ---------- LLM 閰嶇疆锛圡5-11锛夛細UI 鍙敼 baseURL/model/apiKey锛沘piKey DPAPI 鍔犲瘑钀界洏锛屼笉涓嬪彂鏄庢枃 ---------- */
ipcMain.handle('llm:get-config', () => {
  const cfg = loadLlmConfig()
  // P3：把 safeStorage 是否可用透传给渲染端，不可用时 UI 提示 apiKey 明文兜底
  const encryptionAvailable = safeStorage.isEncryptionAvailable()
  if (!cfg) {
    // 鏃?DB 閰嶇疆锛氱敤鍐呭瓨閲岀殑鐜鍙橀噺榛樿
    const defaults = envDefaultProviders()
    return {
      active: llmClient.active().name,
      encryptionAvailable,
      providers: defaults.map((p) => ({
        name: p.name,
        baseURL: p.baseURL,
        model: p.model,
        hasApiKey: !!p.apiKey
      }))
    }
  }
  return {
    active: cfg.active,
    encryptionAvailable,
    providers: cfg.providers.map((p) => ({
      name: p.name,
      baseURL: p.baseURL,
      model: p.model,
      hasApiKey: !!p.apiKeyEnc
    }))
  }
})

ipcMain.handle('llm:save-config', (_e, input: {
  active: string
  providers: Array<{ name: string; baseURL: string; model: string; apiKey?: string }>
}) => {
  try {
    const existing = loadLlmConfig()
    const providers = input.providers.map((p) => {
      // apiKey non-empty updates; empty preserves old
      let apiKeyEnc = ''
      const prev = existing?.providers.find((x) => x.name === p.name)
      if (p.apiKey && p.apiKey.trim() !== '') {
        apiKeyEnc = encryptKey(p.apiKey.trim())
      } else if (prev) {
        apiKeyEnc = prev.apiKeyEnc
      }
      return { name: p.name, baseURL: p.baseURL, model: p.model, apiKeyEnc }
    })
    const active = providers.some((p) => p.name === input.active)
      ? input.active
      : providers[0].name
    const r = saveLlmConfig({ active, providers })
    if (!r.ok) return r
    reloadLlmClientFromDb()
    return { ok: true as const, active }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('llm:test', async () => {
  try {
    const p = llmClient.active()
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15_000)
    const res = await fetch(`${p.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({ model: p.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal: ctrl.signal
    })
    clearTimeout(timer)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false as const, error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    }
    return { ok: true as const, model: p.model }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('llm:explain-error', async (_e, runId: string) => {
  try {
    const en = listRunEntries(runId)
    if (!en.ok) return { ok: false as const, error: en.error }
    const hist = listRunHistory(1000)
    const item = hist.ok ? hist.items.find((x) => x.runId === runId) : null
    const text = await explainRunError(llmClient, item?.flowName ?? null, en.items)
    return { ok: true as const, explanation: text }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
})

/* ---------- 鎸囦护鐩綍锛圡2锛夛細娓叉煋绔嬁 UI 鍏冩暟鎹紙runner 鍑芥暟浼氳 IPC 涓㈠純锛?---------- */
ipcMain.handle('registry:list', () => {
  const reg = buildEngineRegistry()
  return reg.list().map((c) => ({
    id: c.id,
    name: c.name,
    group: c.group,
    icon: c.icon,
    params: c.params,
    hasEnd: c.hasEnd ?? false
  }))
})

/* ---------- 娴佺▼鎸佷箙鍖栵紙M2 鍒囩墖 2锛夛細better-sqlite3锛宎pps/flows/logs 涓夎〃 ---------- */
ipcMain.handle('flow:list', () => listFlows())
ipcMain.handle('flow:load', (_e, id: string) => loadFlow(id))
ipcMain.handle('flow:save', (_e, flow: FlowDoc, existingId?: string) =>
  saveFlow(flow, existingId)
)
ipcMain.handle('flow:delete', (_e, id: string) => deleteFlow(id))

/* ---------- 娴佺▼鍖呭鍏ュ鍑猴紙M5 鍒囩墖 24锛夛細.json 钀界洏/璇荤洏 ---------- */
ipcMain.handle('flow:export', async (_e, id: string) => {
  const loaded = loadFlow(id)
  if (!loaded.ok) return { ok: false as const, error: loaded.error }
  const dialogOpts = {
    title: '导出流程包',
    defaultPath: `${loaded.flow.name}.json`,
    filters: [{ name: '流程包', extensions: ['json'] }]
  }
  const { canceled, filePath } = mainWindow
    ? await dialog.showSaveDialog(mainWindow, dialogOpts)
    : await dialog.showSaveDialog(dialogOpts)
  if (canceled || !filePath) return { ok: false as const, error: '已取消' }
  try {
    await writeFile(filePath, JSON.stringify(buildFlowPackage(loaded.flow), null, 2), 'utf8')
    return { ok: true as const, path: filePath }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
  }
})

ipcMain.handle('flow:import', async () => {
  const dialogOpts = {
    title: '导入流程包',
    properties: ['openFile' as const],
    filters: [{ name: '流程包', extensions: ['json'] }]
  }
  const { canceled, filePaths } = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOpts)
    : await dialog.showOpenDialog(dialogOpts)
  if (canceled || filePaths.length === 0) return { ok: false as const, error: '已取消' }
  try {
    const text = await readFile(filePaths[0], 'utf8')
    const parsed = parseFlowPackage(text)
    if (!parsed.ok) return { ok: false as const, error: parsed.error }
    return { ok: true as const, flow: parsed.flow }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
  }
})

/* ---------- 妗岄潰鍏冪礌鎷惧彇锛圡3 鍒囩墖 1/2锛夛細Python sidecar 妗?---------- */
const pickController = new PickController(() => mainWindow)
ipcMain.handle('pick:start', async () => {
  const reply = await pickController.start()
  // M3 鍒囩墖 2锛氭嬀鍙栨垚鍔熻嚜鍔ㄥ叆搴擄紙鍏冪礌搴擄級锛宺eply 甯﹀厓绱犲簱 id锛堝悜鍚庡吋瀹癸級
  if (reply.ok && 'element' in reply) {
    const saved = saveElement(reply.element)
    if (saved.ok) {
      return { ...reply, elementId: saved.id }
    }
  }
  return reply
})
ipcMain.handle('pick:stop', () => pickController.stop())

/* ---------- 鍏冪礌搴擄紙M3 鍒囩墖 2/3锛夛細picked 鍏冪礌鎸佷箙鍖?+ dry-run 鏍￠獙 ---------- */
ipcMain.handle('elements:list', () => listElements())
ipcMain.handle('elements:delete', (_e, id: string) => deleteElement(id))
ipcMain.handle('elements:verify', async (_e, id: string) => {
  const el = getElement(id)
  if (!el.ok) return { ok: false as const, error: el.error }
  try {
    const client = await ensureSidecar()
    const r = await client.locateElement(el.element.signature)
    return {
      ok: r.ok,
      found: r.found ?? false,
      strategy: r.strategy ?? ('none' as const),
      trace: r.trace ?? [],
      error: r.error
    }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
})

/* ---------- 妗岄潰鏅鸿兘褰曞埗锛圡3 鍒囩墖 3锛夛細瑙傚療寮忓綍鍒?鈫?鎸囦护搴忓垪 ---------- */
const recordController = new RecordController(() => mainWindow)
ipcMain.handle('record:start', (_e, targetPid?: number, thresholds?: Partial<RecordThresholds>) => recordController.start(targetPid, thresholds))
ipcMain.handle('record:stop', () => recordController.stop())
  // M3 切片 6：圈定录制窗口——复用拾取框点选目标窗口，返回其顶层进程 PID（后续 record:start 传入）
ipcMain.handle('record:pickTargetWindow', async () => {
  const reply = await pickController.start()
  if (!reply.ok || !('element' in reply)) {
    return reply
  }
  const hwnd = Number(reply.element.windowHandle ?? 0)
  const client = await ensureSidecar()
  const r = await client.windowPid(hwnd)
  if (!r.ok || !r.pid) {
    return { ok: false, error: r.error ?? '鏃犳硶鑾峰彇绐楀彛杩涚▼ PID' }
  }
  return { ok: true, pid: r.pid, title: reply.element.windowTitle ?? reply.element.name ?? '' }
})

/* ---------- M4 鍒囩墖 1锛氭暟鎹姄鍙栧悜瀵尖€斺€斿湪宸插紑椤甸潰閲岃瘑鍒浉浼煎垪琛ㄩ」 ---------- */
ipcMain.handle('scrape:inspect', (_e, sampleSelector: string) => inspectForWizard(sampleSelector))
ipcMain.handle('web-pick:start', (_e, timeoutMs?: number) => startWebPick(timeoutMs))
ipcMain.handle('web-record:start', () => startWebRecord())
ipcMain.handle('web-record:stop', () => stopWebRecord())

/* ---------- 璁剧疆锛圡3 鍒囩墖 12锛夛細褰曞埗鑱氬悎闃堝€兼寔涔呭寲 ---------- */
ipcMain.handle('settings:get-record-thresholds', () => loadRecordThresholds())
ipcMain.handle('settings:set-record-thresholds', (_e, raw: unknown) =>
  saveRecordThresholds(raw)
)

/* ---------- M3 鍒囩墖 18锛氱疆鍓嶅彴鍚庣煭寤舵椂寮€鍏筹紙榛樿鍏筹級 ---------- */
ipcMain.handle('settings:get-foreground-delay-ms', () => loadForegroundDelayMs())
ipcMain.handle('settings:set-foreground-delay-ms', async (_e, raw: unknown) => {
  const r = saveForegroundDelayMs(raw)
  // sidecar 宸插湪璺戝氨瀹炴椂鎺ㄩ€侊紱鏈湪璺戝垯涓嬫 ensureSidecar 鍚姩鏃舵帹
  if (r.ok) {
    try {
      const c = await ensureSidecar()
      await c.setDesktopConfig({ foregroundDelayMs: loadForegroundDelayMs() })
    } catch {
      /* 鏈捣 sidecar 鏃跺拷鐣?*/
    }
  }
  return r
})

/* ---------- M5 璋冨害锛氳鍒掍换鍔★紙cron/interval锛夊埌鐐硅Е鍙戣繍琛?---------- */
const scheduler = new TaskScheduler({
  loadFlow: (flowId) => {
    const r = loadFlow(flowId)
    return r.ok ? r.flow : null
  },
  fire: (flow, task) => {
    try {
      // M5-10锛氳皟搴﹁Е鍙戠殑杩愯鎶婃棩蹇楀綊鍒颁换鍔℃墍灞炴祦绋嬶紝閬垮厤娌跨敤璁捐鍣ㄤ笂娆＄殑 flowId
      currentFlowId = task.flowId
      runManager.start(flow)
    } catch (err) {
      console.error('计划任务触发运行失败：', err)
    }
  },
  markRan: (id, next) => markTaskRan(id, next),
  markTick: (id, next) => markTaskTick(id, next),
  isRunning: () => runManager.isRunning()
})
const hotkeys = new HotkeyManager({
  loadFlow: (flowId) => {
    const r = loadFlow(flowId)
    return r.ok ? r.flow : null
  },
  fire: (flow, task) => {
    try {
      currentFlowId = task.flowId
      runManager.start(flow)
    } catch (err) {
      console.error('热键触发运行失败：', err)
    }
  },
  markRan: (id, next) => markTaskRan(id, next),
  isRunning: () => runManager.isRunning()
})
const fileWatcher = new FileWatchManager({
  loadFlow: (flowId) => {
    const r = loadFlow(flowId)
    return r.ok ? r.flow : null
  },
  fire: (flow, task, extraVars) => {
    try {
      currentFlowId = task.flowId
      runManager.start(flow, extraVars ? { initialVars: extraVars } : {})
    } catch (err) {
      console.error('文件触发运行失败：', err)
    }
  },
  markRan: (id, next) => markTaskRan(id, next),
  isRunning: () => runManager.isRunning()
})

ipcMain.handle('tasks:list', () => listTasks())
ipcMain.handle('tasks:create', (_e, input) => createTask(input))
ipcMain.handle('tasks:toggle', (_e, id: string, on: boolean) => {
  const r = setTaskEnabled(id, on)
  // rebuild timers/hotkeys after toggle
  const enabled = listEnabledTasks()
  if (enabled.ok) {
    scheduler.reload(enabled.items)
    hotkeys.reload(enabled.items)
    fileWatcher.reload(enabled.items)
  }
  return r
})
ipcMain.handle('tasks:delete', (_e, id: string) => {
  const r = deleteTask(id)
  const enabled = listEnabledTasks()
  if (enabled.ok) {
    scheduler.reload(enabled.items)
    hotkeys.reload(enabled.items)
    fileWatcher.reload(enabled.items)
  }
  return r
})
ipcMain.handle('runs:history', (_e, limit?: number) => listRunHistory(limit ?? 100))
ipcMain.handle('runs:entries', (_e, runId: string) => listRunEntries(runId))
ipcMain.handle('runs:clear', () => clearRunHistory())

/* ---------- 鑷姩鏇存柊锛圡5-26锛夛細鎵嬪姩妫€鏌?+ 閲嶅惎瀹夎 ---------- */
ipcMain.handle('updater:check', () => {
  checkForUpdates()
  return { ok: true as const }
})
ipcMain.handle('updater:quit-and-install', () => {
  quitAndInstall()
  return { ok: true as const }
})

/* ---------- M7-9: 开机自启 IPC ---------- */
ipcMain.handle('autolaunch:get', () => ({ enabled: isAutoLaunch() }))
ipcMain.handle('autolaunch:set', (_e, on: boolean) => { setAutoLaunch(on); return { ok: true, enabled: isAutoLaunch() } })

/* ---------- M6-3：renderer 未捕获错误转发落盘 ---------- */
ipcMain.on('crash:report', (_e, message: string, stack?: string) => {
  reportRendererError(message, stack)
})

/* M6-6: open crash.log in system file viewer */
ipcMain.handle('crash:open-log', async () => {
  const p = getCrashLogPath()
  if (!p) return { ok: false as const, error: 'crash.log 尚未创建' }
  const err = await shell.openPath(p)
  return err ? { ok: false as const, error: err } : { ok: true as const, path: p }
})

app.whenReady().then(() => {
  perfMark('when-ready')
  // DB under userData
  openDb(join(app.getPath('userData'), 'ruili.db'))
  perfMark('window-created')
  // M5-11: load LLM config from DB
  reloadLlmClientFromDb()
  wireMailAccountProvider()
  // M7-9: 系统托盘 + 开机自启
  attachCloseToTray(createWindow())
  initTray({
    showWindow: () => {
      if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus() }
    },
    checkForUpdates: () => checkForUpdates(),
    quit: () => { markQuitting(); app.quit() }
  })

  // M5-26: electron-updater (GitHub Releases; dev auto-skip)
  initUpdater(() => mainWindow)
  checkForUpdates()

  // M7-1: .rui 文件关联（macOS open-file；Windows 走 argv + second-instance，见上）
  app.on('open-file', (_event, path) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
    void importRuiFile(path)
  })

  // 鍚姩璁″垝浠诲姟璋冨害鍣ㄤ笌鐑敭锛堝姞杞藉叏閮ㄥ惎鐢ㄤ换鍔★紱鍚姩鏃跺閿欒繃鐨勫畾鏃惰Е鍙戠偣琛ヨ窇涓€娆★級
  const enabled = listEnabledTasks()
  if (enabled.ok) {
    scheduler.reload(enabled.items, { catchUp: true })
    hotkeys.reload(enabled.items)
    fileWatcher.reload(enabled.items)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  scheduler.stop()
  hotkeys.stop()
  fileWatcher.stop()
  pickController.dispose()
  disposeSidecar()
  destroyTray()
  if (process.platform !== 'darwin') app.quit()
})
