/**
 * 流程持久化 IPC 协议（M2 切片 2）。
 *
 * 主进程（better-sqlite3）↔ 渲染端（编辑器/应用视图）共用的可序列化形状。
 * 与 src/shared/run-protocol.ts 同级；不含 runner/summary 等不可过 IPC 的函数。
 */
import type { FlowDoc } from './ast'

/** 一条流程的摘要（应用卡片/标签列表用，不含完整 doc） */
export interface FlowSummary {
  id: string
  name: string
  stepCount: number
  createdAt: number
  updatedAt: number
}

export type SaveReply =
  | { ok: true; id: string; updatedAt: number }
  | { ok: false; error: string }

export type LoadReply = { ok: true; flow: FlowDoc } | { ok: false; error: string }

export type ListReply =
  | { ok: true; items: FlowSummary[] }
  | { ok: false; error: string }

export type DeleteReply = { ok: true } | { ok: false; error: string }
