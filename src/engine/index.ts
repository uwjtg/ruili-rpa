/** 引擎公开入口 */
export { Interpreter } from './core/interpreter'
export type { InterpreterOptions } from './core/interpreter'
export type { RunContext } from './core/context'
export { CommandRegistry } from './commands/registry'
export type { RegisteredCommand } from './commands/registry'
export { registerDemoCommands } from './commands/demo'
export { registerUtilCommands } from './commands/util'
export { registerSystemCommands } from './commands/system'
export { registerDataCommands } from './commands/data'
export { registerCsvCommands } from './commands/csv'
export { registerFileExtraCommands } from './commands/util'
export { registerDataExtraCommands } from './commands/data'
export { DEMO_FLOW } from './core/demo-flow'
// 阶段 3 · 真实链路
export { registerWebCommands } from './web/commands'
export type { WebCommandsDeps } from './web/commands'
export { WebSession } from './web/session'
export type { WebSession as WebSessionIface } from './web/session'
export { registerExcelCommands } from './excel/commands'
export type { ExcelCommandsDeps } from './excel/commands'
export { registerSidecarCommands } from './sidecar/commands'
export type { SidecarCommandsDeps, SidecarLike } from './sidecar/commands'
export { SidecarClient } from './sidecar/client'
export type { SidecarHealth, OcrResult } from './sidecar/client'
// 阶段 4 · 贯通与 AI
export { RunManager, buildEngineRegistry, RunValidationError } from './run/runManager'
export type { RunDisposer, StartOptions } from './run/runManager'
export { validateFlow, hasError } from './core/validate'
export type { FlowIssue } from './core/validate'
// M1 · 引擎 MVP
export { M1_E2E_FLOW, M1_E2E_OUTFILE } from './core/m1-flow'
export { LlmClient } from './llm/provider'
export type {
  LlmProviderConfig,
  ChatMessage,
  ChatCompletion
} from './llm/provider'
export { generateFlow, buildFlowTool } from './llm/astGen'
