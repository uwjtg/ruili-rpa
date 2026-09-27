/**
 * 主进程 SQLite 存储（M2 切片 2 持久化）。
 *
 * 选型：better-sqlite3（MIT，计划书 §4.1「本地存储」锁定）。
 * v13 使用 Node-API（prebuilds/*.node），Node 与 Electron 共用同一二进制，无需 @electron/rebuild。
 *
 * 表设计（计划书 §4.1：应用 / 流程 / 日志）：
 *  - apps：应用元信息（卡片网格用）
 *  - flows：流程完整 FlowDoc（doc 列存 JSON 字符串）
 *  - logs：运行日志（M2 切片 2 建表，运行落盘后续切片填充）
 *
 * 本模块不 import electron，便于 vitest 直接用临时文件跑 CRUD 单测；
 * 主进程在 whenReady 后把 userData 路径传入 openDb()。
 */
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { FlowDoc } from '../../shared/ast'
import type {
  DeleteReply,
  FlowSummary,
  ListReply,
  LoadReply,
  SaveReply
} from '../../shared/flow-protocol'
import type { PickedElement } from '../../shared/desktop-pick'
import type {
  ElementRecord,
  ElementsDeleteReply,
  ElementsListReply,
  ElementsSaveReply
} from '../../shared/elements'
import {
  RECORD_THRESHOLD_DEFAULTS,
  mergeRecordThresholds,
  sanitizeRecordThresholds
} from '../../shared/record-settings'
import type { RecordThresholds } from '../../shared/record-settings'

export type {
  DeleteReply,
  FlowSummary,
  ListReply,
  LoadReply,
  SaveReply
} from '../../shared/flow-protocol'

type DB = Database.Database

let db: DB | null = null

/** 打开（或复用）数据库；幂等。path 缺省放内存（仅测试用）。 */
export function openDb(path?: string): DB {
  if (db) return db
  db = new Database(path ?? ':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

/** 关闭并重置单例（测试用） */
export function closeDb(): void {
  db?.close()
  db = null
}

function requireDb(): DB {
  if (!db) throw new Error('数据库未初始化：先 openDb()')
  return db
}

function migrate(d: DB): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      icon        TEXT DEFAULT 'app',
      color       TEXT DEFAULT '#7C5CFC',
      step_count  INTEGER DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS flows (
      id          TEXT PRIMARY KEY,
      app_id      TEXT NOT NULL,
      name        TEXT NOT NULL,
      doc         TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_flows_app ON flows(app_id);
    CREATE TABLE IF NOT EXISTS logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_id      TEXT,
      run_id       TEXT,
      level        TEXT NOT NULL,
      message      TEXT NOT NULL,
      status       TEXT,
      duration_ms  INTEGER,
      ts           INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_flow ON logs(flow_id);
    CREATE TABLE IF NOT EXISTS elements (
      id            TEXT PRIMARY KEY,
      label         TEXT NOT NULL,
      window_handle INTEGER NOT NULL,
      automation_id TEXT DEFAULT '',
      name          TEXT DEFAULT '',
      control_type  TEXT DEFAULT '',
      signature     TEXT NOT NULL,
      dedupe_key    TEXT NOT NULL UNIQUE,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_elements_updated ON elements(updated_at);
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id           TEXT PRIMARY KEY,
      flow_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      trigger_type TEXT NOT NULL,            -- 'cron' | 'interval'
      cron_expr    TEXT DEFAULT '',          -- trigger_type=cron 时 5/6 段 cron
      interval_ms  INTEGER DEFAULT 0,        -- trigger_type=interval 时每多少毫秒
      enabled      INTEGER NOT NULL DEFAULT 1,
      last_run_at  INTEGER,
      next_run_at  INTEGER,
      run_count    INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_flow ON tasks(flow_id);
  `)
  // M5-4 热键触发器：旧库补列（CREATE TABLE IF NOT EXISTS 不会改已有表结构）
  const taskCols = (d.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((x) => x.name)
  if (!taskCols.includes('hotkey')) {
    d.exec("ALTER TABLE tasks ADD COLUMN hotkey TEXT DEFAULT ''")
  }
  if (!taskCols.includes('watch_path')) {
    d.exec("ALTER TABLE tasks ADD COLUMN watch_path TEXT DEFAULT ''")
  }
}

function countSteps(flow: FlowDoc): number {
  let n = 0
  for (const s of flow.steps) {
    n += 1
    if (s.children) n += countSteps({ ...flow, steps: s.children })
  }
  return n
}

/** 保存（新建或按 id 更新）；同一 id 同步 upsert 一条 apps 元信息（1:1）。 */
export function saveFlow(flow: FlowDoc, existingId?: string): SaveReply {
  try {
    const d = requireDb()
    const now = Date.now()
    const id = existingId || randomUUID()
    const stepCount = countSteps(flow)
    const docJson = JSON.stringify(flow)

    const upsertApp = d.prepare(
      `INSERT INTO apps (id, name, description, icon, color, step_count, created_at, updated_at)
       VALUES (@id, @name, '', 'app', '#7C5CFC', @stepCount, @now, @now)
       ON CONFLICT(id) DO UPDATE SET
         name = @name, step_count = @stepCount, updated_at = @now`
    )
    const upsertFlow = d.prepare(
      `INSERT INTO flows (id, app_id, name, doc, created_at, updated_at)
       VALUES (@id, @id, @name, @doc, @now, @now)
       ON CONFLICT(id) DO UPDATE SET
         name = @name, doc = @doc, updated_at = @now`
    )

    const tx = d.transaction(() => {
      upsertApp.run({ id, name: flow.name, stepCount, now })
      upsertFlow.run({ id, name: flow.name, doc: docJson, now })
    })
    tx()
    return { ok: true, id, updatedAt: now }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 列出全部流程（按最近编辑倒序）。 */
export function listFlows(): ListReply {
  try {
    const d = requireDb()
    const rows = d
      .prepare(
        `SELECT id, name, created_at, updated_at FROM flows ORDER BY updated_at DESC, rowid DESC`
      )
      .all() as Array<{ id: string; name: string; created_at: number; updated_at: number }>
    const out: FlowSummary[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      // stepCount 冗余存于 apps.step_count
      stepCount: (
        d.prepare('SELECT step_count FROM apps WHERE id = ?').get(r.id) as
          | { step_count: number }
          | undefined
      )?.step_count ?? 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }))
    return { ok: true, items: out }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 按 id 加载完整 FlowDoc。 */
export function loadFlow(id: string): LoadReply {
  try {
    const d = requireDb()
    const row = d
      .prepare('SELECT doc FROM flows WHERE id = ?')
      .get(id) as { doc: string } | undefined
    if (!row) return { ok: false, error: `流程不存在：${id}` }
    return { ok: true, flow: JSON.parse(row.doc) as FlowDoc }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 删除流程（级联删其 apps 元信息与 logs）。 */
export function deleteFlow(id: string): DeleteReply {
  try {
    const d = requireDb()
    const tx = d.transaction(() => {
      d.prepare('DELETE FROM logs WHERE flow_id = ?').run(id)
      d.prepare('DELETE FROM flows WHERE id = ?').run(id)
      d.prepare('DELETE FROM apps WHERE id = ?').run(id)
    })
    tx()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 元素库（M3 切片 2）：拾取成功的元素自动入库；同一签名去重 upsert。 */

function elementDedupeKey(sig: PickedElement): string {
  return [sig.windowHandle, sig.automationId, sig.name, sig.controlType].join('|')
}

/** 元素库展示名：name || automationId || controlType || 未命名元素 */
export function elementLabel(sig: PickedElement): string {
  return sig.name || sig.automationId || sig.controlType || '未命名元素'
}

/** 保存元素（新建或按签名去重更新）；返回元素库 id 与时间戳。 */
export function saveElement(
  sig: PickedElement
): ElementsSaveReply {
  try {
    const d = requireDb()
    const now = Date.now()
    const id = randomUUID()
    const key = elementDedupeKey(sig)
    const label = elementLabel(sig)
    const sigJson = JSON.stringify(sig)
    const upsert = d.prepare(
      `INSERT INTO elements (id, label, window_handle, automation_id, name, control_type, signature, dedupe_key, created_at, updated_at)
       VALUES (@id, @label, @handle, @aid, @name, @ctype, @sig, @key, @now, @now)
       ON CONFLICT(dedupe_key) DO UPDATE SET
         label = @label, signature = @sig, updated_at = @now`
    )
    upsert.run({
      id,
      label,
      handle: sig.windowHandle,
      aid: sig.automationId ?? '',
      name: sig.name ?? '',
      ctype: sig.controlType ?? '',
      sig: sigJson,
      key,
      now
    })
    // upsert 后取实际 id（去重命中时保持原 id）
    const row = d
      .prepare('SELECT id, updated_at FROM elements WHERE dedupe_key = ?')
      .get(key) as { id: string; updated_at: number } | undefined
    return { ok: true, id: row?.id ?? id, updatedAt: row?.updated_at ?? now }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 列出全部元素（按最近拾取倒序）。 */
export function listElements(): ElementsListReply {
  try {
    const d = requireDb()
    const rows = d
      .prepare(
        'SELECT id, label, signature, created_at, updated_at FROM elements ORDER BY updated_at DESC, rowid DESC'
      )
      .all() as Array<{
      id: string
      label: string
      signature: string
      created_at: number
      updated_at: number
    }>
    const items: ElementRecord[] = rows.map((r) => ({
      id: r.id,
      label: r.label,
      signature: JSON.parse(r.signature) as PickedElement,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }))
    return { ok: true, items }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 删除一条元素库记录。 */
export function deleteElement(id: string): ElementsDeleteReply {
  try {
    const d = requireDb()
    d.prepare('DELETE FROM elements WHERE id = ?').run(id)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 按 id 取一条元素库记录（元素库「校验」用；M3 切片 3）。 */
export function getElement(
  id: string
): { ok: true; element: ElementRecord } | { ok: false; error: string } {
  try {
    const d = requireDb()
    const row = d
      .prepare(
        'SELECT id, label, signature, created_at, updated_at FROM elements WHERE id = ?'
      )
      .get(id) as
      | {
          id: string
          label: string
          signature: string
          created_at: number
          updated_at: number
        }
      | undefined
    if (!row) return { ok: false, error: `元素不存在：${id}` }
    return {
      ok: true,
      element: {
        id: row.id,
        label: row.label,
        signature: JSON.parse(row.signature) as PickedElement,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 一条待落盘的运行日志行（主进程 run 结束时批量写入） */
export interface RunLogEntry {
  level: string
  message: string
  ts: number
}

/**
 * 一次运行结束时批量落盘日志（M2 切片 3）。
 * flowId 可能为 null（未保存流程临时跑）；status / durationMs 来自 flow-end 结果。
 */
export function appendRunLog(
  flowId: string | null,
  runId: string,
  entries: RunLogEntry[],
  status: string,
  durationMs: number
): { ok: true } | { ok: false; error: string } {
  try {
    const d = requireDb()
    const insert = d.prepare(
      `INSERT INTO logs (flow_id, run_id, level, message, status, duration_ms, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    const tx = d.transaction(() => {
      for (const e of entries) {
        insert.run(flowId, runId, e.level, e.message, status, durationMs, e.ts)
      }
    })
    tx()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 一次运行的历史摘要（按 run_id 聚合，M5-3 RobotsView）。 */
export interface RunHistoryItem {
  runId: string
  flowId: string | null
  flowName: string | null
  status: string
  durationMs: number | null
  startedAt: number
  endedAt: number
  entryCount: number
}

/** 一条运行日志明细。 */
export interface RunLogEntryRow {
  level: string
  message: string
  ts: number
}

/** 最近 N 次运行记录（按结束时间倒序）。 */
export function listRunHistory(
  limit = 100
): { ok: true; items: RunHistoryItem[] } | { ok: false; error: string } {
  try {
    const d = requireDb()
    const rows = d
      .prepare(
        `SELECT l.run_id AS runId,
                l.flow_id AS flowId,
                f.name AS flowName,
                MAX(l.status) AS status,
                MAX(l.duration_ms) AS durationMs,
                MIN(l.ts) AS startedAt,
                MAX(l.ts) AS endedAt,
                COUNT(*) AS entryCount
         FROM logs l LEFT JOIN flows f ON f.id = l.flow_id
         GROUP BY l.run_id
         ORDER BY endedAt DESC
         LIMIT ?`
      )
      .all(limit) as RunHistoryItem[]
    return { ok: true, items: rows }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 某次运行的全部日志明细（按时间正序）。 */
export function listRunEntries(
  runId: string
): { ok: true; items: RunLogEntryRow[] } | { ok: false; error: string } {
  try {
    const d = requireDb()
    const rows = d
      .prepare(
        'SELECT level, message, ts FROM logs WHERE run_id = ? ORDER BY ts ASC, id ASC'
      )
      .all(runId) as RunLogEntryRow[]
    return { ok: true, items: rows }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 清空全部运行日志（M5-8 RobotsView）。 */
export function clearRunHistory(): { ok: true } | { ok: false; error: string } {
  try {
    requireDb().prepare('DELETE FROM logs').run()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 录制聚合阈值落盘的 settings 键（M3 切片 12）。 */
const SETTINGS_KEY_RECORD_THRESHOLDS = 'record.thresholds'

/** 读一条设置（原始 JSON 字符串；不存在返回 null）。 */
function getSetting(key: string): string | null {
  const d = requireDb()
  const row = d.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

/** 写一条设置（upsert）。 */
function setSetting(key: string, value: string): void {
  const d = requireDb()
  d.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, Date.now())
}

/**
 * 读取持久化的录制聚合阈值（M3 切片 12）。
 * 不存在/损坏时回退全量默认值；总是返回完整 RecordThresholds。
 */
export function loadRecordThresholds(): RecordThresholds {
  try {
    const raw = getSetting(SETTINGS_KEY_RECORD_THRESHOLDS)
    if (raw === null) return { ...RECORD_THRESHOLD_DEFAULTS }
    const parsed: unknown = JSON.parse(raw)
    return mergeRecordThresholds(RECORD_THRESHOLD_DEFAULTS, sanitizeRecordThresholds(parsed))
  } catch {
    return { ...RECORD_THRESHOLD_DEFAULTS }
  }
}

/** 保存录制聚合阈值：净化非法值后与现存量合并落盘。 */
export function saveRecordThresholds(
  raw: unknown
): { ok: true; updatedAt: number } | { ok: false; error: string } {
  try {
    const clean = sanitizeRecordThresholds(raw)
    const merged = mergeRecordThresholds(loadRecordThresholds(), clean)
    setSetting(SETTINGS_KEY_RECORD_THRESHOLDS, JSON.stringify(merged))
    return { ok: true, updatedAt: Date.now() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 置前台后短延时落盘的 settings 键（M3 切片 18，单位 ms，0=关闭）。 */
const SETTINGS_KEY_FOREGROUND_DELAY_MS = 'desktop.foregroundDelayMs'

/**
 * 读取「置前台后短延时」(ms, M3 切片 18)。缺省/损坏回 0（关闭）。
 * 与 sidecar set_foreground_delay_ms 同口径：非负整数，上限 10000。
 */
export function loadForegroundDelayMs(): number {
  try {
    const raw = getSetting(SETTINGS_KEY_FOREGROUND_DELAY_MS)
    if (raw === null) return 0
    const num = Number(raw)
    if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return 0
    return Math.min(10000, num)
  } catch {
    return 0
  }
}

/** 保存置前短延时：非法值归 0 落盘。 */
export function saveForegroundDelayMs(
  raw: unknown
): { ok: true; updatedAt: number } | { ok: false; error: string } {
  try {
    let num = typeof raw === 'number' ? raw : Number(String(raw))
    if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) num = 0
    num = Math.min(10000, num)
    setSetting(SETTINGS_KEY_FOREGROUND_DELAY_MS, String(num))
    return { ok: true, updatedAt: Date.now() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}


/* ---------- LLM 配置（M5-11）：settings 表存 JSON；apiKey 由主进程 safeStorage 加密后落盘 ---------- */

const SETTINGS_KEY_LLM_CONFIG = 'llm.config'

/** 一个 Provider 的落盘记录（apiKeyEnc 是 safeStorage 加密后的 base64；本模块不碰加密）。 */
export interface LlmProviderRecord {
  name: string
  baseURL: string
  model: string
  /** 已加密 apiKey（base64）；空串表示未设置 */
  apiKeyEnc: string
}

/** 整份 LLM 配置落盘记录。 */
export interface LlmConfigRecord {
  active: string
  providers: LlmProviderRecord[]
}

/** 读 LLM 配置；无记录返回 null（主进程回退环境变量默认）。 */
export function loadLlmConfig(): LlmConfigRecord | null {
  try {
    const raw = getSetting(SETTINGS_KEY_LLM_CONFIG)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<LlmConfigRecord>
    if (!parsed || !Array.isArray(parsed.providers) || parsed.providers.length === 0) return null
    const providers: LlmProviderRecord[] = parsed.providers.map((p) => ({
      name: String(p?.name ?? ''),
      baseURL: String(p?.baseURL ?? ''),
      model: String(p?.model ?? ''),
      apiKeyEnc: String(p?.apiKeyEnc ?? '')
    }))
    const active = providers.some((p) => p.name === parsed.active)
      ? String(parsed.active)
      : providers[0].name
    return { active, providers }
  } catch {
    return null
  }
}

/** 整份保存 LLM 配置（覆盖写）。 */
export function saveLlmConfig(cfg: LlmConfigRecord): { ok: true } | { ok: false; error: string } {
  try {
    setSetting(SETTINGS_KEY_LLM_CONFIG, JSON.stringify(cfg))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/* ---------- 邮件账号（M7-30）：settings 表存 JSON；密码由主进程 safeStorage 加密后落盘 ---------- */

const SETTINGS_KEY_MAIL_ACCOUNT = 'mail.account'

/** 一个发信/收信账号的落盘记录（passEnc 是 safeStorage 加密后的 base64；本模块不碰加密）。 */
export interface MailAccountRecord {
  host: string
  port: number
  secure: boolean
  user: string
  /** 已加密密码/授权码（base64）；空串表示未设置 */
  passEnc: string
  from: string
}

/** 读邮件账号；无记录返回 null。 */
export function loadMailAccount(): MailAccountRecord | null {
  try {
    const raw = getSetting(SETTINGS_KEY_MAIL_ACCOUNT)
    if (raw === null) return null
    const p = JSON.parse(raw) as Partial<MailAccountRecord>
    if (!p || !p.host || !p.user) return null
    return {
      host: String(p.host),
      port: Number(p.port ?? 465),
      secure: p.secure !== false,
      user: String(p.user),
      passEnc: String(p.passEnc ?? ''),
      from: String(p.from ?? p.user)
    }
  } catch {
    return null
  }
}

/** 保存邮件账号（覆盖写）。 */
export function saveMailAccount(rec: MailAccountRecord): { ok: true } | { ok: false; error: string } {
  try {
    setSetting(SETTINGS_KEY_MAIL_ACCOUNT, JSON.stringify(rec))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
/* ---------- 计划任务（M5 调度切片） ---------- */

/** 一条计划任务（跨进程传输形状） */
export interface TaskRecord {
  id: string
  flowId: string
  name: string
  triggerType: 'cron' | 'interval' | 'hotkey' | 'file'
  cronExpr: string
  intervalMs: number
  hotkey: string
  watchPath: string
  enabled: boolean
  lastRunAt: number | null
  nextRunAt: number | null
  runCount: number
  createdAt: number
  updatedAt: number
}

type TaskRow = {
  id: string; flow_id: string; name: string; trigger_type: string
  cron_expr: string; interval_ms: number; hotkey: string; watch_path: string; enabled: number
  last_run_at: number | null; next_run_at: number | null; run_count: number
  created_at: number; updated_at: number
}

function rowToTask(r: TaskRow): TaskRecord {
  return {
    id: r.id,
    flowId: r.flow_id,
    name: r.name,
    triggerType: r.trigger_type === 'interval' ? 'interval' : r.trigger_type === 'hotkey' ? 'hotkey' : 'cron',
    cronExpr: r.cron_expr,
    intervalMs: r.interval_ms,
    hotkey: r.hotkey ?? '',
    watchPath: r.watch_path ?? '',
    enabled: !!r.enabled,
    lastRunAt: r.last_run_at,
    nextRunAt: r.next_run_at,
    runCount: r.run_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** 新建任务；校验 trigger_type 与对应字段。 */
export function createTask(input: {
  flowId: string
  name: string
  triggerType: 'cron' | 'interval' | 'hotkey' | 'file'
  cronExpr?: string
  intervalMs?: number
  hotkey?: string
  watchPath?: string
}): { ok: true; task: TaskRecord } | { ok: false; error: string } {
  try {
    const d = requireDb()
    if (!input.flowId) return { ok: false, error: '未选择流程' }
    const flow = d.prepare('SELECT id FROM flows WHERE id = ?').get(input.flowId)
    if (!flow) return { ok: false, error: '流程不存在' }
    if (input.triggerType === 'cron' && !String(input.cronExpr || '').trim()) {
      return { ok: false, error: 'cron 表达式不能为空' }
    }
    if (input.triggerType === 'interval' && !(Number(input.intervalMs) > 0)) {
      return { ok: false, error: '间隔必须为正整数毫秒' }
    }
    if (input.triggerType === 'hotkey' && !String(input.hotkey || '').trim()) {
      return { ok: false, error: '快捷键不能为空（如 Control+Shift+R）' }
    }
    if (input.triggerType === 'file' && !String(input.watchPath || '').trim()) {
      return { ok: false, error: '监听目录不能为空' }
    }
    // M5-9 查重：同一加速器/同一监听目录不允许重复任务
    if (input.triggerType === 'hotkey') {
      const dup = d
        .prepare("SELECT name FROM tasks WHERE trigger_type='hotkey' AND hotkey = ? LIMIT 1")
        .get(String(input.hotkey).trim()) as { name: string } | undefined
      if (dup) return { ok: false, error: `快捷键已被任务「${dup.name}」占用` }
    }
    if (input.triggerType === 'file') {
      const dup = d
        .prepare("SELECT name FROM tasks WHERE trigger_type='file' AND watch_path = ? LIMIT 1")
        .get(String(input.watchPath).trim()) as { name: string } | undefined
      if (dup) return { ok: false, error: `目录已被任务「${dup.name}」监听` }
    }
    const now = Date.now()
    const id = randomUUID()
    d.prepare(
      `INSERT INTO tasks (id, flow_id, name, trigger_type, cron_expr, interval_ms, hotkey, watch_path, enabled, created_at, updated_at)
       VALUES (@id, @flowId, @name, @tt, @cron, @interval, @hk, @wp, 1, @now, @now)`
    ).run({
      id,
      flowId: input.flowId,
      name: input.name || '未命名任务',
      tt: input.triggerType,
      cron: input.triggerType === 'cron' ? String(input.cronExpr).trim() : '',
      interval: input.triggerType === 'interval' ? Math.max(1000, Number(input.intervalMs)) : 0,
      hk: input.triggerType === 'hotkey' ? String(input.hotkey).trim() : '',
      wp: input.triggerType === 'file' ? String(input.watchPath).trim() : '',
      now
    })
    const row = d.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow
    return { ok: true, task: rowToTask(row) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 列出全部任务（按最近更新倒序）。 */
export function listTasks(): { ok: true; items: TaskRecord[] } | { ok: false; error: string } {
  try {
    const d = requireDb()
    const rows = d
      .prepare('SELECT * FROM tasks ORDER BY updated_at DESC, rowid DESC')
      .all() as TaskRow[]
    return { ok: true, items: rows.map(rowToTask) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 列出启用中的任务（调度器启动/重载用）。 */
export function listEnabledTasks(): { ok: true; items: TaskRecord[] } | { ok: false; error: string } {
  try {
    const d = requireDb()
    const rows = d
      .prepare('SELECT * FROM tasks WHERE enabled = 1 ORDER BY updated_at DESC')
      .all() as TaskRow[]
    return { ok: true, items: rows.map(rowToTask) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 启停切换。 */
export function setTaskEnabled(id: string, enabled: boolean): { ok: true } | { ok: false; error: string } {
  try {
    requireDb().prepare('UPDATE tasks SET enabled = ?, updated_at = ? WHERE id = ?').run(
      enabled ? 1 : 0,
      Date.now(),
      id
    )
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 删除任务。 */
export function deleteTask(id: string): { ok: true } | { ok: false; error: string } {
  try {
    requireDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 任务触发后记录 last_run_at / run_count，并回写下一次触发时间。 */
export function markTaskRan(id: string, nextRunAt: number | null): void {
  try {
    const d = requireDb()
    d.prepare(
      'UPDATE tasks SET last_run_at = ?, run_count = run_count + 1, next_run_at = ?, updated_at = ? WHERE id = ?'
    ).run(Date.now(), nextRunAt, Date.now(), id)
  } catch {
    /* 调度记录失败不影响本次运行 */
  }
}

/** 跳过本次触发（互斥/loadFlow 缺失等）：只推进 next_run_at，不动 last_run_at 与 run_count。 */
export function markTaskTick(id: string, nextRunAt: number | null): void {
  try {
    const d = requireDb()
    d.prepare('UPDATE tasks SET next_run_at = ?, updated_at = ? WHERE id = ?').run(
      nextRunAt,
      Date.now(),
      id
    )
  } catch {
    /* 调度记录失败不影响本次 */
  }
}

