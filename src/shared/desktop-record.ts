/**
 * 智能录制（M3 切片 3）跨进程契约。
 *
 * 录制链路：renderer 调 record:start → 主进程 → Python sidecar（record 模式全局
 * 钩子，观察不吞输入）→ 用户在目标窗口执行操作（点击 / 输入 / 滚动）→
 * record:stop → sidecar 按阈值聚合为指令序列 → 主进程把指令里的元素签名写入
 * 元素库（与拾取共用 saveElement 签名去重：录制即入库）→ renderer 把指令
 * 追加为流程步骤。
 *
 * 指令 → 引擎指令映射：
 *   click  → pickElement（params.target = PickedElement 签名，回放走选择器回退链）
 *   input  → typeText（params.text = 聚合出的文本段）
 *   scroll → scroll（params.delta = 滚轮量，params.target 可空，x/y 为坐标兜底）
 *   key    → pressKey（params.keys = "Enter" / "Control+A" 等，M3 切片 4）
 */

/** 录制指令的来源事件类别（M3 切片 4 起新增 key=非文本键/快捷键） */
export type RecordKind = 'click' | 'type' | 'scroll' | 'key'

/** sidecar 聚合出的一条录制指令（renderer 直接转为流程步骤） */
export interface RecordedInstruction {
  /** 录制会话内序号：r1 / r2 / … */
  id: string
  kind: RecordKind
  /** 引擎指令 id：pickElement | typeText | scroll */
  cmdId: string
  /** 步骤摘要文案（日志与 UI 展示） */
  label: string
  /** 指令参数（target 为 PickedElement JSON 对象或 null，text/delta 为标量） */
  params: Record<string, unknown>
  /** 距录制开始的时间（ms） */
  ts: number
}

export type RecordStartReply =
  | { ok: true; started: true }
  | { ok: false; error: string }

export type RecordStopReply =
  | { ok: true; instructions: RecordedInstruction[] }
  | { ok: false; error: string }
