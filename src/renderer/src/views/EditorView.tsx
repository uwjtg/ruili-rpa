import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { FlowDoc, StepNode } from '../../../shared/ast'
import type { LogLevel } from '../../../shared/events'
import type { RunWireEvent } from '../../../shared/run-protocol'
import type { CmdMeta } from '../../../shared/cmd-schema'
import CmdLibrary from './editor/CmdLibrary'
import StepList from './editor/StepList'
import ParamPanel from './editor/ParamPanel'
import VarPanel from './editor/VarPanel'
import AiPanel from './editor/AiPanel'
import ElementPanel from './editor/ElementPanel'
import ThresholdPanel from './editor/ThresholdPanel'
import ScrapeWizard from './editor/ScrapeWizard'
import { generateScrapeFlow } from '../../../shared/scrape/generate'
import type { ScrapeWizardSpec } from '../../../shared/scrape/spec'
import type { PickedElement } from '../../../shared/desktop-pick'
import type { RecordedInstruction } from '../../../shared/desktop-record'
import { parameterizeRecording } from '../../../shared/record-params'
import { mergeRecordThresholds } from '../../../shared/record-settings'
import {
  applyRunOverrides,
  missingRequiredOverrides
} from '../../../shared/run-overrides'
import {
  buildInitialFlow,
  countSteps,
  duplicateStep,
  findStepPath,
  insertAfter,
  moveStep,
  nextStepId,
  patchStep,
  removeStep
} from './editor/flowTree'

type RendererCmd = Omit<CmdMeta, 'summary'>

interface LogLine {
  time: string
  level: LogLevel | 'sys'
  message: string
}

/** 一个编辑器标签页 = 一份可独立撤销/重做、独立脏标记的 FlowDoc */
interface EditorTab {
  tabId: string
  /** SQLite 落盘后的 id；null 表示尚未保存过 */
  flowId: string | null
  flow: FlowDoc
  dirty: boolean
  /** 最近保存成功的时间（用于工具栏状态文案） */
  savedAt: string | null
  selectedId: string | null
  runningStepId: string | null
  doneIds: Set<string>
  past: FlowDoc[]
  future: FlowDoc[]
}

const LEVEL_COLOR: Record<string, string> = {
  info: '#2F80ED',
  success: '#1DBF73',
  warn: '#C46211',
  error: '#E64340',
  sys: '#8A8F99'
}

function now(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function tabStamp(): string {
  return `t${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** 用指令 schema 的默认值构造一个新步骤 */
function makeStep(cmd: RendererCmd): StepNode {
  const params: Record<string, unknown> = {}
  for (const f of cmd.params) {
    if (f.default !== undefined) params[f.key] = f.default
    else if (f.type === 'text') params[f.key] = ''
    else if (f.type === 'number') params[f.key] = 0
  }
  return { id: '', cmdId: cmd.id, params }
}

function makeTab(flow: FlowDoc, flowId: string | null = null): EditorTab {
  return {
    tabId: tabStamp(),
    flowId,
    flow,
    dirty: false,
    savedAt: null,
    selectedId: null,
    runningStepId: null,
    doneIds: new Set(),
    past: [],
    future: []
  }
}

export default function EditorView(): JSX.Element {
  const ruili = window.ruili
  const [searchParams] = useSearchParams()
  const [commands, setCommands] = useState<RendererCmd[]>([])

  // 标签页状态：初始一个空白流程
  const [tabs, setTabs] = useState<EditorTab[]>(() => [makeTab(buildInitialFlow())])
  const [activeTabId, setActiveTabId] = useState<string>(() => '')
  // 哪个标签正在运行（主进程单 RunManager，一次只跑一个）
  const runningTabRef = useRef<string | null>(null)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  // 桌面元素拾取模式（M3 切片 1）
  const [picking, setPicking] = useState(false)
  // 桌面智能录制模式（M3 切片 3）：观察式录制，不吞输入
  const [recording, setRecording] = useState(false)
  // 圈定录制目标窗口（M3 切片 6）：录制只保留该进程 PID 的事件
  const [recTarget, setRecTarget] = useState<{ pid: number; title: string } | null>(null)
  // M3 切片 10：运行前变量填写框（null=关闭）
  const [varDialog, setVarDialog] = useState<Record<string, string> | null>(null)
  // M3 切片 14：必填校验错误提示（null/''=无错误）
  const [varDialogError, setVarDialogError] = useState('')
  // M4 切片 1：数据抓取向导弹窗
  const [scrapeOpen, setScrapeOpen] = useState(false)
  const [lines, setLines] = useState<LogLine[]>([])
  const [rightTab, setRightTab] = useState<'params' | 'vars' | 'elements' | 'settings' | 'ai'>('params')
  const [status, setStatus] = useState('空闲')
  // 标签重命名编辑态
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  const logRef = useRef<HTMLDivElement>(null)
  const loadedFlowRef = useRef<string | null>(null)
  const tabsRef = useRef<EditorTab[]>(tabs)
  tabsRef.current = tabs
  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 初始化 activeTabId
  useEffect(() => {
    setActiveTabId((cur) => cur || tabs[0].tabId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeTab = tabs.find((t) => t.tabId === activeTabId) ?? tabs[0]

  /** 不可变地更新某个标签页 */
  const patchTab = useCallback((tabId: string, patch: Partial<EditorTab>) => {
    setTabs((prev) => prev.map((t) => (t.tabId === tabId ? { ...t, ...patch } : t)))
  }, [])

  // 拉取指令目录
  useEffect(() => {
    if (!ruili?.registry) return
    void ruili.registry.list().then((list) => setCommands(list))
  }, [ruili])

  // 从应用视图带 ?flowId=xxx 进入：加载该流程为一个新标签并激活
  useEffect(() => {
    const fid = searchParams.get('flowId')
    if (!fid || !ruili?.flow || loadedFlowRef.current === fid) return
    loadedFlowRef.current = fid
    void ruili.flow.load(fid).then((res) => {
      if (!res.ok) {
        setStatus(`加载失败：${res.error}`)
        return
      }
      const hit = tabsRef.current.find((t) => t.flowId === fid)
      if (hit) {
        setActiveTabId(hit.tabId)
        return
      }
      const t = makeTab(res.flow, fid)
      t.savedAt = now()
      setTabs((prev) => [...prev, t])
      setActiveTabId(t.tabId)
      // 从应用卡片「运行」进入：加载完自动跑
      if (searchParams.get('autorun') === '1') {
        setTimeout(() => {
          runningTabRef.current = t.tabId
          void ruili.run.start(res.flow, fid)
        }, 300)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, ruili])

  // 订阅运行事件：事件归到 runningTabId 对应的标签
  useEffect(() => {
    if (!ruili?.run) return
    const off = ruili.run.onEvent((e: RunWireEvent) => {
      const rid = runningTabRef.current
      const patchRunning = (p: Partial<EditorTab>) =>
        setTabs((prev) => prev.map((t) => (t.tabId === rid ? { ...t, ...p } : t)))
      switch (e.type) {
        case 'flow-start':
          setRunning(true)
          setPaused(false)
          setLines([])
          setStatus(`运行中：${e.flowName}`)
          push('sys', `▶ 流程开始：${e.flowName}`)
          break
        case 'step-start':
          patchRunning({ runningStepId: e.stepId })
          push('sys', `  → ${e.stepId}（${e.cmdId}）`)
          break
        case 'step-end': {
          const rid2 = runningTabRef.current
          setTabs((prev) =>
            prev.map((t) => {
              if (t.tabId !== rid2 || !t.runningStepId) return t
              const done = new Set(t.doneIds).add(t.runningStepId)
              return { ...t, runningStepId: null, doneIds: done }
            })
          )
          break
        }
        case 'log':
          push(e.level, e.message)
          break
        case 'paused':
          setPaused(true)
          push('sys', `⏸ 命中断点，暂停在 ${e.stepId}（点继续恢复）`)
          break
        case 'resumed':
          setPaused(false)
          push('sys', `▶ 从 ${e.stepId} 继续`)
          break
        case 'flow-end':
          setRunning(false)
          setPaused(false)
          runningTabRef.current = null
          patchRunning({ runningStepId: null })
          setStatus(
            `结束：${e.result.status}（${e.result.stepsExecuted} 步，${e.result.durationMs}ms）`
          )
          push('sys', `⏹ 流程结束 status=${e.result.status}`)
          break
      }
    })
    return off
  }, [ruili])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [lines])

  // 拾取结果兜底复位（pick:result 事件；正常路径由 onPick 的 await 返回处理）
  useEffect(() => {
    if (!ruili?.pick) return
    const off = ruili.pick.onResult(() => {
      setPicking(false)
    })
    return off
  }, [ruili])

  function push(level: LogLevel | 'sys', message: string): void {
    setLines((prev) => [...prev, { time: now(), level, message }])
  }

  /** 提交一次可撤销的变更（写回当前激活标签） */
  function commit(next: FlowDoc): void {
    const t = activeTab
    const past = [...t.past, t.flow]
    if (past.length > 60) past.shift()
    patchTab(t.tabId, { flow: next, past, future: [], dirty: true })
  }

  function undo(): void {
    const t = activeTab
    const prev = t.past[t.past.length - 1]
    if (!prev) return
    patchTab(t.tabId, {
      flow: prev,
      past: t.past.slice(0, -1),
      future: [...t.future, t.flow],
      dirty: true
    })
  }
  function redo(): void {
    const t = activeTab
    const next = t.future[t.future.length - 1]
    if (!next) return
    patchTab(t.tabId, {
      flow: next,
      future: t.future.slice(0, -1),
      past: [...t.past, t.flow],
      dirty: true
    })
  }

  function addStep(cmdId: string): void {
    const cmd = commands.find((c) => c.id === cmdId)
    if (!cmd) return
    const step = makeStep(cmd)
    step.id = nextStepId(activeTab.flow.steps)
    commit({
      ...activeTab.flow,
      steps: insertAfter(activeTab.flow.steps, activeTab.selectedId, step)
    })
    patchTab(activeTab.tabId, { selectedId: step.id })
  }

  function updateParam(stepId: string, key: string, value: unknown): void {
    const path = findStepPath(activeTab.flow.steps, stepId)
    if (!path) return
    const params = { ...path.step.params, [key]: value }
    commit({
      ...activeTab.flow,
      steps: patchStep(activeTab.flow.steps, stepId, { params })
    })
  }

  function deleteStep(id: string): void {
    commit({ ...activeTab.flow, steps: removeStep(activeTab.flow.steps, id) })
    if (activeTab.selectedId === id) patchTab(activeTab.tabId, { selectedId: null })
  }
  function duplicate(id: string): void {
    commit({ ...activeTab.flow, steps: duplicateStep(activeTab.flow.steps, id) })
  }
  function toggleBreakpoint(id: string): void {
    const path = findStepPath(activeTab.flow.steps, id)
    if (!path) return
    commit({
      ...activeTab.flow,
      steps: patchStep(activeTab.flow.steps, id, { breakpoint: !path.step.breakpoint })
    })
  }
  function toggleDisabled(id: string): void {
    const path = findStepPath(activeTab.flow.steps, id)
    if (!path) return
    commit({
      ...activeTab.flow,
      steps: patchStep(activeTab.flow.steps, id, { disabled: !path.step.disabled })
    })
  }

  /** 拖拽重排（同父内） */
  function move(fromId: string, toId: string, position: 'before' | 'after'): void {
    commit({ ...activeTab.flow, steps: moveStep(activeTab.flow.steps, fromId, toId, position) })
  }

  /** 保存指定标签（新建或按 flowId 更新） */
  async function saveTab(tabId: string): Promise<void> {
    if (!ruili?.flow) return
    const t = tabsRef.current.find((x) => x.tabId === tabId)
    if (!t) return
    const res = await ruili.flow.save(t.flow, t.flowId ?? undefined)
    if (!res.ok) {
      setStatus(`保存失败：${res.error}`)
      return
    }
    const stamp = now()
    patchTab(tabId, { flowId: res.id, dirty: false, savedAt: stamp })
    setStatus(`已保存 ${stamp}`)
  }

  /** 保存当前激活标签 */
  async function save(): Promise<void> {
    await saveTab(activeTabIdRef.current)
  }

  // 自动保存：当前标签变脏后停 3s 落盘（§5 第 8 条"已自动保存"）
  useEffect(() => {
    if (!activeTab?.dirty) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      void saveTab(activeTabIdRef.current)
    }, 3000)
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.dirty, activeTab?.flow])

  async function doRun(flow: FlowDoc): Promise<void> {
    if (!ruili?.run) return
    runningTabRef.current = activeTab.tabId
    await ruili.run.start(flow, activeTab.flowId ?? undefined)
  }
  async function run(): Promise<void> {
    if (!ruili?.run) return
    // M3 切片 10：流程声明了变量 → 先弹框让用户填值
    if (activeTab.flow.vars.length > 0) {
      const initial: Record<string, string> = {}
      for (const v of activeTab.flow.vars) initial[v.name] = String(v.value ?? '')
      // M3 切片 14：上次填值记忆优先预填（只对仍在声明中的变量生效）
      const last = readLastOverrides()
      if (last) {
        for (const name of Object.keys(last)) {
          if (name in initial) initial[name] = last[name]
        }
      }
      setVarDialog(initial)
      setVarDialogError('')
      return
    }
    await doRun(activeTab.flow)
  }
  const overrideMemKey = (): string => {
    const id = activeTab.flowId
    const scope = id ? `flow.${id}` : `name.${activeTab.flow.name || 'untitled'}`
    return `ruili.runOverrides.${scope}`
  }
  /** 读上次填值记忆（localStorage；JSON 损坏/缺失返回 null） */
  function readLastOverrides(): Record<string, string> | null {
    try {
      const raw = localStorage.getItem(overrideMemKey())
      if (!raw) return null
      const obj: unknown = JSON.parse(raw)
      return obj && typeof obj === 'object'
        ? (obj as Record<string, string>)
        : null
    } catch {
      return null
    }
  }
  /** 保存本次填值（失败静默：隐私模式/配额等） */
  function writeLastOverrides(values: Record<string, string>): void {
    try {
      localStorage.setItem(overrideMemKey(), JSON.stringify(values))
    } catch {
      /* 忽略 */
    }
  }
  /** 变量填值框确认：必填校验 → 记忆填值 → 合并覆盖后运行；关闭则取消 */
  async function confirmVarDialog(): Promise<void> {
    if (varDialog === null) return
    const missing = missingRequiredOverrides(activeTab.flow.vars, varDialog)
    if (missing.length > 0) {
      setVarDialogError(`必填变量未填写：${missing.join('、')}`)
      return
    }
    writeLastOverrides(varDialog)
    const flow = applyRunOverrides(activeTab.flow, varDialog)
    setVarDialog(null)
    setVarDialogError('')
    await doRun(flow)
  }
  async function runM1(): Promise<void> {
    if (!ruili?.run) return
    runningTabRef.current = activeTab.tabId
    await ruili.run.startM1E2E()
  }

  /** 单步：暂停中则走一步；未启动则以单步模式启动当前流程 */
  function step(): void {
    if (!ruili?.run) return
    if (running && paused) {
      ruili.run.step()
    } else if (!running) {
      runningTabRef.current = activeTab.tabId
      ruili.run.step()
      void ruili.run.start(activeTab.flow, activeTab.flowId ?? undefined)
    }
  }

  /**
   * 桌面元素拾取（M3 切片 1）：进入拾取模式 → 主进程起 Python sidecar 全屏遮罩，
   * 用户移动鼠标高亮、左键点击确认；结果直接追加一条 pickElement 步骤到当前流程。
   */
  async function onPick(): Promise<void> {
    if (!ruili?.pick) return
    if (picking) {
      setPicking(false)
      await ruili.pick.stop()
      push('sys', '已取消拾取')
      return
    }
    setPicking(true)
    push('sys', '拾取模式已开启：移动鼠标到目标控件，左键点击确认；Esc 或右键取消')
    const reply = await ruili.pick.start()
    setPicking(false)
    if (!reply.ok) {
      push('error', `拾取失败：${reply.error}`)
      return
    }
    if (!('element' in reply)) {
      push('sys', '已取消拾取')
      return
    }
    const element = reply.element
    const cmd = commands.find((c) => c.id === 'pickElement')
    if (!cmd) {
      push('error', '指令库缺少 pickElement，无法追加步骤')
      return
    }
    const step = makeStep(cmd)
    step.id = nextStepId(activeTab.flow.steps)
    step.params.target = JSON.stringify(element)
    commit({
      ...activeTab.flow,
      steps: insertAfter(activeTab.flow.steps, activeTab.selectedId, step)
    })
    patchTab(activeTab.tabId, { selectedId: step.id })
    const label = element.name || element.automationId || element.controlType
    const libNote =
      'elementId' in reply && reply.elementId
        ? `，已加入元素库（${reply.elementId.slice(0, 8)}…）`
        : ''
    push('success', `已拾取「${label}」，已追加「拾取元素后点击」步骤${libNote}`)
  }

  /** 元素库「插入步骤」：用库中元素签名追加一条 pickElement 步骤 */
  function insertElementStep(element: PickedElement): void {
    const cmd = commands.find((c) => c.id === 'pickElement')
    if (!cmd) {
      push('error', '指令库缺少 pickElement，无法插入步骤')
      return
    }
    const step = makeStep(cmd)
    step.id = nextStepId(activeTab.flow.steps)
    step.params.target = JSON.stringify(element)
    commit({
      ...activeTab.flow,
      steps: insertAfter(activeTab.flow.steps, activeTab.selectedId, step)
    })
    patchTab(activeTab.tabId, { selectedId: step.id })
    const label = element.name || element.automationId || element.controlType
    push('success', `已从元素库插入「拾取元素后点击」步骤（${label}）`)
  }

  /**
   * 桌面智能录制（M3 切片 3）：观察式录制。点「录制」开启（sidecar 全局钩子不吞
   * 输入），用户在目标窗口执行点击/输入/滚动；点「停止录制」后 sidecar 按阈值
   * 聚合为指令序列，元素签名写入元素库（与拾取共用 saveElement 去重），指令
   * 追加为当前流程步骤。
   */
  /** 圈定录制目标窗口：点选目标窗口，记录其进程 PID（M3 切片 6） */
  async function onPickTargetWindow(): Promise<void> {
    if (!ruili?.record?.pickTargetWindow) return
    push('sys', '请点击要录制的目标窗口（Esc 取消）…')
    const r = await ruili.record.pickTargetWindow()
    if (!r.ok) {
      push('error', `圈定录制窗口失败：${r.error}`)
      return
    }
    setRecTarget({ pid: r.pid, title: r.title })
    push('success', `已圈定录制目标窗口：${r.title || '(未命名)'}（PID ${r.pid}）；此后录制只录该窗口`)
  }

  async function onRecord(): Promise<void> {
    if (!ruili?.record) return
    if (recording) {
      setRecording(false)
      push('sys', '正在结束录制并聚合指令…')
      const reply = await ruili.record.stop()
      if (!reply.ok) {
        setRecording(false)
        push('error', `结束录制失败：${reply.error}`)
        return
      }
      appendRecordedSteps(reply.instructions)
      const counts = reply.instructions.reduce(
        (a, i) => ({ ...a, [i.kind]: (a[i.kind] ?? 0) + 1 }),
        {} as Record<string, number>
      )
      push(
        'success',
        `录制完成：${reply.instructions.length} 条指令（点击 ${counts.click ?? 0} / 输入 ${counts.type ?? 0} / 滚动 ${counts.scroll ?? 0} / 按键 ${counts.key ?? 0}），元素已写入元素库`
      )
      return
    }
    setRecording(true)
    push('sys', '录制模式已开启：请在目标窗口中执行操作（点击 / 输入 / 滚动 / 按键将被录制）；完成后点「停止录制」')
    // M3 切片 17：本流程阈值覆盖随录制传给主进程（全局 DB 设置 ← 流程覆盖）
    const flowOverrides = activeTab.flow.recordThresholds
    const reply = await ruili.record.start(recTarget?.pid, flowOverrides)
    if (!reply.ok || !reply.started) {
      setRecording(false)
      push('error', `开启录制失败：${'error' in reply ? reply.error : '未知错误'}`)
      return
    }
    // M3 切片 17：录制开启后显示实际生效的聚合阈值
    try {
      const globals = await ruili.settings.getRecordThresholds()
      const eff = mergeRecordThresholds(globals, flowOverrides)
      const ovr =
        flowOverrides && Object.keys(flowOverrides).length > 0
          ? `（本流程覆盖：${Object.entries(flowOverrides).map(([k, v]) => `${k}=${v}`).join('、')}）`
          : ''
      push(
        'sys',
        `生效阈值：点击防抖 ${eff.clickDebounceMs}ms / 距离 ${eff.clickDebouncePx}px / 输入分段 ${eff.typingGapMs}ms / 滚动聚合 ${eff.scrollGapMs}ms${ovr}`
      )
    } catch {
      /* 读取生效阈值失败不阻断录制 */
    }
  }

  /** 把录制指令追加为流程步骤（M3 切片 9：typeText 文本抽成流程变量；对象参数序列化为 JSON；全部追加到末尾，单次 commit） */
  function appendRecordedSteps(instructions: RecordedInstruction[]): void {
    if (instructions.length === 0) {
      push('sys', '未录制到任何操作（没有可聚合的点击 / 输入 / 滚动）')
      return
    }
    // 把硬编码文本抽成流程变量（默认值=录到的文本），步骤改为 ${var} 引用
    const { steps: parametrized, vars: newVars } = parameterizeRecording(
      instructions,
      activeTab.flow.vars
    )
    // 逐条生成唯一 id：nextStepId 基于"已含前序新步骤"的数组递增，避免同基重复
    let idSource = activeTab.flow.steps
    const steps: StepNode[] = []
    for (const ins of parametrized) {
      const params: Record<string, unknown> = { ...ins.params }
      for (const [k, v] of Object.entries(params)) {
        if (v && typeof v === 'object') params[k] = JSON.stringify(v)
      }
      const step: StepNode = { id: nextStepId(idSource), cmdId: ins.cmdId, params }
      idSource = [...idSource, step]
      steps.push(step)
    }
    // insertAfter(null) 追加到末尾；后续步骤按录制顺序续排
    const merged = insertAfter(activeTab.flow.steps, null, steps[0])
    for (let i = 1; i < steps.length; i++) merged.push(steps[i])
    const flow: FlowDoc = {
      ...activeTab.flow,
      steps: merged,
      vars: [...activeTab.flow.vars, ...newVars]
    }
    commit(flow)
    patchTab(activeTab.tabId, { selectedId: steps[0].id })
    if (newVars.length > 0) {
      push(
        'sys',
        `已把 ${newVars.length} 段输入文本抽为流程变量（${newVars.map((v) => v.name).join('、')}），可在右侧「变量」面板修改`
      )
    }
  }

  /** M4 切片 1：抓取向导生成 → 重写 id 后追加到当前流程末尾（与录制追加同模式） */
  function onGenerateScrape(spec: ScrapeWizardSpec): void {
    const { steps: generated, newVars } = generateScrapeFlow(spec)
    let idSource = activeTab.flow.steps
    const steps: StepNode[] = []
    for (const g of generated) {
      const step: StepNode = { id: nextStepId(idSource), cmdId: g.cmdId, params: { ...g.params } }
      idSource = [...idSource, step]
      steps.push(step)
    }
    const merged = insertAfter(activeTab.flow.steps, null, steps[0])
    for (let i = 1; i < steps.length; i++) merged.push(steps[i])
    const existing = new Set(activeTab.flow.vars.map((v) => v.name))
    const varsToAdd = newVars.filter((v) => !existing.has(v.name))
    commit({ ...activeTab.flow, steps: merged, vars: [...activeTab.flow.vars, ...varsToAdd] })
    patchTab(activeTab.tabId, { selectedId: steps[steps.length - 1].id })
    setScrapeOpen(false)
    push('success', '抓取向导已插入 ' + steps.length + ' 条步骤（' + spec.fields.length + ' 个字段 → 变量 ' + spec.resultVar + '）；先在浏览器跑通，再按需调整')
  }

  /** AI 生成成功：把 FlowDoc 打开为新标签 */
  function acceptAiFlow(flow: FlowDoc): void {
    const t = makeTab(flow)
    t.dirty = true // 未落盘，等用户编辑或自动保存
    setTabs((prev) => [...prev, t])
    setActiveTabId(t.tabId)
    setRightTab('params')
  }

  /** 提交标签重命名 */
  function commitRename(): void {
    if (!renamingId) return
    const name = renameText.trim()
    const t = tabsRef.current.find((x) => x.tabId === renamingId)
    if (name && t) {
      patchTab(renamingId, { flow: { ...t.flow, name }, dirty: true })
    }
    setRenamingId(null)
  }

  /** 新建标签 */
  function newTab(): void {
    const t = makeTab(buildInitialFlow())
    t.flow = { ...t.flow, name: `未命名流程 ${tabs.length + 1}` }
    setTabs((prev) => [...prev, t])
    setActiveTabId(t.tabId)
  }

  /** 关闭标签：运行中先 stop；最后一个不可关；有未保存提示 */
  function closeTab(tabId: string): void {
    if (tabs.length <= 1) return
    const t = tabs.find((x) => x.tabId === tabId)
    if (!t) return
    if (t.dirty) {
      const ok = window.confirm(`「${t.flow.name}」有未保存的更改，确定关闭吗？`)
      if (!ok) return
    }
    // 关闭正在运行的标签：先中止
    if (runningTabRef.current === tabId) {
      ruili?.run.stop()
    }
    setTabs((prev) => {
      const next = prev.filter((x) => x.tabId !== tabId)
      if (activeTabId === tabId && next.length > 0) {
        setActiveTabId(next[next.length - 1].tabId)
      }
      return next
    })
  }

  const cmdMap = useMemo(() => new Map(commands.map((c) => [c.id, c])), [commands])
  const selectedStep = activeTab.selectedId
    ? findStepPath(activeTab.flow.steps, activeTab.selectedId)?.step ?? null
    : null
  const canUndo = activeTab.past.length > 0
  const canRedo = activeTab.future.length > 0
  const flow = activeTab.flow

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F7F8FA' }}>
      {/* 流程标签页（§5 第9条：多开/切换/关闭/新建；关闭运行中先中止） */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          background: '#fff',
          borderBottom: '1px solid #E5E6EB',
          padding: '0 8px',
          overflowX: 'auto'
        }}
      >
        {tabs.map((t) => {
          const active = t.tabId === activeTab.tabId
          const renaming = renamingId === t.tabId
          return (
            <div
              key={t.tabId}
              onClick={() => setActiveTabId(t.tabId)}
              onDoubleClick={() => {
                setRenamingId(t.tabId)
                setRenameText(t.flow.name)
              }}
              title="双击重命名"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                fontSize: 12,
                cursor: 'pointer',
                borderBottom: active ? '2px solid #7C5CFC' : '2px solid transparent',
                color: active ? '#1F2329' : '#8A8F99',
                fontWeight: active ? 600 : 400,
                background: active ? '#F1EDFF' : 'transparent',
                borderRadius: '6px 6px 0 0',
                whiteSpace: 'nowrap',
                maxWidth: 180
              }}
            >
              {t.dirty ? (
                <span title="有未保存的更改" style={{ color: '#E64340', fontSize: 12 }}>●</span>
              ) : null}
              {renaming ? (
                <input
                  autoFocus
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: 90,
                    height: 20,
                    border: '1px solid #7C5CFC',
                    borderRadius: 4,
                    fontSize: 12,
                    padding: '0 4px',
                    outline: 'none'
                  }}
                />
              ) : (
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.flow.name}</span>
              )}
              {tabs.length > 1 ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(t.tabId)
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#B0B6BF',
                    fontSize: 12,
                    lineHeight: 1,
                    padding: 2
                  }}
                  aria-label={`关闭 ${t.flow.name}`}
                >
                  ✕
                </button>
              ) : null}
            </div>
          )
        })}
        <button
          onClick={newTab}
          style={{
            alignSelf: 'center',
            marginLeft: 4,
            border: '1px dashed #D8DADD',
            background: '#fff',
            color: '#51565D',
            borderRadius: 6,
            height: 24,
            padding: '0 10px',
            fontSize: 12,
            cursor: 'pointer'
          }}
          aria-label="新建流程标签"
        >
          + 新建
        </button>
      </div>

      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: '#fff',
          borderBottom: '1px solid #E5E6EB'
        }}
      >
        <button
          onClick={() => void save()}
          style={{ ...btn, background: '#E64340', color: '#fff', border: 'none' }}
          title="保存当前流程到本地"
        >
          保存
        </button>
        <button
          onClick={() => void run()}
          disabled={running || recording}
          style={{ ...btn, background: running ? '#B0B6BF' : '#1DBF73', color: '#fff', border: 'none' }}
        >
          {running ? '运行中…' : '运行'}
        </button>
        <button
          onClick={step}
          disabled={running && !paused}
          title="单步执行下一步（step-over）"
          style={{ ...btn, background: paused ? '#7C5CFC' : '#fff', color: paused ? '#fff' : '#51565D', border: paused ? 'none' : '1px solid #D8DADD' }}
        >
          单步
        </button>
        <button
          onClick={() => void onPick()}
          disabled={running || recording}
          title="拾取桌面元素：移动鼠标到目标控件，左键点击确认；Esc 或右键取消"
          style={{ ...btn, background: picking ? '#7C5CFC' : '#fff', color: picking ? '#fff' : '#7C5CFC', border: picking ? 'none' : '1px solid #7C5CFC' }}
        >
          {picking ? '取消拾取' : '拾取'}
        </button>
        <button
          onClick={() => void onRecord()}
          disabled={running || picking}
          title="智能录制：观察目标窗口操作（点击/输入/滚动）生成指令序列；录制不吞输入，点「停止录制」结束"
          style={{ ...btn, background: recording ? '#E64340' : '#fff', color: recording ? '#fff' : '#E64340', border: recording ? 'none' : '1px solid #E64340' }}
        >
          {recording ? '停止录制' : '录制'}
        </button>
        <button
          onClick={() => void onPickTargetWindow()}
          disabled={running || recording || picking}
          title="圈定录制目标窗口：录制时只录该窗口所属进程的操作（M3 切片 6）"
          style={{ ...btn, background: '#fff', color: '#0E8A5F', border: '1px solid #0E8A5F' }}
        >
          {recTarget ? `圈定:${recTarget.title || '窗口'}` : '圈定窗口'}
        </button>
        {paused ? (
          <button onClick={() => ruili?.run.resume()} style={{ ...btn, background: '#7C5CFC', color: '#fff', border: 'none' }}>
            继续
          </button>
        ) : null}
        {running ? (
          <button onClick={() => ruili?.run.stop()} style={{ ...btn, background: '#FDECEC', color: '#E64340' }}>
            停止
          </button>
        ) : null}
        <button onClick={undo} disabled={!canUndo} style={btn} title="撤销">
          ↺ 撤销
        </button>
        <button onClick={redo} disabled={!canRedo} style={btn} title="重做">
          ↻ 重做
        </button>
        <span style={{ width: 1, height: 20, background: '#E5E6EB' }} />
        <button onClick={() => void runM1()} disabled={running || recording} style={{ ...btn, background: '#2F80ED', color: '#fff', border: 'none' }}>
          M1 端到端
        </button>
        <button
          onClick={() => setScrapeOpen(true)}
          disabled={running || recording}
          title='数据抓取向导：在已开浏览器列表页识别相似项、标注字段，一键生成抓取流程'
          style={{ ...btn, background: scrapeOpen ? '#1DBF73' : '#fff', color: scrapeOpen ? '#fff' : '#1DBF73', border: scrapeOpen ? 'none' : '1px solid #1DBF73' }}
        >
          抓取
        </button>
        <span style={{ marginLeft: 'auto' }}>
          {/* §5 第8条：顶部常显未保存/已保存状态；录制态红点常显 */}
          {recording ? (
            <span style={{ color: '#E64340', fontSize: 12 }}>● 录制中…</span>
          ) : activeTab.dirty ? (
            <span style={{ color: '#E64340', fontSize: 12 }}>● 未保存的更改</span>
          ) : activeTab.savedAt ? (
            <span style={{ color: '#1DBF73', fontSize: 12 }}>✓ 已保存 {activeTab.savedAt}</span>
          ) : (
            <span style={{ color: '#B0B6BF', fontSize: 12 }}>尚未保存</span>
          )}
        </span>
        <span style={{ color: '#B0B6BF', fontSize: 11 }}>{countSteps(flow.steps)} 步</span>
        <span style={{ color: '#51565D', fontSize: 12 }}>{status}</span>
      </div>

      {/* 三栏主体 */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <CmdLibrary commands={commands} onAdd={addStep} disabled={running} />

        {/* 中间步骤区 */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div
            style={{
              margin: 12,
              border: '2px solid #7C5CFC',
              borderRadius: 8,
              background: '#F8F7FC',
              minHeight: 200
            }}
          >
            <StepList
              steps={flow.steps}
              depth={0}
              cmdMap={cmdMap}
              selectedId={activeTab.selectedId}
              runningStepId={activeTab.runningStepId}
              doneStepIds={activeTab.doneIds}
              onSelect={(id) => patchTab(activeTab.tabId, { selectedId: id })}
              onDelete={deleteStep}
              onDuplicate={duplicate}
              onToggleBreakpoint={toggleBreakpoint}
              onToggleDisabled={toggleDisabled}
              onMove={move}
            />
          </div>
        </div>

        {/* 右侧面板 */}
        <div
          style={{
            width: 280,
            borderLeft: '1px solid #E5E6EB',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', borderBottom: '1px solid #E5E6EB' }}>
            {(['params', 'vars', 'elements', 'settings', 'ai'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setRightTab(t)}
                style={{
                  flex: 1,
                  height: 34,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: rightTab === t ? '#7C5CFC' : '#8A8F99',
                  fontWeight: rightTab === t ? 600 : 400,
                  borderBottom: rightTab === t ? '2px solid #7C5CFC' : '2px solid transparent'
                }}
              >
                {t === 'params' ? '参数' : t === 'vars' ? '变量' : t === 'elements' ? '元素' : t === 'settings' ? '设置' : 'AI'}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {rightTab === 'params' ? (
              <ParamPanel
                step={selectedStep}
                cmd={selectedStep ? cmdMap.get(selectedStep.cmdId) : undefined}
                onChangeParam={updateParam}
                onDelete={deleteStep}
              />
            ) : rightTab === 'vars' ? (
              <VarPanel vars={flow.vars} onChange={(vars) => commit({ ...flow, vars })} />
            ) : rightTab === 'elements' ? (
              <ElementPanel onInsert={insertElementStep} />
            ) : rightTab === 'settings' ? (
              <ThresholdPanel onNotify={(msg) => push('sys', msg)} flow={flow} onChangeFlow={(f) => commit(f)} />
            ) : (
              <AiPanel onAccept={acceptAiFlow} />
            )}
          </div>
        </div>
      </div>

      {/* 底部日志 */}
      <div
        ref={logRef}
        style={{
          height: 180,
          overflow: 'auto',
          background: '#fff',
          borderTop: '1px solid #E5E6EB',
          padding: 10,
          fontFamily: 'Consolas, "Cascadia Code", monospace',
          fontSize: 12,
          lineHeight: 1.7
        }}
      >
        {lines.length === 0 ? (
          <div style={{ color: '#B0B6BF' }}>暂无日志</div>
        ) : (
          lines.map((l, i) => (
            <div key={i}>
              <span style={{ color: '#B0B6BF' }}>{l.time}</span>{' '}
              <span style={{ color: LEVEL_COLOR[l.level] }}>[{l.level}]</span>{' '}
              <span style={{ color: '#1F2329' }}>{l.message}</span>
            </div>
          ))
        )}
      </div>

      {/* M3 切片 10：运行前变量填写框 */}
      {varDialog !== null ? (
        <div
          onClick={() => setVarDialog(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: 20,
              width: 360,
              boxShadow: '0 8px 30px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>运行前填写变量</div>
            {activeTab.flow.vars.map((v) => (
              <div key={v.name} style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#51565D', marginBottom: 2 }}>
                  {v.required === true ? (
                    <span style={{ color: '#E64340', marginRight: 2 }}>*</span>
                  ) : null}
                  {v.name}（{v.type}）
                </label>
                {v.description ? (
                  <div style={{ fontSize: 11, color: '#8A8F99', marginBottom: 4 }}>{v.description}</div>
                ) : null}
                <input
                  value={varDialog[v.name] ?? ''}
                  onChange={(e) => setVarDialog({ ...varDialog, [v.name]: e.target.value })}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '6px 8px',
                    border: '1px solid #D8DADD',
                    borderRadius: 6,
                    fontSize: 13
                  }}
                />
              </div>
            ))}
            {varDialogError ? (
              <div style={{ fontSize: 12, color: '#E64340', marginBottom: 8 }}>⚠ {varDialogError}</div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => setVarDialog(null)} style={{ ...btn }}>取消</button>
              <button
                onClick={() => void confirmVarDialog()}
                style={{ ...btn, background: '#7C5CFC', color: '#fff', border: 'none' }}
              >
                运行
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* M4 切片 1：数据抓取向导 */}
      {scrapeOpen ? <ScrapeWizard onClose={() => setScrapeOpen(false)} onGenerate={onGenerateScrape} /> : null}
    </div>
  )
}

const btn: React.CSSProperties = {
  height: 28,
  padding: '0 14px',
  border: '1px solid #D8DADD',
  borderRadius: 6,
  background: '#fff',
  color: '#1F2329',
  fontSize: 12,
  cursor: 'pointer'
}
