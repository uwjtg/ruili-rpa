/**
 * M0 出口演示（阶段 6 §7.7）：一条真实流程跑通全部 M0 链路。
 *
 * 打开浏览器 → 打开(模拟搜索)页 → 输入搜索词 → 点击 → 提取结果标题
 * → HTTP GET(mock) → 写入 Excel → 保存 → 汇总日志；中途断点暂停一次后继续。
 *
 * 网页用离线 data: URL（真实 Chromium 驱动，不依赖外网搜索站），
 * Excel 用真实 exceljs 写盘，事件流按时间戳打印。
 *
 * 运行：npm run poc:exit
 */

import { resolve } from 'node:path'
import { buildEngineRegistry } from '../src/engine/run/runManager'
import { Interpreter } from '../src/engine/core/interpreter'
import type { FlowDoc } from '../src/shared/ast'

function stamp(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}
function log(msg: string): void {
  console.log(`[${stamp()}] ${msg}`)
}

async function main(): Promise<void> {
  const pageHtml = `<!doctype html><html><body>
    <input id="q" placeholder="搜索词">
    <button id="btn">搜索</button>
    <div id="result">未搜索</div>
    <script>
      document.getElementById('btn').onclick = function () {
        document.getElementById('result').textContent = '结果标题: ' + document.getElementById('q').value;
      };
    <\/script>
  </body></html>`
  const pageUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(pageHtml)
  const outXlsx = resolve(process.cwd(), '.runtime', 'exit-demo.xlsx')

  const flow: FlowDoc = {
    version: 1,
    name: 'M0 出口演示：搜索→取标题→写Excel',
    vars: [],
    steps: [
      { id: 's1', cmdId: 'webOpenBrowser', params: {} },
      { id: 's2', cmdId: 'webOpenUrl', params: { url: pageUrl } },
      { id: 's3', cmdId: 'webInput', params: { selector: '#q', value: '锐流 RPA 价格' } },
      { id: 's4', cmdId: 'webClick', params: { selector: '#btn' }, breakpoint: true },
      { id: 's5', cmdId: 'webExtractText', params: { selector: '#result', resultVar: 'title' } },
      { id: 's6', cmdId: 'httpGet', params: { url: 'https://mock-api.example.com/products', resultVar: 'products' } },
      { id: 's7', cmdId: 'excelCreate', params: {} },
      { id: 's8', cmdId: 'excelWriteCell', params: { sheet: 'Sheet1', row: 1, col: 1, value: '${title}' } },
      { id: 's9', cmdId: 'excelWriteCell', params: { sheet: 'Sheet1', row: 1, col: 2, value: '${products.length} 条' } },
      { id: 's10', cmdId: 'excelSave', params: { path: outXlsx } },
      { id: 's11', cmdId: 'logMessage', params: { message: '✅ 出口流程完成：标题=${title}，已写 ${outXlsx}', level: 'success' } }
    ]
  }

  const registry = buildEngineRegistry()
  const itp = new Interpreter({
    registry,
    events: {
      onFlowStart: (f) => log(`▶ 流程开始: ${f.name}`),
      onStepStart: (s) => log(`  → ${s.id} (${s.cmdId})`),
      onLog: (lvl, msg) => log(`    [${lvl}] ${msg}`),
      onPaused: (s) => {
        log(`⏸ 命中断点，暂停在 ${s.id}（300ms 后继续）`)
        setTimeout(() => itp.resume(), 300)
      },
      onFlowEnd: (r) =>
        log(`⏹ 流程结束: status=${r.status}, steps=${r.stepsExecuted}, ${r.durationMs}ms`)
    }
  })

  const result = await itp.run(flow)
  if (result.status !== 'completed') {
    throw new Error(`出口流程未完成: ${JSON.stringify(result)}`)
  }
  log('✅ M0 出口演示通过：浏览器→输入→点击→提取→HTTP→Excel 全链路真实跑通')
}

main().catch((e) => {
  console.error('❌ poc:exit 失败：', e)
  process.exit(1)
})
