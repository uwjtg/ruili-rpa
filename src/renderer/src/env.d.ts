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
      }
      llm: {
        listProviders: () => Promise<{ active: string; providers: string[] }>
        setProvider: (name: string) => Promise<{ ok: boolean; active: string }>
        generateFlow: (
          prompt: string
        ) => Promise<{ ok: boolean; flow?: FlowDoc; error?: string }>
      }
      registry: {
        list: () => Promise<Array<Omit<CmdMeta, 'summary'>>>
      }
      flow: {
        save: (flow: FlowDoc, existingId?: string) => Promise<SaveReply>
        list: () => Promise<ListReply>
        load: (id: string) => Promise<LoadReply>
        delete: (id: string) => Promise<DeleteReply>
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
    }
  }
}
