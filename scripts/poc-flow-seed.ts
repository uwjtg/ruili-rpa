/**
 * POC：向 userData/ruili.db 种入 2 条流程，用于 GUI 冒烟验证 AppsView 真实列表。
 * 跑完后 .runtime/smoke-_apps.png 应能看到两张卡片。
 * 用法：npx vite-node scripts/poc-flow-seed.ts
 */
import { join } from 'path'
import { homedir } from 'os'
import { closeDb, openDb, saveFlow } from '../src/main/store/db'
import type { FlowDoc } from '../src/shared/ast'

function seedFlow(name: string, msg: string): FlowDoc {
  return {
    version: 1,
    name,
    vars: [{ name: 'kw', type: 'string', value: 'demo' }],
    steps: [
      { id: 's1', cmdId: 'logMessage', params: { message: `=== ${name} 开始 ===`, level: 'info' } },
      { id: 's2', cmdId: 'logMessage', params: { message: msg, level: 'success' } },
      { id: 's3', cmdId: 'delay', params: { ms: 200 } },
      { id: 's4', cmdId: 'logMessage', params: { message: '=== 结束 ===', level: 'info' } }
    ]
  }
}

async function main(): Promise<void> {
  // Electron userData：%APPDATA%/<name>（name=ruili-rpa）
  const dbPath = join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'ruili-rpa', 'ruili.db')
  console.log('DB path:', dbPath)
  openDb(dbPath)
  const r1 = saveFlow(seedFlow('电商比价巡检', '抓取价格: ${kw}'))
  console.log('seed1:', r1)
  const r2 = saveFlow(seedFlow('发票识别归档', '识别发票并入账'))
  console.log('seed2:', r2)
  closeDb()
  console.log('✅ 已种入 2 条流程，重新 smoke /apps 应见两张卡片')
}

void main()
