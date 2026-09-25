import { contextBridge, ipcRenderer } from 'electron'
import type { FlowDoc } from '../shared/ast'
import type { RunWireEvent } from '../shared/run-protocol'
import type { CmdMeta } from '../shared/cmd-schema'
import type {
  DeleteReply,
  FlowSummary,
  ListReply,
  LoadReply,
  SaveReply
} from '../shared/flow-protocol'
import type { PickReply, PickStopReply } from '../shared/desktop-pick'
import type {
  RecordStartReply,
  RecordStopReply
} from '../shared/desktop-record'
import type {
  ElementsDeleteReply,
  ElementsListReply
} from '../shared/elements'
import type { RecordThresholds } from '../shared/record-settings'
import type { ScrapeInspectResult } from '../shared/scrape/spec'

/**
 * 暴露给渲染进程的桥接 API。
 * - 阶段 1：平台/版本信息、窗口控制。
 * - 阶段 4：流程运行控制（run:start/resume/stop）+ 事件订阅（run:event）+
 *   LLM 生成流程（llm:generate-flow，apiKey 不下发渲染端）。
 * - M2 切片 2：流程持久化（flow:save/list/load/delete，主进程 better-sqlite3）。
 * - M3 切片 1/2/3：桌面拾取（pick）、元素库（elements）、智能录制（record）。
 */
const api = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? ''
  },
  win: {
    minimize: (): void => ipcRenderer.send('win:minimize'),
    maximize: (): void => ipcRenderer.send('win:maximize'),
    close: (): void => ipcRenderer.send('win:close')
  },
  run: {
    start: (flow: FlowDoc, flowId?: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('run:start', flow, flowId),
    startDemo: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('run:start-demo'),
    /** 启动 M1 端到端流程：真实浏览器→抓取→写 Excel（主进程内置流程） */
    startM1E2E: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('run:start-m1'),
    resume: (): void => ipcRenderer.send('run:resume'),
    stop: (): void => ipcRenderer.send('run:stop'),
    /** 单步：跑一步后暂停（step-over） */
    step: (): void => ipcRenderer.send('run:step'),
    /** 订阅运行事件，返回取消订阅函数 */
    onEvent: (cb: (e: RunWireEvent) => void): (() => void) => {
      const listener = (_: unknown, e: RunWireEvent): void => cb(e)
      ipcRenderer.on('run:event', listener)
      return () => ipcRenderer.removeListener('run:event', listener)
    }
  },
  llm: {
    listProviders: (): Promise<{ active: string; providers: string[] }> =>
      ipcRenderer.invoke('llm:list-providers'),
    setProvider: (name: string): Promise<{ ok: boolean; active: string }> =>
      ipcRenderer.invoke('llm:set-provider', name),
    generateFlow: (
      prompt: string
    ): Promise<{ ok: boolean; flow?: FlowDoc; error?: string }> =>
      ipcRenderer.invoke('llm:generate-flow', prompt)
  },
  registry: {
    /** 拉取全部指令的 UI 元数据（runner/summary 函数已被 IPC 丢弃） */
    list: (): Promise<Array<Omit<CmdMeta, 'summary'>>> =>
      ipcRenderer.invoke('registry:list')
  },
  flow: {
    /** 新建（existingId 省略）或按 id 更新；返回落盘 id 与时间戳 */
    save: (flow: FlowDoc, existingId?: string): Promise<SaveReply> =>
      ipcRenderer.invoke('flow:save', flow, existingId),
    /** 全部流程摘要（按最近编辑倒序） */
    list: (): Promise<ListReply> => ipcRenderer.invoke('flow:list'),
    /** 按 id 加载完整 FlowDoc */
    load: (id: string): Promise<LoadReply> => ipcRenderer.invoke('flow:load', id),
    /** 删除流程（级联清 logs/apps） */
    delete: (id: string): Promise<DeleteReply> => ipcRenderer.invoke('flow:delete', id)
  },
  pick: {
    /** 进入桌面拾取模式；阻塞直到用户点击元素 / Esc 取消 / 失败 */
    start: (): Promise<PickReply> => ipcRenderer.invoke('pick:start'),
    /** 取消进行中的拾取 */
    stop: (): Promise<PickStopReply> => ipcRenderer.invoke('pick:stop'),
    /** 订阅拾取结果/取消/失败事件（与 start() 返回一致），返回取消订阅函数 */
    onResult: (cb: (r: PickReply) => void): (() => void) => {
      const listener = (_: unknown, r: PickReply): void => cb(r)
      ipcRenderer.on('pick:result', listener)
      return () => ipcRenderer.removeListener('pick:result', listener)
    }
  },
  /** 元素库（M3 切片 2/3）：picked 元素持久化；拾取/录制成功自动入库 */
  elements: {
    /** 全部元素（按最近拾取倒序） */
    list: (): Promise<ElementsListReply> => ipcRenderer.invoke('elements:list'),
    /** 删除一条元素 */
    delete: (id: string): Promise<ElementsDeleteReply> =>
      ipcRenderer.invoke('elements:delete', id),
    /** dry-run 校验：按回退链只定位不点击，返回命中策略与逐级定位报告（M3 切片 3/4） */
    verify: (
      id: string
    ): Promise<{
      ok: boolean
      found?: boolean
      strategy?: string
      trace?: string[]
      error?: string
    }> => ipcRenderer.invoke('elements:verify', id)
  },
  /** 桌面智能录制（M3 切片 3）：观察式录制 → 指令序列 */
  record: {
    /** 圈定录制目标窗口：点选目标窗口，返回其顶层进程 PID（M3 切片 6） */
    pickTargetWindow: (): Promise<
      { ok: true; pid: number; title: string } | { ok: false; error: string }
    > => ipcRenderer.invoke('record:pickTargetWindow'),
    /** 开启录制：sidecar 钩子就绪后立即返回；targetPid 圈定目标窗口进程（可选）；thresholds 聚合阈值（可选，未传键自动取 DB 设置，M3 切片 8/12） */
    start: (
      targetPid?: number,
      thresholds?: Partial<RecordThresholds>
    ): Promise<RecordStartReply> => ipcRenderer.invoke('record:start', targetPid, thresholds),
    /** 结束录制：返回聚合指令序列（元素已写入元素库） */
    stop: (): Promise<RecordStopReply> => ipcRenderer.invoke('record:stop'),
    /** 订阅录制结束事件（与 stop() 返回一致），返回取消订阅函数 */
    onResult: (cb: (r: RecordStopReply) => void): (() => void) => {
      const listener = (_: unknown, r: RecordStopReply): void => cb(r)
      ipcRenderer.on('record:result', listener)
      return () => ipcRenderer.removeListener('record:result', listener)
    }
  },
  /** 设置（M3 切片 12）：录制聚合阈值持久化；录制时自动带上，免去每次传参 */
  settings: {
    /** 读取持久化阈值（总是返回完整 RecordThresholds，缺省回退默认值） */
    getRecordThresholds: (): Promise<RecordThresholds> =>
      ipcRenderer.invoke('settings:get-record-thresholds'),
    /** 保存阈值（非法值净化后与现存量合并落盘） */
    setRecordThresholds: (raw: Partial<RecordThresholds>): Promise<{ ok: boolean; updatedAt?: number; error?: string }> =>
      ipcRenderer.invoke('settings:set-record-thresholds', raw),
    /** 读取置前台后短延时（ms，0=关闭；M3 切片 18） */
    getForegroundDelayMs: (): Promise<number> =>
      ipcRenderer.invoke('settings:get-foreground-delay-ms'),
    /** 保存置前台后短延时（ms；非法值归 0；已起 sidecar 实时推送） */
    setForegroundDelayMs: (ms: number): Promise<{ ok: boolean; updatedAt?: number; error?: string }> =>
      ipcRenderer.invoke('settings:set-foreground-delay-ms', ms)
  },
  /** 数据抓取向导（M4 切片 1）：在已开浏览器页面里识别相似列表项 */
  scrape: {
    /** 给定示例项选择器，返回聚类出的列表项选择器 + 候选字段 */
    inspect: (sampleSelector: string): Promise<ScrapeInspectResult> =>
      ipcRenderer.invoke('scrape:inspect', sampleSelector)
  },
  /** 浏览器 CDP 点选拾取（M4 切片 3）：进入页面拾取模式，等用户点击元素 */
  webPick: {
    start: (timeoutMs?: number) =>
      ipcRenderer.invoke('web-pick:start', timeoutMs) as Promise<{
        ok: boolean; cancelled?: boolean; selector?: string; tag?: string; text?: string; error?: string
      }>
  }
} as const

contextBridge.exposeInMainWorld('ruili', api)

export type RuiliApi = typeof api

export type {
  DeleteReply,
  FlowSummary,
  ListReply,
  LoadReply,
  SaveReply,
  PickReply,
  PickStopReply,
  RecordStartReply,
  RecordStopReply,
  ElementsDeleteReply,
  ElementsListReply,
  ScrapeInspectResult
}
