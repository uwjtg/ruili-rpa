/**
 * 数据库指令组（M7-33）：连接 SQLite / MySQL 并执行查询。
 *
 * 设计与 web/excel 会话一致：指令依赖薄接口 DbLike，真正的驱动在工厂里懒加载，
 * 这样 vitest（node 无网络、不连真库）可以注入假 DbLike 单测；Electron 运行时才 require。
 *
 * 驱动：
 *  - sqlite：复用已装的 better-sqlite3（本地库，零新依赖）。
 *  - mysql：懒 require('mysql2/promise')（纯 JS，未装时给出友好提示）。
 *  - PostgreSQL / SQL Server 暂未接（README 已知限制登记）。
 *
 * 清单（4 条）：dbConnect / dbQuery / dbExecute / dbClose。
 */
import type { RegisteredCommand } from './registry'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

/** 数据库连接薄接口（测试可注入假实现） */
export interface DbLike {
  query(sql: string, params: unknown[]): Promise<Array<Record<string, unknown>>>
  execute(
    sql: string,
    params: unknown[]
  ): Promise<{ changes: number; lastInsertRowid?: unknown }>
  close(): Promise<void>
}

export interface DbConnectConfig {
  provider: 'sqlite' | 'mysql'
  /** sqlite：数据库文件路径，空串=:memory: */
  path?: string
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
}

type DriverFactory = (cfg: DbConnectConfig) => Promise<DbLike>

let current: DbLike | null = null
let driverFactory: DriverFactory | null = null

/** 测试/外部注入驱动工厂；同时清空当前连接。 */
export function setDbDriverProvider(f: DriverFactory | null): void {
  driverFactory = f
  current = null
}

/** 关闭当前连接；返回是否真的关了一个。供 RunManager 运行结束统一释放。 */
export async function closeDb(): Promise<boolean> {
  if (!current) return false
  try {
    await current.close()
    return true
  } finally {
    current = null
  }
}

/** 当前是否已连接（未连接的 query/execute 抛错） */
function requireDb(): DbLike {
  if (!current) throw new Error('尚未连接数据库：请先用「数据库连接」指令')
  return current
}

// ---------- 真实驱动适配（懒加载，不在顶层 import） ----------

function sqliteAdapter(db: {
  prepare(sql: string): {
    bind(...a: unknown[]): { all(): unknown[]; run(): { changes: number; lastInsertRowid: unknown } }
    all(...a: unknown[]): unknown[]
    run(...a: unknown[]): { changes: number; lastInsertRowid: unknown }
  }
  close(): void
}): DbLike {
  return {
    async query(sql, params) {
      return db.prepare(sql).all(...(params as [])) as Array<Record<string, unknown>>
    },
    async execute(sql, params) {
      const r = db.prepare(sql).run(...(params as []))
      return { changes: r.changes, lastInsertRowid: r.lastInsertRowid }
    },
    async close() {
      db.close()
    }
  }
}

function mysqlAdapter(conn: {
  query(sql: string, params: unknown[]): Promise<[unknown[], unknown]>
  execute(sql: string, params: unknown[]): Promise<[{ affectedRows: number; insertId: unknown }]>
  end(): Promise<void>
}): DbLike {
  return {
    async query(sql, params) {
      const [rows] = await conn.query(sql, params)
      return rows as Array<Record<string, unknown>>
    },
    async execute(sql, params) {
      const [r] = await conn.execute(sql, params)
      return { changes: r.affectedRows, lastInsertRowid: r.insertId }
    },
    async close() {
      await conn.end()
    }
  }
}

/** 默认工厂：运行时才 require 驱动，避免 vitest/Electron 打包期强依赖。 */
async function defaultFactory(cfg: DbConnectConfig): Promise<DbLike> {
  if (cfg.provider === 'sqlite') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    const db = new Database(cfg.path && cfg.path.trim() !== '' ? cfg.path.trim() : ':memory:')
    return sqliteAdapter(db)
  }
  if (cfg.provider === 'mysql') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mysql = require('mysql2/promise')
      const conn = await mysql.createConnection({
        host: cfg.host ?? '127.0.0.1',
        port: cfg.port ?? 3306,
        user: cfg.user ?? 'root',
        password: cfg.password ?? '',
        database: cfg.database ?? ''
      })
      return mysqlAdapter(conn)
    } catch (err) {
      if ((err as any)?.code === 'MODULE_NOT_FOUND') {
        throw new Error('MySQL 驱动未安装：请先在项目目录执行 npm i mysql2')
      }
      throw err
    }
  }
  throw new Error(`不支持的数据库类型：${cfg.provider}`)
}

export interface DbCommandsDeps {
  factory?: DriverFactory
}

export function registerDbCommands(registry: RegistryLike, deps: DbCommandsDeps = {}): void {
  const factory = deps.factory ?? driverFactory ?? defaultFactory

  // ---------- 连接 ----------
  registry.register({
    id: 'dbConnect',
    name: '数据库连接',
    group: '数据库',
    icon: 'database',
    params: [
      {
        key: 'provider',
        label: '数据库类型',
        type: 'select',
        default: 'sqlite',
        options: [
          { value: 'sqlite', label: 'SQLite（本地文件）' },
          { value: 'mysql', label: 'MySQL / MariaDB' }
        ]
      },
      { key: 'path', label: 'SQLite 文件路径（留空=内存库）', type: 'text', placeholder: 'C:/data/app.db' },
      { key: 'host', label: 'MySQL 主机', type: 'text', placeholder: '127.0.0.1' },
      { key: 'port', label: 'MySQL 端口', type: 'number', default: 3306 },
      { key: 'user', label: 'MySQL 用户', type: 'text', placeholder: 'root' },
      { key: 'password', label: 'MySQL 密码', type: 'text', placeholder: '••••' },
      { key: 'database', label: 'MySQL 数据库名', type: 'text' }
    ],
    summary: (p) => `连接 ${str(p.provider)}`,
    runner: async (ctx, p) => {
      await closeDb()
      const cfg: DbConnectConfig = {
        provider: (str(p.provider) || 'sqlite') as 'sqlite' | 'mysql',
        path: ctx.interpolate(str(p.path)),
        host: ctx.interpolate(str(p.host)),
        port: Number(p.port) || 3306,
        user: ctx.interpolate(str(p.user)),
        password: ctx.interpolate(str(p.password)),
        database: ctx.interpolate(str(p.database))
      }
      current = await factory(cfg)
      ctx.log('success', `已连接数据库（${cfg.provider}）`)
      return { ok: true, provider: cfg.provider }
    }
  })

  // ---------- 查询 ----------
  registry.register({
    id: 'dbQuery',
    name: '数据库查询（SELECT）',
    group: '数据库',
    icon: 'search',
    params: [
      { key: 'sql', label: 'SQL 语句', type: 'text', placeholder: 'SELECT * FROM users WHERE id = ?' },
      { key: 'resultVar', label: '结果存入变量', type: 'text', default: 'rows' }
    ],
    summary: (p) => `查询 ${str(p.sql).slice(0, 30)}`,
    runner: async (ctx, p) => {
      const db = requireDb()
      const sql = ctx.interpolate(str(p.sql))
      const rows = await db.query(sql, [])
      const varName = str(p.resultVar) || 'rows'
      ctx.setVar(varName, rows)
      ctx.log('success', `查询到 ${rows.length} 行 → ${varName}`)
      return rows
    }
  })

  // ---------- 写 ----------
  registry.register({
    id: 'dbExecute',
    name: '数据库执行（INSERT/UPDATE/DDL）',
    group: '数据库',
    icon: 'play',
    params: [{ key: 'sql', label: 'SQL 语句', type: 'text' }],
    summary: (p) => `执行 ${str(p.sql).slice(0, 30)}`,
    runner: async (ctx, p) => {
      const db = requireDb()
      const sql = ctx.interpolate(str(p.sql))
      const r = await db.execute(sql, [])
      ctx.log('success', `影响 ${r.changes} 行`)
      return r
    }
  })

  // ---------- 关闭 ----------
  registry.register({
    id: 'dbClose',
    name: '关闭数据库连接',
    group: '数据库',
    icon: 'close',
    params: [],
    summary: () => '关闭数据库',
    runner: async (ctx) => {
      const closed = await closeDb()
      ctx.log(closed ? 'success' : 'warn', closed ? '已关闭数据库连接' : '当前无数据库连接')
      return { closed }
    }
  })
}
