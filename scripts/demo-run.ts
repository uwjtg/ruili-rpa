/**
 * 阶段 2 演示：跑 5 步流程，在 s4 命中断点暂停，200ms 后继续。
 * 运行：npx vite-node scripts/demo-run.ts
 */
import { CommandRegistry } from '../src/engine/commands/registry'
import { registerDemoCommands } from '../src/engine/commands/demo'
import { Interpreter } from '../src/engine/core/interpreter'
import { DEMO_FLOW } from '../src/engine/core/demo-flow'

const registry = new CommandRegistry()
registerDemoCommands(registry)

// 给 s4 加断点演示暂停/继续
const flow = JSON.parse(JSON.stringify(DEMO_FLOW))
flow.steps[3].breakpoint = true

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

const itp = new Interpreter({
  registry,
  events: {
    onFlowStart: (f) => console.log(`[${stamp()}] ▶ 流程开始: ${f.name}`),
    onStepStart: (s) => console.log(`[${stamp()}]   → 执行步骤 ${s.id} (${s.cmdId})`),
    onLog: (level, msg) => console.log(`[${stamp()}]     [${level}] ${msg}`),
    onPaused: (s) => {
      console.log(`[${stamp()}] ⏸  命中断点，暂停在步骤 ${s.id}（200ms 后继续）`)
      setTimeout(() => itp.resume(), 200)
    },
    onResumed: (s) => console.log(`[${stamp()}] ▶ 从步骤 ${s.id} 继续`),
    onFlowEnd: (r) =>
      console.log(
        `[${stamp()}] ⏹  流程结束: status=${r.status}, steps=${r.stepsExecuted}, ${r.durationMs}ms`
      )
  }
})

await itp.run(flow)
