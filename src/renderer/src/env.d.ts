/// <reference types="vite/client" />

import type { RunWireEvent } from '../../shared/run-protocol'
import type { FlowDoc } from '../../shared/ast'
import type { CmdMeta } from '../../shared/cmd-schema'
import type { PickReply, PickStopReply } from '../../shared/desktop-pick'
import type {
  RecordStartReply,
  RecordStopReply
} from '../../shared/desktop-record'
import type {
  DeleteReply,
  FlowSummary,
  ListReply,
  LoadReply,
  SaveReply
} from '../../shared/flow-protocol'
import type {
  ElementsDeleteReply,
  ElementsListReply
} from '../../shared/elements'
import type { RecordThresholds } from '../../shared/record-settings'
import type { ScrapeInspectResult } from '../../shared/scrape/spec'

/**
 * preload 暴露的桥接 API 类型声明。
 * 注意：与 src/preload/index.ts 的 api 结构保持同步。
 */
declare global {
  interface Window {
    ruili?: {
      platform: string
      appVersion: string
      versions: {
        electron: string
        chrome: string
        node: string
      }
      win: {
        minimize: () => void
        maximize: () => void
        close: () => void
      }
      run: {
        start: (flow: FlowDoc, flowId?: string) => Promise<{ ok: boolean; error?: string }>
        startDemo: () => Promise<{ ok: boolean; error?: string }>
        startM1E2E: () => Promise<{ ok: boolean; error?: string }>
        resume: () => void
        stop: () => void
        step: () => void
        onEvent: (cb: (e: RunWireEvent) => void) => () => void
        onEndMeta: (cb: (m: { runId: string; status: string }) => void) => () => void
      }
      llm: {
        listProviders: () => Promise<{ active: string; providers: string[] }>
        setProvider: (name: string) => Promise<{ ok: boolean; active: string }>
        generateFlow: (
          prompt: string
        ) => Promise<{ ok: boolean; flow?: FlowDoc; error?: string }>
        getConfig: () => Promise<{
          active: string
          providers: Array<{ name: string; baseURL: string; model: string; hasApiKey: boolean }>
        }>
        saveConfig: (input: {
          active: string
          providers: Array<{ name: string; baseURL: string; model: string; apiKey?: string }>
        }) => Promise<{ ok: boolean; active?: string; error?: string }>
        test: () => Promise<{ ok: boolean; model?: string; error?: string }>
        explainError: (runId: string) => Promise<{ ok: boolean; explanation?: string; error?: string }>
      }
      mail: {
        getAccount: () => Promise<{
          hasAccount: boolean; host: string; port: number; secure: boolean
          user: string; from: string; hasPassword: boolean
        }>
        saveAccount: (input: {
          host: string; port?: number; secure?: boolean; user: string; from?: string; pass?: string
        }) => Promise<{ ok: boolean; error?: string }>
      }
      registry: {
        list: () => Promise<Array<Omit<CmdMeta, 'summary'>>>
      }
      flow: {
        save: (flow: FlowDoc, existingId?: string) => Promise<SaveReply>
        list: () => Promise<ListReply>
        load: (id: string) => Promise<LoadReply>
        delete: (id: string) => Promise<DeleteReply>
        exportFlow: (id: string) => Promise<{ ok: true; path: string } | { ok: false; error: string }>
        importFlow: () => Promise<{ ok: true; flow: FlowDoc } | { ok: false; error: string }>
      }
      pick: {
        start: () => Promise<PickReply>
        stop: () => Promise<PickStopReply>
        onResult: (cb: (r: PickReply) => void) => () => void
      }
      elements: {
        list: () => Promise<ElementsListReply>
        delete: (id: string) => Promise<ElementsDeleteReply>
        verify: (
          id: string
        ) => Promise<{
          ok: boolean
          found?: boolean
          strategy?: string
          trace?: string[]
          error?: string
        }>
      }
      record: {
        pickTargetWindow: () => Promise<
          { ok: true; pid: number; title: string } | { ok: false; error: string }
        >
        start: (targetPid?: number, thresholds?: Partial<RecordThresholds>) => Promise<RecordStartReply>
        stop: () => Promise<RecordStopReply>
        onResult: (cb: (r: RecordStopReply) => void) => () => void
      }
      settings: {
        getRecordThresholds: () => Promise<RecordThresholds>
        setRecordThresholds: (raw: Partial<RecordThresholds>) => Promise<{ ok: boolean; updatedAt?: number; error?: string }>
        getForegroundDelayMs: () => Promise<number>
        setForegroundDelayMs: (ms: number) => Promise<{ ok: boolean; updatedAt?: number; error?: string }>
      }
      scrape: {
        inspect: (sampleSelector: string) => Promise<ScrapeInspectResult>
      }
      webPick: {
        start: (timeoutMs?: number) => Promise<{
          ok: boolean; cancelled?: boolean; selector?: string; tag?: string; text?: string; error?: string
        }>
      }
      webRecord: {
        start: () => Promise<{ ok: boolean; error?: string }>
        stop: () => Promise<{
          ok: boolean; error?: string
          events?: Array<{ type: 'click' | 'fill' | 'scroll' | 'key'; selector?: string; value?: string; deltaY?: number; key?: string }>
        }>
      }
      tasks: {
        list: () => Promise<
          | { ok: true; items: TaskSummary[] }
          | { ok: false; error: string }
        >
        create: (input: {
          flowId: string
          name: string
          triggerType: 'cron' | 'interval' | 'hotkey' | 'file'
          cronExpr?: string
          intervalMs?: number
          hotkey?: string
          watchPath?: string
        }) => Promise<{ ok: true; task: TaskSummary } | { ok: false; error: string }>
        toggle: (id: string, on: boolean) => Promise<{ ok: true } | { ok: false; error: string }>
        remove: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>
      }
      runs: {
        history: (limit?: number) => Promise<{ ok: true; items: RunHistoryItem[] } | { ok: false; error: string }>
        entries: (runId: string) => Promise<{ ok: true; items: RunLogEntryRow[] } | { ok: false; error: string }>
        clear: () => Promise<{ ok: true } | { ok: false; error: string }>
      }
      crash: {
        report: (message: string, stack?: string) => void
        openLog: () => Promise<{ ok: boolean; path?: string; error?: string }>
      }
      app: {
        onOpenFlow: (cb: (m: { flowId: string; name?: string }) => void) => () => void
      }
      updater: {
        check: () => Promise<{ ok: boolean }>
        quitAndInstall: () => Promise<{ ok: boolean }>
        onStatus: (
          cb: (s: {
            status: 'checking' | 'available' | 'downloading' | 'not-available' | 'downloaded' | 'error'
            version?: string
            percent?: number
            message?: string
            releaseNotes?: string
          }) => void
        ) => () => void
      }
    }
  }
}

/** 执行记录摘要（M5-3 RobotsView） */
interface RunHistoryItem {
  runId: string
  flowId: string | null
  flowName: string | null
  status: string
  durationMs: number | null
  startedAt: number
  endedAt: number
  entryCount: number
}

/** 单条运行日志明细 */
interface RunLogEntryRow {
  level: string
  message: string
  ts: number
}

/** 计划任务摘要（与 preload TaskSummary 对齐，M5 调度切片） */
interface TaskSummary {
  id: string
  flowId: string
  name: string
  triggerType: 'cron' | 'interval'
  cronExpr: string
  intervalMs: number
  enabled: boolean
  lastRunAt: number | null
  nextRunAt: number | null
  runCount: number
  hotkey: string
  watchPath: string
}
