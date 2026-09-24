/**
 * POC · 网页 CDP 真实链路（阶段 3 验收）。
 *
 * 用独立 profile 启动真实 Chrome/Edge → 打开一个离线 data: URL 页面
 * → 在输入框输入 → 点击按钮 → 提取结果文本 → 断言。
 * 全程无头，不依赖外网。
 *
 * 运行：npm run poc:web
 */

import { RealWebSession } from '../src/engine/web/session'

function stamp(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function log(msg: string): void {
  console.log(`[${stamp()}] ${msg}`)
}

async function main(): Promise<void> {
  const pageHtml = `<!doctype html><html><body>
    <input id="q" placeholder="输入搜索词">
    <button id="btn">提交</button>
    <div id="out">未提交</div>
    <script>
      document.getElementById('btn').onclick = function () {
        var v = document.getElementById('q').value;
        document.getElementById('out').textContent = '结果:' + v;
      };
    <\/script>
  </body></html>`
  const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(pageHtml)

  const session = new RealWebSession({ headless: true })
  log('启动浏览器（独立 profile，无头）…')
  await session.start()
  try {
    log('打开 data: URL 测试页…')
    await session.goto(url)
    log(`页面标题：${await session.getTitle() || '（无）'}`)

    log('在 #q 输入「锐流 RPA」…')
    await session.fill('#q', '锐流 RPA')

    log('点击 #btn…')
    await session.click('#btn')

    const out = await session.getText('#out')
    log(`#out 文本：${out}`)

    if (out !== '结果:锐流 RPA') {
      throw new Error(`断言失败：期望 "结果:锐流 RPA"，实际 "${out}"`)
    }
    log('✅ 网页 CDP 链路 POC 通过：启动→打开→输入→点击→提取 全部真实跑通')
  } finally {
    await session.close()
  }
}

main().catch((e) => {
  console.error('❌ poc:web 失败：', e)
  process.exit(1)
})
