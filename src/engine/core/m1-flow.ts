/**
 * M1 引擎 MVP 验收流程（计划书 §7）：
 *
 * 「打开网页 → 输入搜索词 → 点击 → 等待结果出现 → 提取标题 →
 *  新建 Excel → 写表头 → 写一行数据 → 保存」完整在设计器内真实运行。
 *
 * 与 M0 出口演示（poc-exit）的差异：
 *  - 用新指令 webWaitFor 显式等待异步渲染的结果元素；
 *  - 用新指令 excelWriteRow 一次写一行（数组），模拟抓取后批量落表；
 *  - 流程结束后由 RunManager 统一关闭浏览器 / 释放 Excel（不再残留）。
 *
 * 网页仍用离线 data:URL（真实 Chromium 驱动，不依赖外网），
 * 目标站选择器稳定性属 M3 基准。
 */

import { resolve } from 'node:path'
import type { FlowDoc } from '../../shared/ast'

/** M1 端到端产物输出路径（.runtime/m1-e2e.xlsx） */
export const M1_E2E_OUTFILE = resolve(process.cwd(), '.runtime', 'm1-e2e.xlsx')

/**
 * 离线测试页：输入框 + 按钮；点击后 400ms 异步渲染 #result，
 * 让 webWaitFor 真正等到元素出现（而非立即命中）。
 */
const M1_PAGE_HTML = `<!doctype html><html><body>
<input id="q" placeholder="搜索词">
<button id="btn">搜索</button>
<script>
  document.getElementById('btn').onclick = function () {
    var kw = document.getElementById('q').value;
    setTimeout(function () {
      var div = document.createElement('div');
      div.id = 'result';
      div.textContent = '结果标题: ' + kw;
      document.body.appendChild(div);
    }, 400);
  };
<\/script>
</body></html>`

const M1_PAGE_URL = 'data:text/html;charset=utf-8,' + encodeURIComponent(M1_PAGE_HTML)

export const M1_E2E_FLOW: FlowDoc = {
  version: 1,
  name: 'M1 端到端：打开网页→抓取→写Excel',
  vars: [],
  steps: [
    { id: 's1', cmdId: 'webOpenBrowser', params: {} },
    { id: 's2', cmdId: 'webOpenUrl', params: { url: M1_PAGE_URL } },
    { id: 's3', cmdId: 'webInput', params: { selector: '#q', value: '锐流 RPA 价格' } },
    { id: 's4', cmdId: 'webClick', params: { selector: '#btn' } },
    { id: 's5', cmdId: 'webWaitFor', params: { selector: '#result', timeoutMs: 5000 } },
    {
      id: 's6',
      cmdId: 'webExtractText',
      params: { selector: '#result', resultVar: 'title' }
    },
    { id: 's7', cmdId: 'excelCreate', params: {} },
    {
      id: 's8',
      cmdId: 'excelWriteCell',
      params: { sheet: 'Sheet1', row: 1, col: 1, value: '结果标题' }
    },
    {
      id: 's9',
      cmdId: 'excelWriteCell',
      params: { sheet: 'Sheet1', row: 1, col: 2, value: '商品数' }
    },
    {
      id: 's10',
      cmdId: 'excelWriteRow',
      params: { sheet: 'Sheet1', row: 2, values: '["${title}", 2]' }
    },
    { id: 's11', cmdId: 'excelSave', params: { path: M1_E2E_OUTFILE } },
    {
      id: 's12',
      cmdId: 'logMessage',
      params: {
        message: `✅ M1 端到端完成：标题=\${title}，已写 ${M1_E2E_OUTFILE}`,
        level: 'success'
      }
    }
  ]
}
