import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'path'
import { RunManager, buildEngineRegistry } from '../engine/run/runManager'
import type { RunWireEvent } from '../shared/run-protocol'
import type { FlowDoc } from '../shared/ast'
import { LlmClient } from '../engine/llm/provider'
import { generateFlow } from '../engine/llm/astGen'
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
  saveRecordThresholds
} from './store/db'
import type { RunLogEntry } from './store/db'
import type { RecordThresholds } from '../shared/record-settings'
import { PickController } from './pick'
import { RecordController } from './record'
import { inspectForWizard } from './scrape'
import { startWebPick } from './web-pick'
import { ensureSidecar, disposeSidecar } from './sidecar'
import { randomUUID } from 'node:crypto'

/** 冒烟模式：窗口显示后截取首屏（smoke.png）并自动退出，供无人值守验证基线窗口（RUILI_SMOKE=1） */
const isSmoke = process.env.RUILI_SMOKE === '1'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 940,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#F2F3F5',
    title: '锐流RPA',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win
  win.on('ready-to-show', () => {
    win.show()
  })

  // 冒烟模式：首屏渲染后截图 smoke.png，随后退出（验证"用户真正看到的层"）
  win.webContents.once('did-finish-load', async () => {
    if (!isSmoke) return
    // 可选：截指定路由（HashRouter），如 RUILI_SMOKE_ROUTE=/editor
    const route = process.env.RUILI_SMOKE_ROUTE
    if (route) {
      await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(route)}`)
      await new Promise((resolve) => setTimeout(resolve, 1200))
    }
    await new Promise((resolve) => setTimeout(resolve, 800))
    try {
      const image = await win.webContents.capturePage()
      const out = route
        ? join(
            process.cwd(),
            '.runtime',
            `smoke-${route.replace(/[\\/?&=:#]/g, '_')}.png`
          )
        : join(process.cwd(), 'smoke.png')
      await writeFile(out, image.toPNG())
      console.log(`SMOKE_SHOT_SAVED ${out}`)
    } catch (err) {
      console.error('SMOKE_SHOT_FAILED', err)
    } finally {
      setTimeout(() => app.quit(), 500)
    }
  })

  // 外部链接一律交给系统浏览器，不在应用内开新窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 开发模式加载 vite dev server，生产加载构建产物
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/* ---------- 标题栏窗口控制 IPC ---------- */
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

/* ---------- 流程运行（阶段 4）：RunManager 事件流 → 渲染端 ---------- */
let mainWindow: BrowserWindow | null = null

/** 本次运行归属的流程 id（renderer 调 run:start 时透传；内置流程为 null） */
let currentFlowId: string | null = null
/** 运行期日志缓冲，flow-end 时批量落 logs 表 */
let runLog: { flowId: string | null; runId: string; entries: RunLogEntry[] } | null = null

function broadcast(event: RunWireEvent): void {
  // 收集运行日志并在 flow-end 落 SQLite（M2 切片 3）
  if (event.type === 'flow-start') {
    runLog = { flowId: currentFlowId, runId: randomUUID(), entries: [] }
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
    runLog = null
  }
  mainWindow?.webContents.send('run:event', event)
}

const runManager = new RunManager(broadcast)

ipcMain.handle('run:start', (_e, flow: FlowDoc, flowId?: string) => {
  try {
    currentFlowId = flowId ?? null
    runManager.start(flow)
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
    // 真实浏览器 + Excel 端到端；给 60s 整体超时保险，到时协作式停止
    runManager.start(M1_E2E_FLOW, { timeoutMs: 60_000 })
    return { ok: true as const }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
})

/* ---------- LLM（阶段 4）：apiKey 留在主进程，渲染端只传 prompt ---------- */
// Provider 配置默认值（决策⑤：可被环境变量覆盖；apiKey 不入包）
const llmClient = new LlmClient([
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
])

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

/* ---------- 指令目录（M2）：渲染端拿 UI 元数据（runner 函数会被 IPC 丢弃） ---------- */
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

/* ---------- 流程持久化（M2 切片 2）：better-sqlite3，apps/flows/logs 三表 ---------- */
ipcMain.handle('flow:list', () => listFlows())
ipcMain.handle('flow:load', (_e, id: string) => loadFlow(id))
ipcMain.handle('flow:save', (_e, flow: FlowDoc, existingId?: string) =>
  saveFlow(flow, existingId)
)
ipcMain.handle('flow:delete', (_e, id: string) => deleteFlow(id))

/* ---------- 桌面元素拾取（M3 切片 1/2）：Python sidecar 桥 ---------- */
const pickController = new PickController(() => mainWindow)
ipcMain.handle('pick:start', async () => {
  const reply = await pickController.start()
  // M3 切片 2：拾取成功自动入库（元素库），reply 带元素库 id（向后兼容）
  if (reply.ok && 'element' in reply) {
    const saved = saveElement(reply.element)
    if (saved.ok) {
      return { ...reply, elementId: saved.id }
    }
  }
  return reply
})
ipcMain.handle('pick:stop', () => pickController.stop())

/* ---------- 元素库（M3 切片 2/3）：picked 元素持久化 + dry-run 校验 ---------- */
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

/* ---------- 桌面智能录制（M3 切片 3）：观察式录制 → 指令序列 ---------- */
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
    return { ok: false, error: r.error ?? '无法获取窗口进程 PID' }
  }
  return { ok: true, pid: r.pid, title: reply.element.windowTitle ?? reply.element.name ?? '' }
})

/* ---------- M4 切片 1：数据抓取向导——在已开页面里识别相似列表项 ---------- */
ipcMain.handle('scrape:inspect', (_e, sampleSelector: string) => inspectForWizard(sampleSelector))
ipcMain.handle('web-pick:start', (_e, timeoutMs?: number) => startWebPick(timeoutMs))

/* ---------- 设置（M3 切片 12）：录制聚合阈值持久化 ---------- */
ipcMain.handle('settings:get-record-thresholds', () => loadRecordThresholds())
ipcMain.handle('settings:set-record-thresholds', (_e, raw: unknown) =>
  saveRecordThresholds(raw)
)

/* ---------- M3 切片 18：置前台后短延时开关（默认关） ---------- */
ipcMain.handle('settings:get-foreground-delay-ms', () => loadForegroundDelayMs())
ipcMain.handle('settings:set-foreground-delay-ms', async (_e, raw: unknown) => {
  const r = saveForegroundDelayMs(raw)
  // sidecar 已在跑就实时推送；未在跑则下次 ensureSidecar 启动时推
  if (r.ok) {
    try {
      const c = await ensureSidecar()
      await c.setDesktopConfig({ foregroundDelayMs: loadForegroundDelayMs() })
    } catch {
      /* 未起 sidecar 时忽略 */
    }
  }
  return r
})

app.whenReady().then(() => {
  // 数据库落在 userData 下（Electron 提供的跨版本稳定用户目录）
  openDb(join(app.getPath('userData'), 'ruili.db'))
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  pickController.dispose()
  disposeSidecar()
  if (process.platform !== 'darwin') app.quit()
})
