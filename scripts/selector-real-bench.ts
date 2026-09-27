/**
 * 真实站选择器基准（M7-35）：M3 验收的"真实站"版本。
 *
 * 与 selector-bench.test.ts 的本地 fixture 不同，这里直接抓两个专门给爬虫练习的
 * 沙盒站（长期稳定、不反爬）的真实 HTML，喂给 linkedom 跑与生产同一段
 * INSPECT_FN_BODY / SCRAPE_FN_BODY，验证真实 class 命名/结构下抓取是否成立。
 *
 * 运行：npm run bench:selectors
 * 不进 CI（联网、可能慢），手动跑；退出码非 0 表示某站抓取失败。
 */
import { parseHTML } from 'linkedom'
import { INSPECT_FN_BODY, SCRAPE_FN_BODY } from '../src/shared/scrape/page-script'

interface RealCase {
  name: string
  url: string
  sampleSelector: string
  fields: Array<{ name: string; subSelector: string; attr?: string }>
  expectMinRows: number
}

const CASES: RealCase[] = [
  {
    name: 'Books.toscrape 商品列表',
    url: 'https://books.toscrape.com/catalogue/page-1.html',
    // 商品卡片外包一层网格 <li class="col-xs-6">；示例选这层行节点（真实点选也常落此）
    sampleSelector: '.col-xs-6',
    fields: [
      { name: 'title', subSelector: '.product_pod h3 a', attr: 'title' },
      { name: 'price', subSelector: '.product_pod .price_color' }
    ],
    expectMinRows: 20
  },
  {
    name: 'Quotes.toscrape 名言列表',
    url: 'https://quotes.toscrape.com/',
    sampleSelector: '.quote',
    fields: [
      { name: 'text', subSelector: '.text' },
      { name: 'author', subSelector: '.author' }
    ],
    expectMinRows: 8
  }
]

function inspect(doc: Document, sampleSelector: string): any {
  const fn = new Function('document', `return (${INSPECT_FN_BODY})(${JSON.stringify(sampleSelector)})`)
  return fn(doc)
}
function scrape(doc: Document, listSelector: string, fields: RealCase['fields']): any[] {
  const fn = new Function('document', 'arg', `return (${SCRAPE_FN_BODY})(arg)`)
  return fn(doc, { listSelector, fields, maxItems: 0 })
}

async function runCase(c: RealCase): Promise<boolean> {
  process.stdout.write(`\n=== ${c.name} (${c.url}) ===\n`)
  const res = await fetch(c.url, { headers: { 'user-agent': 'ruili-rpa-bench/1.0' } })
  if (!res.ok) {
    console.error(`  ✗ HTTP ${res.status}`)
    return false
  }
  const html = await res.text()
  const { document } = parseHTML(html)
  const insp = inspect(document, c.sampleSelector)
  if (!insp.ok) {
    console.error(`  ✗ inspect 失败: ${insp.error}`)
    return false
  }
  console.log(`  ✓ listSelector=${insp.listSelector} 命中 ${insp.itemCount} 项`)
  const rows = scrape(document, insp.listSelector, c.fields)
  console.log(`  ✓ 抽出 ${rows.length} 行，前 2 条：`)
  for (const r of rows.slice(0, 2)) console.log('    ', JSON.stringify(r))
  if (rows.length < c.expectMinRows) {
    console.error(`  ✗ 行数 ${rows.length} < 期望 ${c.expectMinRows}`)
    return false
  }
  const first = c.fields[0].name
  const empty = rows.filter((r) => !String(r[first] ?? '').trim()).length
  if (empty > 0) {
    console.error(`  ✗ ${empty} 行首字段为空`)
    return false
  }
  return true
}

async function main(): Promise<void> {
  let pass = 0
  for (const c of CASES) {
    if (await runCase(c)) pass++
  }
  console.log(`\n真实站通过率：${pass}/${CASES.length}`)
  if (pass !== CASES.length) process.exit(1)
}

void main()
