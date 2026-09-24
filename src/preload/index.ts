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

/**
 * 暴露给渲染进程的桥接 API。
 * - 阶段 1：平台/版本信息、窗口控制。
 * - 阶段 4：流程运行控制（run:start/resume/stop）+ 事件订阅（run:event）+
 *   LLM 生成流程（llm:generate-flow，apiKey 不下发渲染端）。
 * - M2 切片 2：流程持久化（flow:save/list/load/delete，主进程 better-sqlite3）。
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
  }
} as const

contextBridge.exposeInMainWorld('ruili', api)

export type RuiliApi = typeof api

export type { DeleteReply, FlowSummary, ListReply, LoadReply, SaveReply }
