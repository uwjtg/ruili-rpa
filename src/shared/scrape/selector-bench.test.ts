/**
 * 选择器 / 抓取向导基准测试（M7-34，对应计划书 M3 验收：10 个典型页面抓取成功率 ≥80%）。
 *
 * 用 linkedom 在 Node 侧跑与生产同一份 INSPECT_FN_BODY / SCRAPE_FN_BODY
 * （不另起浏览器、不依赖外网，结果稳定可重复），覆盖 10 类典型布局：
 *   电商商品网格 / 搜索结果 / 后台订单表格 / 新闻列表 / 评论列表 /
 *   博客卡片 / 价格对比 / 应用列表 / 标签云 / 通知消息。
 * 每个用例：给一个示例项选择器 → inspect 自动聚类出整列 → scrape 抽字段。
 * 8/10 通过即达 80% 门禁。
 */
import { describe, expect, it } from 'vitest'
import { parseHTML } from 'linkedom'
import { INSPECT_FN_BODY, SCRAPE_FN_BODY } from './page-script'

interface Case {
  name: string
  html: string
  sampleSelector: string
  fields: Array<{ name: string; subSelector: string }>
  /** 期望抽出的数据行数 */
  expectRows: number
}

const CASES: Case[] = [
  {
    name: '电商商品网格（hash 类名）',
    html: `<div class="productList">
      <div class="card_abc123"><h3 class="name_xyz1">iPhone</h3><span class="price_qw1">5999</span></div>
      <div class="card_def456"><h3 class="name_xyz2">iPad</h3><span class="price_qw2">3299</span></div>
      <div class="card_ghi789"><h3 class="name_xyz3">Mac</h3><span class="price_qw3">9999</span></div>
    </div>`,
    sampleSelector: '.card_abc123',
    fields: [
      { name: 'title', subSelector: 'h3' },
      { name: 'price', subSelector: '.price_qw1' }
    ],
    expectRows: 3
  },
  {
    name: '搜索结果列表',
    html: `<div class="results">
      <div class="r"><a class="t">锐流 RPA 官网</a><p class="snippet">Windows 桌面自动化</p></div>
      <div class="r"><a class="t">影刀 RPA</a><p class="snippet">对比</p></div>
      <div class="r"><a class="t">Automation Anywhere</a><p class="snippet">海外产品</p></div>
    </div>`,
    sampleSelector: '.r',
    fields: [
      { name: 'title', subSelector: '.t' },
      { name: 'snippet', subSelector: '.snippet' }
    ],
    expectRows: 3
  },
  {
    name: '后台订单表格',
    html: `<table class="orders"><tbody>
      <tr class="row"><td>1001</td><td>张三</td><td class="amt">99</td></tr>
      <tr class="row"><td>1002</td><td>李四</td><td class="amt">200</td></tr>
      <tr class="row"><td>1003</td><td>王五</td><td class="amt">58</td></tr>
    </tbody></table>`,
    sampleSelector: 'tr.row',
    fields: [
      { name: 'id', subSelector: 'td' },
      { name: 'amount', subSelector: '.amt' }
    ],
    expectRows: 3
  },
  {
    name: '新闻列表（ul/li）',
    html: `<ul class="news">
      <li class="item"><a class="ttl">央行降息</a><time>2026-09-25</time></li>
      <li class="item"><a class="ttl">新车发布</a><time>2026-09-26</time></li>
      <li class="item"><a class="ttl">汇率波动</a><time>2026-09-27</time></li>
    </ul>`,
    sampleSelector: '.item',
    fields: [
      { name: 'title', subSelector: '.ttl' },
      { name: 'time', subSelector: 'time' }
    ],
    expectRows: 3
  },
  {
    name: '商品评论气泡',
    html: `<div class="comments">
      <div class="c"><p class="txt">质量很好</p><span class="user">u1</span></div>
      <div class="c"><p class="txt">物流快</p><span class="user">u2</span></div>
      <div class="c"><p class="txt">包装精美</p><span class="user">u3</span></div>
    </div>`,
    sampleSelector: '.c',
    fields: [
      { name: 'comment', subSelector: '.txt' },
      { name: 'user', subSelector: '.user' }
    ],
    expectRows: 3
  },
  {
    name: '博客文章卡片（article）',
    html: `<div class="posts">
      <article class="post"><h2>入门指南</h2><p class="ex">三分钟上手</p></article>
      <article class="post"><h2>进阶技巧</h2><p class="ex">选择器策略</p></article>
      <article class="post"><h2>实战案例</h2><p class="ex">比价流程</p></article>
    </div>`,
    sampleSelector: '.post',
    fields: [
      { name: 'heading', subSelector: 'h2' },
      { name: 'excerpt', subSelector: '.ex' }
    ],
    expectRows: 3
  },
  {
    name: '价格对比行',
    html: `<div class="prices">
      <div class="row"><span class="p">¥199</span><span class="ch">京东</span></div>
      <div class="row"><span class="p">¥189</span><span class="ch">天猫</span></div>
      <div class="row"><span class="p">¥209</span><span class="ch">拼多多</span></div>
    </div>`,
    sampleSelector: '.row',
    fields: [
      { name: 'price', subSelector: '.p' },
      { name: 'channel', subSelector: '.ch' }
    ],
    expectRows: 3
  },
  {
    name: '应用图标列表',
    html: `<div class="apps">
      <div class="app"><img class="icon"/><span class="nm">微信</span></div>
      <div class="app"><img class="icon"/><span class="nm">钉钉</span></div>
      <div class="app"><img class="icon"/><span class="nm">飞书</span></div>
    </div>`,
    sampleSelector: '.app',
    fields: [{ name: 'name', subSelector: '.nm' }],
    expectRows: 3
  },
  {
    name: '搜索历史标签（含计数）',
    html: `<div class="tags">
      <span class="tag"><span class="kw">Python</span><span class="cnt">12</span></span>
      <span class="tag"><span class="kw">RPA</span><span class="cnt">8</span></span>
      <span class="tag"><span class="kw">Electron</span><span class="cnt">5</span></span>
      <span class="tag"><span class="kw">自动化</span><span class="cnt">21</span></span>
    </div>`,
    sampleSelector: '.tag',
    fields: [
      { name: 'kw', subSelector: '.kw' },
      { name: 'count', subSelector: '.cnt' }
    ],
    expectRows: 4
  },
  {
    name: '系统通知消息',
    html: `<div class="msgs">
      <div class="msg"><b class="src">系统</b><p class="body">备份完成</p></div>
      <div class="msg"><b class="src">安全</b><p class="body">异地登录提醒</p></div>
      <div class="msg"><b class="src">更新</b><p class="body">新版本可用</p></div>
    </div>`,
    sampleSelector: '.msg',
    fields: [
      { name: 'source', subSelector: '.src' },
      { name: 'body', subSelector: '.body' }
    ],
    expectRows: 3
  }
]

function runInspect(doc: Document, sampleSelector: string): any {
  const fn = new Function('document', `return (${INSPECT_FN_BODY})(${JSON.stringify(sampleSelector)})`)
  return fn(doc)
}

function runScrape(doc: Document, listSelector: string, fields: Case['fields']): any[] {
  const fn = new Function(
    'document',
    'arg',
    `return (${SCRAPE_FN_BODY})(arg)`
  )
  return fn(doc, { listSelector, fields, maxItems: 0 })
}

describe('选择器基准：10 类典型页面抓取成功率 ≥80%（M3 验收）', () => {
  it('逐用例跑 inspect→scrape，统计通过率', () => {
    const results: Array<{ name: string; pass: boolean; detail: string }> = []
    for (const c of CASES) {
      const { document } = parseHTML(`<html><body>${c.html}</body></html>`)
      let detail = ''
      let pass = false
      try {
        const insp = runInspect(document, c.sampleSelector)
        if (!insp.ok) {
          detail = `inspect 失败: ${insp.error}`
        } else {
          const rows = runScrape(document, insp.listSelector, c.fields)
          if (rows.length !== c.expectRows) {
            detail = `行数 ${rows.length} != 期望 ${c.expectRows}（listSelector=${insp.listSelector}）`
          } else {
            // 每行至少第一个字段非空
            const first = c.fields[0].name
            const empty = rows.filter((r) => !String(r[first] ?? '').trim()).length
            if (empty > 0) detail = `${empty} 行首字段为空`
            else { pass = true; detail = `${rows.length} 行 OK（listSelector=${insp.listSelector}）` }
          }
        }
      } catch (e) {
        detail = `异常: ${e instanceof Error ? e.message : String(e)}`
      }
      results.push({ name: c.name, pass, detail })
    }
    const passed = results.filter((r) => r.pass).length
    console.log('\n=== 选择器基准结果 ===')
    for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name} — ${r.detail}`)
    console.log(`通过率：${passed}/${CASES.length} = ${Math.round((passed / CASES.length) * 100)}%`)
    // M3 门禁：≥80%（8/10）
    expect(passed).toBeGreaterThanOrEqual(8)
  })
})
