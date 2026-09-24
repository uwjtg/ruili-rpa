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
  `)
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

