/**
 * 元素库（M3 切片 2）跨进程契约。
 *
 * 拾取成功的元素由主进程自动落 SQLite elements 表（去重：同一
 * windowHandle|automationId|name|controlType 视为同一元素，重复拾取 upsert）。
 * 编辑器「元素」页签经 elements:list 拉取，点击「插入步骤」把元素写为一条
 * pickElement 步骤的 target（回放走选择器回退链）。
 */

import type { PickedElement } from './desktop-pick'

/** 元素库中的一条记录（列表展示 + 回放 target 来源） */
export interface ElementRecord {
  /** 元素库主键（SQLite id） */
  id: string
  /** 展示名：name || automationId || controlType || 未命名元素 */
  label: string
  /** 完整拾取签名（= PickedElement，回放时直接作为 target） */
  signature: PickedElement
  createdAt: number
  updatedAt: number
}

export type ElementsSaveReply =
  | { ok: true; id: string; updatedAt: number }
  | { ok: false; error: string }

export type ElementsListReply =
  | { ok: true; items: ElementRecord[] }
  | { ok: false; error: string }

export type ElementsDeleteReply = { ok: true } | { ok: false; error: string }
