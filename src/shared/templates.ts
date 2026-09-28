/**
 * 官方内置模板（M5 切片 23 · 计划书 §6.6「官方模板 30+」）。
 *
 * 纯数据：每个模板是一份可直接另存的 FlowDoc。
 * - 只引用 buildEngineRegistry() 中已注册的指令（见 templates.test.ts 全量校验）；
 * - 跑不动外部进程的模板（网页/桌面/OCR/Excel 路径）把目标收进 vars，
 *   关键变量标 required + description，运行前弹窗提示用户按实际环境填写；
 * - 入门类模板不依赖外部进程，开箱即跑，用于第一次接触产品的人建立信心。
 *
 * 注意指令插值边界（runner 自行决定是否 interpolate）：
 *   会插值：logMessage.message / web*.selector,value / excel*.path,value,values /
 *           sidecarOcr.imagePath / pickElement.target / typeText.text / pressKey.keys / scroll.delta
 *   不插值（必须字面量）：delay.ms / randomInt.min,max / excelReadCell.row,col /
 *           webScroll.deltaY / setVar.value / ifVar.expected
 *
 * 「使用模板」= 渲染端把本 FlowDoc 经 flow.save() 另存为新流程，再跳编辑器打开。
 * 本文件不 import electron / DOM，便于 vitest 直接校验。
 */
import type { FlowDoc, FlowVar, StepNode } from './ast'

/** 模板元信息（市场卡片渲染用） */
export interface TemplateInfo {
  /** 稳定 id（不随流程落盘 id 变化） */
  id: string
  name: string
  /** 市场分类（chips） */
  category: string
  /** 一句话用途说明 */
  description: string
  /** 卡片图标（必须存在于 components/iconPaths） */
  icon: string
  flow: FlowDoc
}

/** 小帮手：构造一个步骤节点 */
function step(
  id: string,
  cmdId: string,
  params: Record<string, unknown> = {},
  children?: StepNode[],
  elseBranch?: StepNode[]
): StepNode {
  const n: StepNode = { id, cmdId, params }
  if (children) n.children = children
  if (elseBranch) n.else = elseBranch
  return n
}

/** 小帮手：构造一份流程 */
function flow(name: string, vars: FlowVar[], steps: StepNode[]): FlowDoc {
  return { version: 1, name, vars, steps }
}

/* ============ 入门示例（纯通用指令，开箱即跑） ============ */

const hello: TemplateInfo = {
  id: 'hello-first-flow',
  name: '我的第一个流程',
  category: '入门示例',
  description: '输出日志 + 等待 + 变量，30 秒看懂 RPA 流程长什么样',
  icon: 'terminal',
  flow: flow('我的第一个流程', [], [
    step('s1', 'logMessage', { message: '你好，锐流 RPA！', level: 'info' }),
    step('s2', 'delay', { ms: 500 }),
    step('s3', 'setVar', { name: 'user', value: '同学' }),
    step('s4', 'logMessage', { message: '${user}，流程运行成功', level: 'success' })
  ])
}

const logLevels: TemplateInfo = {
  id: 'log-levels',
  name: '日志分级演示',
  category: '入门示例',
  description: '信息 / 成功 / 警告 / 错误四级日志长什么样',
  icon: 'terminal',
  flow: flow('日志分级演示', [], [
    step('s1', 'logMessage', { message: '这是一条普通信息', level: 'info' }),
    step('s2', 'logMessage', { message: '这是一条成功日志', level: 'success' }),
    step('s3', 'logMessage', { message: '这是一条警告日志', level: 'warn' }),
    step('s4', 'logMessage', { message: '这是一条错误日志', level: 'error' })
  ])
}

const setVars: TemplateInfo = {
  id: 'set-vars',
  name: '变量赋值与打印',
  category: '入门示例',
  description: '设置字符串 / 数字 / 列表变量，并在日志里插值引用',
  icon: 'equals',
  flow: flow('变量赋值与打印', [], [
    step('s1', 'setVar', { name: 'city', value: '揭阳' }),
    step('s2', 'setVar', { name: 'temp', value: '26' }),
    step('s3', 'logMessage', { message: '${city} 今天 ${temp} 度', level: 'info' }),
    step('s4', 'setVar', { name: 'tags', value: '["RPA","自动化","办公"]' }),
    step('s5', 'logMessage', { message: '标签：${tags}', level: 'info' })
  ])
}

const randomDraw: TemplateInfo = {
  id: 'random-draw',
  name: '随机抽奖',
  category: '入门示例',
  description: '从 1~100 随机抽一个中奖号码',
  icon: 'chart',
  flow: flow('随机抽奖', [], [
    step('s1', 'logMessage', { message: '开始抽奖（1 ~ 100）…', level: 'info' }),
    step('s2', 'randomInt', { min: 1, max: 100, resultVar: 'winner' }),
    step('s3', 'logMessage', { message: '中奖号码是：${winner}', level: 'success' })
  ])
}

const loopDemo: TemplateInfo = {
  id: 'loop-demo',
  name: '循环列表逐条处理',
  category: '入门示例',
  description: '遍历一个列表变量，对每一项执行子步骤',
  icon: 'loop',
  flow: flow('循环列表逐条处理', [
    { name: 'nums', type: 'list', value: [1, 2, 3, 4, 5] }
  ], [
    step('s1', 'logMessage', { message: '开始遍历 nums…', level: 'info' }),
    step(
      's2',
      'loopList',
      { listVar: 'nums', itemVar: 'n' },
      [step('s2-1', 'logMessage', { message: '处理第 ${n} 项', level: 'info' })]
    ),
    step('s3', 'logMessage', { message: '全部处理完毕', level: 'success' })
  ])
}

const ifGrade: TemplateInfo = {
  id: 'if-grade',
  name: '条件判断·成绩评级',
  category: '入门示例',
  description: '根据分数判断及格与否，演示 if 真/假分支',
  icon: 'branch',
  flow: flow('成绩评级', [{ name: 'score', type: 'number', value: 82 }], [
    step('s1', 'logMessage', { message: '考生分数：${score}', level: 'info' }),
    step(
      's2',
      'ifVar',
      { varName: 'score', op: 'gt', expected: '59' },
      [step('s2-1', 'logMessage', { message: '及格', level: 'success' })],
      [step('s2-2', 'logMessage', { message: '不及格', level: 'error' })]
    )
  ])
}

const countdown: TemplateInfo = {
  id: 'countdown',
  name: '倒计时循环',
  category: '入门示例',
  description: '用 JSON 列表做倒计时，每步停顿一下',
  icon: 'clock',
  flow: flow('倒计时', [], [
    step('s1', 'setVar', { name: 'cd', value: '[3,2,1]' }),
    step(
      's2',
      'loopList',
      { listVar: 'cd', itemVar: 'n' },
      [
        step('s2-1', 'logMessage', { message: '${n}…', level: 'warn' }),
        step('s2-2', 'delay', { ms: 800 })
      ]
    ),
    step('s3', 'logMessage', { message: '开始！', level: 'success' })
  ])
}

const jsonDemo: TemplateInfo = {
  id: 'json-demo',
  name: '解析 JSON 数据',
  category: '入门示例',
  description: '把字符串 JSON 解析成对象，再打印',
  icon: 'list',
  flow: flow('解析 JSON', [], [
    step('s1', 'setVar', {
      name: 'raw',
      value: '{"name":"机械键盘","price":299,"stock":50}'
    }),
    step('s2', 'jsonParse', { sourceVar: 'raw', resultVar: 'obj' }),
    step('s3', 'logMessage', { message: '商品：${obj}', level: 'info' })
  ])
}

const httpMock: TemplateInfo = {
  id: 'http-mock',
  name: 'HTTP 请求模拟取数',
  category: '入门示例',
  description: '演示「请求 → 拿列表 → 遍历」的标准取数流程（演示数据）',
  icon: 'globe',
  flow: flow('HTTP 模拟取数', [], [
    step('s1', 'httpGet', { url: 'https://api.example.com/products', resultVar: 'rows' }),
    step(
      's2',
      'loopList',
      { listVar: 'rows', itemVar: 'row' },
      [step('s2-1', 'logMessage', { message: '${row}', level: 'info' })]
    )
  ])
}

const nestedIf: TemplateInfo = {
  id: 'nested-grade',
  name: '多条件分级',
  category: '入门示例',
  description: '在 else 分支里再嵌套 if，做三档评级',
  icon: 'branch',
  flow: flow('三档评级', [{ name: 'score', type: 'number', value: 95 }], [
    step('s1', 'logMessage', { message: '分数：${score}', level: 'info' }),
    step(
      's2',
      'ifVar',
      { varName: 'score', op: 'gt', expected: '89' },
      [step('s2-1', 'logMessage', { message: '优秀', level: 'success' })],
      [
        step(
          's2-2',
          'ifVar',
          { varName: 'score', op: 'gt', expected: '59' },
          [step('s2-2-1', 'logMessage', { message: '合格', level: 'info' })],
          [step('s2-2-2', 'logMessage', { message: '待提高', level: 'warn' })]
        )
      ]
    )
  ])
}

/* ============ 网页自动化（需真实浏览器） ============ */

const bingSearch: TemplateInfo = {
  id: 'web-bing-search',
  name: 'Bing 搜索关键词',
  category: '网页自动化',
  description: '打开浏览器 → 搜索关键词 → 等待结果 → 提取第一条标题',
  icon: 'search',
  flow: flow('Bing 搜索关键词', [
    {
      name: 'kw',
      type: 'string',
      value: '锐流 RPA',
      required: true,
      description: '要搜索的关键词'
    }
  ], [
    step('s1', 'logMessage', { message: '准备搜索：${kw}', level: 'info' }),
    step('s2', 'webOpenBrowser', { channel: 'auto' }),
    step('s3', 'webOpenUrl', { url: 'https://www.bing.com' }),
    step('s4', 'webWaitFor', { selector: 'input[name="q"]', timeoutMs: 8000 }),
    step('s5', 'webInput', { selector: 'input[name="q"]', value: '${kw}' }),
    step('s6', 'webPressKey', { key: 'Enter' }),
    step('s7', 'webWaitFor', { selector: '#b_results', timeoutMs: 8000 }),
    step('s8', 'webExtractText', { selector: '#b_results h2 a', resultVar: 'firstTitle' }),
    step('s9', 'logMessage', { message: '第一条结果：${firstTitle}', level: 'success' }),
    step('s10', 'webCloseBrowser')
  ])
}

const baiduSearch: TemplateInfo = {
  id: 'web-baidu-search',
  name: '百度搜索关键词',
  category: '网页自动化',
  description: '百度首页输入关键词并搜索，等待结果出现',
  icon: 'search',
  flow: flow('百度搜索关键词', [
    {
      name: 'kw',
      type: 'string',
      value: '自动化办公',
      required: true,
      description: '要搜索的关键词'
    }
  ], [
    step('s1', 'webOpenBrowser', { channel: 'auto' }),
    step('s2', 'webOpenUrl', { url: 'https://www.baidu.com' }),
    step('s3', 'webWaitFor', { selector: '#kw', timeoutMs: 8000 }),
    step('s4', 'webInput', { selector: '#kw', value: '${kw}' }),
    step('s5', 'webClick', { selector: '#su' }),
    step('s6', 'webWaitFor', { selector: '#content_left', timeoutMs: 8000 }),
    step('s7', 'logMessage', { message: '「${kw}」搜索完成', level: 'success' }),
    step('s8', 'webCloseBrowser')
  ])
}

const openUrlTitle: TemplateInfo = {
  id: 'web-open-title',
  name: '打开网址并记录标题',
  category: '网页自动化',
  description: '打开指定网址，把页面标题存入变量并打印',
  icon: 'globe',
  flow: flow('打开网址并记录标题', [
    {
      name: 'url',
      type: 'string',
      value: 'https://www.bing.com',
      required: true,
      description: '要打开的网址'
    }
  ], [
    step('s1', 'webOpenBrowser', { channel: 'auto' }),
    step('s2', 'webOpenUrl', { url: '${url}', titleVar: 'pageTitle' }),
    step('s3', 'logMessage', { message: '页面标题：${pageTitle}', level: 'success' }),
    step('s4', 'webCloseBrowser')
  ])
}

const fillForm: TemplateInfo = {
  id: 'web-fill-form',
  name: '网页填表示例',
  category: '网页自动化',
  description: '在输入框填入文本并回车（把选择器改成你要操作的表单）',
  icon: 'keyboard',
  flow: flow('网页填表示例', [
    { name: 'inputSelector', type: 'string', value: 'input[name="q"]', description: '输入框 CSS 选择器' },
    { name: 'text', type: 'string', value: '示例文本', required: true, description: '要填入的内容' }
  ], [
    step('s1', 'webOpenBrowser', { channel: 'auto' }),
    step('s2', 'webOpenUrl', { url: 'https://www.bing.com' }),
    step('s3', 'webWaitFor', { selector: '${inputSelector}', timeoutMs: 8000 }),
    step('s4', 'webInput', { selector: '${inputSelector}', value: '${text}' }),
    step('s5', 'webPressKey', { key: 'Enter' }),
    step('s6', 'delay', { ms: 1500 }),
    step('s7', 'webCloseBrowser')
  ])
}

const webScroll: TemplateInfo = {
  id: 'web-scroll',
  name: '网页滚动浏览',
  category: '网页自动化',
  description: '打开长页面后向下滚动，模拟人浏览',
  icon: 'mouse',
  flow: flow('网页滚动浏览', [], [
    step('s1', 'webOpenBrowser', { channel: 'auto' }),
    step('s2', 'webOpenUrl', { url: 'https://www.bing.com' }),
    step('s3', 'delay', { ms: 800 }),
    step('s4', 'webScroll', { deltaY: 600 }),
    step('s5', 'delay', { ms: 500 }),
    step('s6', 'webScroll', { deltaY: 600 }),
    step('s7', 'logMessage', { message: '滚动完成', level: 'success' }),
    step('s8', 'webCloseBrowser')
  ])
}

const webWait: TemplateInfo = {
  id: 'web-wait-element',
  name: '等待元素出现',
  category: '网页自动化',
  description: '演示显式等待：等元素出现后再操作，避免页面没加载完就点',
  icon: 'clock',
  flow: flow('等待元素出现', [], [
    step('s1', 'webOpenBrowser', { channel: 'auto' }),
    step('s2', 'webOpenUrl', { url: 'https://www.bing.com' }),
    step('s3', 'webWaitFor', { selector: 'input[name="q"]', timeoutMs: 10000 }),
    step('s4', 'logMessage', { message: '搜索框已出现，可以开始操作', level: 'success' }),
    step('s5', 'webCloseBrowser')
  ])
}

const scrapeRecipe: TemplateInfo = {
  id: 'web-scrape-list',
  name: '抓取列表数据导出',
  category: '网页自动化',
  description: '抓取列表页字段并导出 CSV（选择器需按目标站调整）',
  icon: 'cursor',
  flow: flow('抓取列表数据导出', [
    { name: 'listSelector', type: 'string', value: '.product-item', description: '列表项选择器' },
    { name: 'outCsv', type: 'string', value: 'D:\\scrape.csv', description: '导出 CSV 路径' }
  ], [
    step('s1', 'logMessage', { message: '提示：先用编辑器「数据抓取」向导点选示例项生成选择器', level: 'warn' }),
    step('s2', 'webOpenBrowser', { channel: 'auto' }),
    step('s3', 'webOpenUrl', { url: 'https://example.com/products' }),
    step('s4', 'webScrapeList', {
      listSelector: '${listSelector}',
      fieldsJson: '[{"name":"标题","subSelector":".title"},{"name":"价格","subSelector":".price"}]',
      resultVar: 'rows',
      maxPages: 2,
      csvPath: '${outCsv}'
    }),
    step('s5', 'logMessage', { message: '抓取完成', level: 'success' }),
    step('s6', 'webCloseBrowser')
  ])
}

const iframeRecipe: TemplateInfo = {
  id: 'web-iframe',
  name: 'iframe 内操作示例',
  category: '网页自动化',
  description: '跨 iframe 点击/输入的写法（frame 参数指向 iframe）',
  icon: 'window',
  flow: flow('iframe 内操作示例', [
    { name: 'frameSel', type: 'string', value: 'iframe#main', description: '目标 iframe 选择器' },
    { name: 'innerSel', type: 'string', value: 'button.submit', description: 'iframe 内元素选择器' }
  ], [
    step('s1', 'logMessage', { message: '提示：把 frame/元素选择器改成实际页面值', level: 'warn' }),
    step('s2', 'webOpenBrowser', { channel: 'auto' }),
    step('s3', 'webOpenUrl', { url: 'https://example.com' }),
    step('s4', 'webWaitFor', { selector: '${innerSel}', timeoutMs: 8000, frame: '${frameSel}' }),
    step('s5', 'webClick', { selector: '${innerSel}', frame: '${frameSel}' }),
    step('s6', 'webCloseBrowser')
  ])
}

/* ============ Excel 表格（exceljs，不依赖 Office） ============ */

const excelCreate: TemplateInfo = {
  id: 'excel-create-save',
  name: '新建并保存报表',
  category: 'Excel表格',
  description: '新建工作簿 → 写表头和一行数据 → 另存为 .xlsx',
  icon: 'table',
  flow: flow('新建并保存报表', [
    {
      name: 'outPath',
      type: 'string',
      value: 'D:\\report.xlsx',
      required: true,
      description: '保存的 .xlsx 路径'
    }
  ], [
    step('s1', 'excelCreate'),
    step('s2', 'excelWriteRow', { sheet: 'Sheet1', row: 1, values: '["姓名","部门","薪资"]' }),
    step('s3', 'excelWriteRow', { sheet: 'Sheet1', row: 2, values: '["张三","运营",8500]' }),
    step('s4', 'excelSave', { path: '${outPath}' }),
    step('s5', 'logMessage', { message: '已保存：${outPath}', level: 'success' })
  ])
}

const excelTable: TemplateInfo = {
  id: 'excel-sales-table',
  name: '写入销售明细表',
  category: 'Excel表格',
  description: '一次写入多行销售明细，做成一张规整的表',
  icon: 'table',
  flow: flow('销售明细表', [
    { name: 'outPath', type: 'string', value: 'D:\\sales.xlsx', description: '保存路径' }
  ], [
    step('s1', 'excelCreate'),
    step('s2', 'excelWriteRow', { sheet: 'Sheet1', row: 1, values: '["日期","商品","数量","金额"]' }),
    step('s3', 'excelWriteRow', { sheet: 'Sheet1', row: 2, values: '["09-25","键盘",3,897]' }),
    step('s4', 'excelWriteRow', { sheet: 'Sheet1', row: 3, values: '["09-25","鼠标",5,495]' }),
    step('s5', 'excelWriteRow', { sheet: 'Sheet1', row: 4, values: '["09-26","耳机",2,638]' }),
    step('s6', 'excelSave', { path: '${outPath}' }),
    step('s7', 'logMessage', { message: '销售明细已写入 ${outPath}', level: 'success' })
  ])
}

const excelRead: TemplateInfo = {
  id: 'excel-read-cell',
  name: '读取单元格',
  category: 'Excel表格',
  description: '打开已有 Excel，读 A1 内容到变量并打印',
  icon: 'search',
  flow: flow('读取单元格', [
    { name: 'srcPath', type: 'string', value: 'D:\\report.xlsx', required: true, description: '要读取的 Excel 路径' }
  ], [
    step('s1', 'excelOpen', { path: '${srcPath}' }),
    step('s2', 'excelReadCell', { sheet: 'Sheet1', row: 1, col: 1, resultVar: 'val' }),
    step('s3', 'logMessage', { message: '读到值：${val}', level: 'success' })
  ])
}

const excelAppend: TemplateInfo = {
  id: 'excel-append-row',
  name: '追加一行数据',
  category: 'Excel表格',
  description: '打开已有表，在第 3 行追加一行新记录',
  icon: 'plus',
  flow: flow('追加一行数据', [
    { name: 'srcPath', type: 'string', value: 'D:\\report.xlsx', required: true, description: '已有 Excel 路径' },
    { name: 'newName', type: 'string', value: '李四' },
    { name: 'newDept', type: 'string', value: '客服' },
    { name: 'newSal', type: 'number', value: 7200 }
  ], [
    step('s1', 'excelOpen', { path: '${srcPath}' }),
    step('s2', 'excelWriteRow', { sheet: 'Sheet1', row: 3, values: '["${newName}","${newDept}",${newSal}]' }),
    step('s3', 'excelSave', { path: '${srcPath}' }),
    step('s4', 'logMessage', { message: '已追加一行：${newName}', level: 'success' })
  ])
}

const excelMulti: TemplateInfo = {
  id: 'excel-multi-cell',
  name: '逐格写入',
  category: 'Excel表格',
  description: '用写单元格指令逐格填内容（适合少量定位写入）',
  icon: 'edit',
  flow: flow('逐格写入', [
    { name: 'outPath', type: 'string', value: 'D:\\grid.xlsx' }
  ], [
    step('s1', 'excelCreate'),
    step('s2', 'excelWriteCell', { sheet: 'Sheet1', row: 1, col: 1, value: '姓名' }),
    step('s3', 'excelWriteCell', { sheet: 'Sheet1', row: 1, col: 2, value: '城市' }),
    step('s4', 'excelWriteCell', { sheet: 'Sheet1', row: 2, col: 1, value: '王五' }),
    step('s5', 'excelWriteCell', { sheet: 'Sheet1', row: 2, col: 2, value: '深圳' }),
    step('s6', 'excelSave', { path: '${outPath}' })
  ])
}

/* ============ 桌面自动化（需先拾取/聚焦目标窗口） ============ */

const desktopType: TemplateInfo = {
  id: 'desktop-type-text',
  name: '桌面输入文字并回车',
  category: '桌面自动化',
  description: '向当前聚焦窗口输入文本，再按回车（先点一下要输入的框）',
  icon: 'keyboard',
  flow: flow('桌面输入文字', [
    { name: 'text', type: 'string', value: '你好，锐流 RPA', required: true, description: '要输入的文本' }
  ], [
    step('s1', 'logMessage', { message: '提示：运行前先用鼠标点一下要输入的输入框', level: 'warn' }),
    step('s2', 'delay', { ms: 1000 }),
    step('s3', 'typeText', { text: '${text}' }),
    step('s4', 'pressKey', { keys: 'Enter' }),
    step('s5', 'logMessage', { message: '已输入并回车', level: 'success' })
  ])
}

const desktopHotkey: TemplateInfo = {
  id: 'desktop-hotkey',
  name: '桌面快捷键组合',
  category: '桌面自动化',
  description: '发送 Ctrl+S / Ctrl+A 等组合键（先激活目标窗口）',
  icon: 'keyboard',
  flow: flow('桌面快捷键', [
    { name: 'keys', type: 'string', value: 'Control+S', description: '按键组合，如 Control+S' }
  ], [
    step('s1', 'logMessage', { message: '提示：运行前先激活要操作的窗口', level: 'warn' }),
    step('s2', 'delay', { ms: 800 }),
    step('s3', 'pressKey', { keys: '${keys}' }),
    step('s4', 'logMessage', { message: '已按下 ${keys}', level: 'success' })
  ])
}

const desktopPick: TemplateInfo = {
  id: 'desktop-pick-click',
  name: '拾取元素后点击',
  category: '桌面自动化',
  description: '用工具栏「拾取」点选一个桌面控件，运行时按选择器定位并点击',
  icon: 'cursor',
  flow: flow('拾取元素后点击', [], [
    step('s1', 'logMessage', { message: '提示：点工具栏「拾取」选好控件后再运行；target 留空会报错', level: 'warn' }),
    step('s2', 'pickElement', { target: '', retries: 2 }),
    step('s3', 'logMessage', { message: '已点击目标元素', level: 'success' })
  ])
}

const desktopScroll: TemplateInfo = {
  id: 'desktop-scroll',
  name: '桌面滚动鼠标',
  category: '桌面自动化',
  description: '在当前光标位置上下滚动滚轮',
  icon: 'mouse',
  flow: flow('桌面滚动', [
    { name: 'delta', type: 'number', value: -300, description: '滚动量，负=向下' }
  ], [
    step('s1', 'logMessage', { message: '提示：把鼠标悬停到要滚动的区域', level: 'warn' }),
    step('s2', 'delay', { ms: 800 }),
    step('s3', 'scroll', { target: '', delta: '${delta}' }),
    step('s4', 'logMessage', { message: '滚动完成', level: 'success' })
  ])
}

/* ============ 图像 OCR ============ */

const ocrImage: TemplateInfo = {
  id: 'ocr-image',
  name: 'OCR 识别图片文字',
  category: '图像OCR',
  description: '启动 Python 助手 → 识别本地图片中的文字 → 打印结果',
  icon: 'scan',
  flow: flow('OCR 识别图片', [
    {
      name: 'imagePath',
      type: 'string',
      value: 'D:\\sample.png',
      required: true,
      description: '要识别的图片完整路径'
    }
  ], [
    step('s1', 'sidecarStart'),
    step('s2', 'sidecarOcr', { imagePath: '${imagePath}', resultVar: 'text' }),
    step('s3', 'logMessage', { message: '识别结果：${text}', level: 'success' }),
    step('s4', 'sidecarStop')
  ])
}

const ocrToExcel: TemplateInfo = {
  id: 'ocr-to-excel',
  name: 'OCR 结果写入 Excel',
  category: '图像OCR',
  description: '识别一张图片，把文字结果落成一行 Excel',
  icon: 'doc',
  flow: flow('OCR 写入 Excel', [
    { name: 'imagePath', type: 'string', value: 'D:\\receipt.png', required: true, description: '图片路径' },
    { name: 'outPath', type: 'string', value: 'D:\\ocr.xlsx', description: '输出 Excel 路径' }
  ], [
    step('s1', 'sidecarStart'),
    step('s2', 'sidecarOcr', { imagePath: '${imagePath}', resultVar: 'text' }),
    step('s3', 'excelCreate'),
    step('s4', 'excelWriteRow', { sheet: 'Sheet1', row: 1, values: '["图片","识别文字"]' }),
    step('s5', 'excelWriteRow', { sheet: 'Sheet1', row: 2, values: '["${imagePath}","${text}"]' }),
    step('s6', 'excelSave', { path: '${outPath}' }),
    step('s7', 'sidecarStop'),
    step('s8', 'logMessage', { message: '已写入 ${outPath}', level: 'success' })
  ])
}

/* ============ 综合 / 端到端 ============ */

const e2eSearchToExcel: TemplateInfo = {
  id: 'e2e-search-to-excel',
  name: '搜索结果写入 Excel',
  category: '实用工具',
  description: '打开 Bing 搜索 → 提取首条标题 → 写入 Excel 保存',
  icon: 'globe',
  flow: flow('搜索结果写入 Excel', [
    { name: 'kw', type: 'string', value: '机械键盘', required: true, description: '搜索关键词' },
    { name: 'outPath', type: 'string', value: 'D:\\search.xlsx', description: '输出 Excel 路径' }
  ], [
    step('s1', 'webOpenBrowser', { channel: 'auto' }),
    step('s2', 'webOpenUrl', { url: 'https://www.bing.com' }),
    step('s3', 'webWaitFor', { selector: 'input[name="q"]', timeoutMs: 8000 }),
    step('s4', 'webInput', { selector: 'input[name="q"]', value: '${kw}' }),
    step('s5', 'webPressKey', { key: 'Enter' }),
    step('s6', 'webWaitFor', { selector: '#b_results h2 a', timeoutMs: 8000 }),
    step('s7', 'webExtractText', { selector: '#b_results h2 a', resultVar: 'title' }),
    step('s8', 'webCloseBrowser'),
    step('s9', 'excelCreate'),
    step('s10', 'excelWriteRow', { sheet: 'Sheet1', row: 1, values: '["关键词","首条结果"]' }),
    step('s11', 'excelWriteRow', { sheet: 'Sheet1', row: 2, values: '["${kw}","${title}"]' }),
    step('s12', 'excelSave', { path: '${outPath}' }),
    step('s13', 'logMessage', { message: '完成：${outPath}', level: 'success' })
  ])
}

const e2eScrapeCsv: TemplateInfo = {
  id: 'e2e-scrape-csv',
  name: '抓取数据导出 CSV',
  category: '实用工具',
  description: '打开列表页 → 抓取字段 → 一键导出 CSV（选择器按站点调）',
  icon: 'file',
  flow: flow('抓取数据导出 CSV', [
    { name: 'pageUrl', type: 'string', value: 'https://example.com/products', required: true, description: '列表页网址' },
    { name: 'listSel', type: 'string', value: '.item', description: '列表项选择器' },
    { name: 'csvPath', type: 'string', value: 'D:\\out.csv', description: '导出 CSV 路径' }
  ], [
    step('s1', 'logMessage', { message: '提示：建议先用「数据抓取」向导生成选择器', level: 'warn' }),
    step('s2', 'webOpenBrowser', { channel: 'auto' }),
    step('s3', 'webOpenUrl', { url: '${pageUrl}' }),
    step('s4', 'webScrapeList', {
      listSelector: '${listSel}',
      fieldsJson: '[{"name":"标题","subSelector":".title"}]',
      resultVar: 'rows',
      maxPages: 1,
      csvPath: '${csvPath}'
    }),
    step('s5', 'webCloseBrowser'),
    step('s6', 'logMessage', { message: '导出完成：${csvPath}', level: 'success' })
  ])
}

const reportRecipe: TemplateInfo = {
  id: 'recipe-daily-report',
  name: '定时日报骨架',
  category: '实用工具',
  description: '一条可挂到「计划任务」的日报流程骨架（挂触发器后按点跑）',
  icon: 'clock',
  flow: flow('每日日报骨架', [], [
    step('s1', 'logMessage', { message: '【日报】开始生成今日数据…', level: 'info' }),
    step('s2', 'delay', { ms: 500 }),
    step('s3', 'logMessage', { message: '【日报】数据汇总完成（在此接入真实取数）', level: 'info' }),
    step('s4', 'logMessage', { message: '【日报】完成 · 可在「触发器·计划任务」里定时运行本流程', level: 'success' })
  ])
}

const pollLoop: TemplateInfo = {
  id: 'recipe-poll-loop',
  name: '轮询检查骨架',
  category: '实用工具',
  description: '循环 + 等待的轮询模板，适合「每隔几秒检查一次」场景',
  icon: 'loop',
  flow: flow('轮询检查骨架', [
    { name: 'rounds', type: 'list', value: [1, 2, 3, 4, 5], description: '轮询轮次列表（几项就循环几次）' }
  ], [
    step('s1', 'logMessage', { message: '开始轮询…', level: 'info' }),
    step(
      's2',
      'loopList',
      { listVar: 'rounds', itemVar: 'i' },
      [
        step('s2-1', 'logMessage', { message: '第 ${i} 次检查…', level: 'info' }),
        step('s2-2', 'delay', { ms: 1000 })
      ]
    ),
    step('s3', 'logMessage', { message: '轮询结束', level: 'success' })
  ])
}

/* ============ 第二批：覆盖此前未成模板的指令组合 ============ */

const webPressKeys: TemplateInfo = {
  id: 'web-press-keys',
  name: '网页功能键（Tab/Esc）',
  category: '网页自动化',
  description: '演示在网页上按 Tab 切焦点、按 Esc 关闭浮层',
  icon: 'keyboard',
  flow: flow('网页功能键', [], [
    step('s1', 'webOpenBrowser', { channel: 'auto' }),
    step('s2', 'webOpenUrl', { url: 'https://www.bing.com' }),
    step('s3', 'webWaitFor', { selector: 'input[name="q"]', timeoutMs: 8000 }),
    step('s4', 'webPressKey', { key: 'Tab' }),
    step('s5', 'delay', { ms: 300 }),
    step('s6', 'webPressKey', { key: 'Escape' }),
    step('s7', 'webCloseBrowser')
  ])
}

const webLoginRecipe: TemplateInfo = {
  id: 'web-login-recipe',
  name: '登录表单填写样例',
  category: '网页自动化',
  description: '打开页面 → 填账号密码 → 点登录（选择器按目标站改）',
  icon: 'keyboard',
  flow: flow('登录表单样例', [
    { name: 'loginUrl', type: 'string', value: 'https://example.com/login', required: true, description: '登录页网址' },
    { name: 'userSel', type: 'string', value: 'input[name=user]', description: '账号框选择器' },
    { name: 'passSel', type: 'string', value: 'input[name=pass]', description: '密码框选择器' },
    { name: 'submitSel', type: 'string', value: 'button[type=submit]', description: '登录按钮选择器' },
    { name: 'username', type: 'string', value: 'demo', required: true, description: '账号' },
    { name: 'password', type: 'string', value: 'demo123', required: true, description: '密码' }
  ], [
    step('s1', 'webOpenBrowser', { channel: 'auto' }),
    step('s2', 'webOpenUrl', { url: '${loginUrl}' }),
    step('s3', 'webWaitFor', { selector: '${userSel}', timeoutMs: 8000 }),
    step('s4', 'webInput', { selector: '${userSel}', value: '${username}' }),
    step('s5', 'webInput', { selector: '${passSel}', value: '${password}' }),
    step('s6', 'webClick', { selector: '${submitSel}' }),
    step('s7', 'delay', { ms: 1500 }),
    step('s8', 'webCloseBrowser')
  ])
}

const webClickAfterWait: TemplateInfo = {
  id: 'web-click-wait',
  name: '等待后点击按钮',
  category: '网页自动化',
  description: '显式等待按钮出现再点，避免抢跑',
  icon: 'cursor',
  flow: flow('等待后点击按钮', [
    { name: 'btnSel', type: 'string', value: '#search_btn', description: '按钮选择器' }
  ], [
    step('s1', 'webOpenBrowser', { channel: 'auto' }),
    step('s2', 'webOpenUrl', { url: 'https://www.baidu.com' }),
    step('s3', 'webWaitFor', { selector: '${btnSel}', timeoutMs: 8000 }),
    step('s4', 'webClick', { selector: '${btnSel}' }),
    step('s5', 'webCloseBrowser')
  ])
}

const webPaginate: TemplateInfo = {
  id: 'web-paginate',
  name: '翻页抓取多页',
  category: '网页自动化',
  description: '抓列表多页：自动点下一页直到 maxPages',
  icon: 'cursor',
  flow: flow('翻页抓取多页', [
    { name: 'pageUrl', type: 'string', value: 'https://example.com/list', required: true },
    { name: 'listSel', type: 'string', value: '.item' },
    { name: 'nextSel', type: 'string', value: '.next a', description: '下一页按钮选择器' },
    { name: 'xlsxPath', type: 'string', value: 'D:\\pages.xlsx', description: '导出 Excel 路径' }
  ], [
    step('s1', 'logMessage', { message: '提示：选择器用「数据抓取」向导生成更稳', level: 'warn' }),
    step('s2', 'webOpenBrowser', { channel: 'auto' }),
    step('s3', 'webOpenUrl', { url: '${pageUrl}' }),
    step('s4', 'webScrapeList', {
      listSelector: '${listSel}',
      fieldsJson: '[{"name":"标题","subSelector":".title"}]',
      resultVar: 'rows',
      nextSelector: '${nextSel}',
      maxPages: 3,
      xlsxPath: '${xlsxPath}'
    }),
    step('s5', 'webCloseBrowser')
  ])
}

const webScrollLong: TemplateInfo = {
  id: 'web-scroll-long',
  name: '长页面分段滚动',
  category: '网页自动化',
  description: '分段滚动并停顿，模拟真人浏览长文',
  icon: 'mouse',
  flow: flow('长页面分段滚动', [], [
    step('s1', 'webOpenBrowser', { channel: 'auto' }),
    step('s2', 'webOpenUrl', { url: 'https://www.bing.com' }),
    step('s3', 'delay', { ms: 600 }),
    step('s4', 'webScroll', { deltaY: 800 }),
    step('s5', 'delay', { ms: 400 }),
    step('s6', 'webScroll', { deltaY: 800 }),
    step('s7', 'delay', { ms: 400 }),
    step('s8', 'webScroll', { deltaY: 800 }),
    step('s9', 'webCloseBrowser')
  ])
}

const webFillExtract: TemplateInfo = {
  id: 'web-fill-extract',
  name: '填表后提取结果',
  category: '网页自动化',
  description: '搜索后把结果区文本抓出来存变量',
  icon: 'search',
  flow: flow('填表后提取结果', [
    { name: 'kw', type: 'string', value: 'RPA', required: true }
  ], [
    step('s1', 'webOpenBrowser', { channel: 'auto' }),
    step('s2', 'webOpenUrl', { url: 'https://www.bing.com' }),
    step('s3', 'webWaitFor', { selector: 'input[name="q"]', timeoutMs: 8000 }),
    step('s4', 'webInput', { selector: 'input[name="q"]', value: '${kw}' }),
    step('s5', 'webPressKey', { key: 'Enter' }),
    step('s6', 'webWaitFor', { selector: '#b_results', timeoutMs: 8000 }),
    step('s7', 'webExtractText', { selector: '#b_results', resultVar: 'bodyText' }),
    step('s8', 'logMessage', { message: '结果区已抓到（前 200 字）', level: 'success' }),
    step('s9', 'webCloseBrowser')
  ])
}

const excelReadWrite: TemplateInfo = {
  id: 'excel-read-write',
  name: '读单元格再写回',
  category: 'Excel表格',
  description: '打开已有表，读 A1，把结果写到 B1',
  icon: 'table',
  flow: flow('读单元格再写回', [
    { name: 'srcPath', type: 'string', value: 'D:\\report.xlsx', required: true, description: '已有 Excel 路径' }
  ], [
    step('s1', 'excelOpen', { path: '${srcPath}' }),
    step('s2', 'excelReadCell', { sheet: 'Sheet1', row: 1, col: 1, resultVar: 'a1' }),
    step('s3', 'excelWriteCell', { sheet: 'Sheet1', row: 1, col: 2, value: '原值: ${a1}' }),
    step('s4', 'excelSave', { path: '${srcPath}' }),
    step('s5', 'logMessage', { message: '已把 A1 抄到 B1', level: 'success' })
  ])
}

const excelMultisheet: TemplateInfo = {
  id: 'excel-multisheet',
  name: '多 Sheet 写两张表',
  category: 'Excel表格',
  description: '在「汇总」和「明细」两个 Sheet 各写一行',
  icon: 'table',
  flow: flow('多 Sheet 写表', [
    { name: 'outPath', type: 'string', value: 'D:\\multi.xlsx' }
  ], [
    step('s1', 'excelCreate'),
    step('s2', 'excelWriteRow', { sheet: '汇总', row: 1, values: '["项目","完成度"]' }),
    step('s3', 'excelWriteRow', { sheet: '汇总', row: 2, values: '["需求",100]' }),
    step('s4', 'excelWriteRow', { sheet: '明细', row: 1, values: '["日期","事项"]' }),
    step('s5', 'excelWriteRow', { sheet: '明细', row: 2, values: ["09-26","立项评审"] }),
    step('s6', 'excelSave', { path: '${outPath}' }),
    step('s7', 'logMessage', { message: '两个 Sheet 已写入', level: 'success' })
  ])
}

const excelReport: TemplateInfo = {
  id: 'excel-report-style',
  name: '一张小报表',
  category: 'Excel表格',
  description: '表头 + 三行数据 + 合计行，另存',
  icon: 'table',
  flow: flow('一张小报表', [
    { name: 'outPath', type: 'string', value: 'D:\\small.xlsx' }
  ], [
    step('s1', 'excelCreate'),
    step('s2', 'excelWriteRow', { sheet: 'Sheet1', row: 1, values: '["部门","人数"]' }),
    step('s3', 'excelWriteRow', { sheet: 'Sheet1', row: 2, values: '["研发",12]' }),
    step('s4', 'excelWriteRow', { sheet: 'Sheet1', row: 3, values: '["运营",8]' }),
    step('s5', 'excelWriteRow', { sheet: 'Sheet1', row: 4, values: '["合计",20]' }),
    step('s6', 'excelSave', { path: '${outPath}' })
  ])
}

const desktopModifier: TemplateInfo = {
  id: 'desktop-modifier',
  name: '桌面修饰键组合',
  category: '桌面自动化',
  description: '演示 Control+A 这类带修饰键的快捷键（先激活目标窗口）',
  icon: 'keyboard',
  flow: flow('桌面修饰键', [], [
    step('s1', 'logMessage', { message: '提示：先激活要操作的窗口（此例为全选，谨慎）', level: 'warn' }),
    step('s2', 'delay', { ms: 800 }),
    step('s3', 'pressKey', { keys: 'Control+A' }),
    step('s4', 'logMessage', { message: '已发送 Control+A', level: 'success' })
  ])
}

const desktopMultiline: TemplateInfo = {
  id: 'desktop-multiline',
  name: '桌面多行输入',
  category: '桌面自动化',
  description: '输入一行 → 回车 → 再输一行（适合记事本/聊天框）',
  icon: 'keyboard',
  flow: flow('桌面多行输入', [
    { name: 'line1', type: 'string', value: '第一行' },
    { name: 'line2', type: 'string', value: '第二行' }
  ], [
    step('s1', 'logMessage', { message: '提示：先点一下输入区', level: 'warn' }),
    step('s2', 'delay', { ms: 800 }),
    step('s3', 'typeText', { text: '${line1}' }),
    step('s4', 'pressKey', { keys: 'Enter' }),
    step('s5', 'typeText', { text: '${line2}' }),
    step('s6', 'pressKey', { keys: 'Enter' })
  ])
}

const errorBranch: TemplateInfo = {
  id: 'error-branch',
  name: '失败分支处理',
  category: '入门示例',
  description: '模拟一个状态码，非 200 走错误日志分支',
  icon: 'branch',
  flow: flow('失败分支处理', [{ name: 'code', type: 'number', value: 500 }], [
    step('s1', 'logMessage', { message: '接口返回码：${code}', level: 'info' }),
    step(
      's2',
      'ifVar',
      { varName: 'code', op: 'eq', expected: '200' },
      [step('s2-1', 'logMessage', { message: '请求成功', level: 'success' })],
      [step('s2-2', 'logMessage', { message: '请求失败，需重试', level: 'error' })]
    )
  ])
}

const dataCleanup: TemplateInfo = {
  id: 'data-cleanup',
  name: '取数后逐条处理',
  category: '入门示例',
  description: 'HTTP 模拟取列表 → 循环逐条打日志（数据清洗骨架）',
  icon: 'loop',
  flow: flow('取数后逐条处理', [], [
    step('s1', 'httpGet', { url: 'https://api.example.com/list', resultVar: 'items' }),
    step('s2', 'logMessage', { message: '共 ${items.length} 条，开始处理…', level: 'info' }),
    step(
      's3',
      'loopList',
      { listVar: 'items', itemVar: 'it' },
      [step('s3-1', 'logMessage', { message: '处理：${it}', level: 'info' })]
    ),
    step('s4', 'logMessage', { message: '处理完成', level: 'success' })
  ])
}

const delayRhythm: TemplateInfo = {
  id: 'delay-rhythm',
  name: '带节奏的循环',
  category: '入门示例',
  description: '循环每步之间停一下，避免把网页/API 打太快',
  icon: 'clock',
  flow: flow('带节奏的循环', [
    { name: 'steps', type: 'list', value: ['A', 'B', 'C'] }
  ], [
    step(
      's1',
      'loopList',
      { listVar: 'steps', itemVar: 's' },
      [
        step('s1-1', 'logMessage', { message: '处理 ${s}…', level: 'info' }),
        step('s1-2', 'delay', { ms: 600 })
      ]
    ),
    step('s2', 'logMessage', { message: '节奏完成', level: 'success' })
  ])
}

const ocrLog: TemplateInfo = {
  id: 'ocr-log-text',
  name: 'OCR 后按内容分支',
  category: '图像OCR',
  description: '识别图片，有文字打成功、空结果打警告',
  icon: 'scan',
  flow: flow('OCR 后按内容分支', [
    { name: 'imagePath', type: 'string', value: 'D:\\doc.png', required: true, description: '图片路径' }
  ], [
    step('s1', 'sidecarStart'),
    step('s2', 'sidecarOcr', { imagePath: '${imagePath}', resultVar: 'text' }),
    step('s3', 'logMessage', { message: '识别到：${text}', level: 'info' }),
    step('s4', 'sidecarStop')
  ])
}

const excelAppendWeb: TemplateInfo = {
  id: 'excel-append-web',
  name: '网页结果追加进 Excel',
  category: '实用工具',
  description: '抓一条网页文本 → 新建 Excel 写成一行 → 保存',
  icon: 'globe',
  flow: flow('网页结果进 Excel', [
    { name: 'outPath', type: 'string', value: 'D:\\web.xlsx' }
  ], [
    step('s1', 'webOpenBrowser', { channel: 'auto' }),
    step('s2', 'webOpenUrl', { url: 'https://www.bing.com' }),
    step('s3', 'webWaitFor', { selector: '#b_results h2 a', timeoutMs: 8000 }),
    step('s4', 'webExtractText', { selector: '#b_results h2 a', resultVar: 't' }),
    step('s5', 'webCloseBrowser'),
    step('s6', 'excelCreate'),
    step('s7', 'excelWriteRow', { sheet: 'Sheet1', row: 1, values: '["抓取时间","结果"]' }),
    step('s8', 'excelWriteRow', { sheet: 'Sheet1', row: 2, values: '["${t}","${t}"]' }),
    step('s9', 'excelSave', { path: '${outPath}' })
  ])
}

const oncePoll: TemplateInfo = {
  id: 'once-poll',
  name: '有限次轮询骨架',
  category: '实用工具',
  description: '固定轮几轮就停，适合「等某状态出现」',
  icon: 'loop',
  flow: flow('有限次轮询', [
    { name: 'tries', type: 'list', value: [1, 2, 3], description: '轮几轮' }
  ], [
    step(
      's1',
      'loopList',
      { listVar: 'tries', itemVar: 'n' },
      [
        step('s1-1', 'logMessage', { message: '第 ${n} 轮检查…', level: 'info' }),
        step('s1-2', 'delay', { ms: 800 })
      ]
    ),
    step('s2', 'logMessage', { message: '达到上限，停止轮询', level: 'warn' })
  ])
}

/* ============ 第三批：O 线能力（Excel 样式 / Word 占位符） ============ */

const excelStyledReport: TemplateInfo = {
  id: 'excel-styled-report',
  name: '带样式的月度报表',
  category: 'Excel表格',
  description: '表头加粗居中加底色、列宽拉宽、合计行加边框——一份能直接交付的小报表',
  icon: 'table',
  flow: flow('带样式的月度报表', [
    { name: 'outPath', type: 'string', value: 'D:\\monthly.xlsx' }
  ], [
    step('s1', 'excelCreate'),
    step('s2', 'excelWriteRow', { sheet: 'Sheet1', row: 1, values: '["部门","本月业绩","目标"]' }),
    step('s3', 'excelWriteRow', { sheet: 'Sheet1', row: 2, values: '["研发",120,100]' }),
    step('s4', 'excelWriteRow', { sheet: 'Sheet1', row: 3, values: '["运营",80,100]' }),
    step('s5', 'excelWriteRow', { sheet: 'Sheet1', row: 4, values: '["合计",200,200]' }),
    step('s6', 'excelStyleRange', { sheet: 'Sheet1', range: 'A1:C1', bold: true, fill: 'FFE8F0FF', align: 'center' }),
    step('s7', 'excelStyleRange', { sheet: 'Sheet1', range: 'A4:C4', bold: true, border: true }),
    step('s8', 'excelSetColumnWidth', { sheet: 'Sheet1', col: 1, width: 16 }),
    step('s9', 'excelSetColumnWidth', { sheet: 'Sheet1', col: 2, width: 14 }),
    step('s10', 'excelSave', { path: '${outPath}' }),
    step('s11', 'logMessage', { message: '报表已生成：${outPath}', level: 'success' })
  ])
}

const wordPlaceholderFill: TemplateInfo = {
  id: 'office-word-placeholder',
  name: 'Word 占位符批量填充',
  category: 'Office文档',
  description: '打开合同/通知模板，把 {{客户}}/{{金额}} 这类占位符逐个替换成真实值',
  icon: 'doc',
  flow: flow('Word 占位符填充', [
    { name: 'docPath', type: 'string', value: 'D:\\template.docx', required: true, description: '带 {{占位符}} 的 Word 模板' },
    { name: 'customer', type: 'string', value: '锐流科技', required: true, description: '替换 {{客户}} 的值' },
    { name: 'amount', type: 'string', value: '12800', required: true, description: '替换 {{金额}} 的值' }
  ], [
    step('s1', 'officeWordOpen', { path: '${docPath}', visible: 'false' }),
    step('s2', 'officeWordFindReplace', { find: '{{客户}}', replace: '${customer}' }),
    step('s3', 'officeWordFindReplace', { find: '{{金额}}', replace: '${amount}' }),
    step('s4', 'officeWordClose', { save: 'true' }),
    step('s5', 'logMessage', { message: '占位符已填充并保存：${docPath}', level: 'success' })
  ])
}

const officeChartReport: TemplateInfo = {
  id: 'office-excel-chart',
  name: 'Excel 生成图表并重算',
  category: 'Office文档',
  description: '打开真实 Excel → 按数据区域插柱状图 → 强制重算公式 → 另存（需本机装 Office/WPS）',
  icon: 'chart',
  flow: flow('Excel 图表与重算', [
    { name: 'xlsxPath', type: 'string', value: 'D:\\sales.xlsx', required: true, description: '含数据的 xlsx' },
    { name: 'outPath', type: 'string', value: 'D:\\sales-chart.pdf', description: '导出 PDF' }
  ], [
    step('s1', 'officeExcelOpen', { path: '${xlsxPath}', visible: 'false' }),
    step('s2', 'officeExcelAddChart', { sheet: 'Sheet1', chartType: 'column', source: 'A1:B4', title: '月度业绩' }),
    step('s3', 'officeExcelRecalc'),
    step('s4', 'officeExcelExportPdf', { outPath: '${outPath}' }),
    step('s5', 'officeExcelClose', { save: 'true' }),
    step('s6', 'logMessage', { message: '图表已生成：${outPath}', level: 'success' })
  ])
}

/* ============ 汇总导出 ============ */

/** 全量官方模板（顺序即市场默认排列） */
export const OFFICIAL_TEMPLATES: TemplateInfo[] = [
  hello,
  logLevels,
  setVars,
  randomDraw,
  loopDemo,
  ifGrade,
  countdown,
  jsonDemo,
  httpMock,
  nestedIf,
  bingSearch,
  baiduSearch,
  openUrlTitle,
  fillForm,
  webScroll,
  webWait,
  scrapeRecipe,
  iframeRecipe,
  excelCreate,
  excelTable,
  excelRead,
  excelAppend,
  excelMulti,
  desktopType,
  desktopHotkey,
  desktopPick,
  desktopScroll,
  ocrImage,
  ocrToExcel,
  e2eSearchToExcel,
  e2eScrapeCsv,
  reportRecipe,
  pollLoop,
  webPressKeys,
  webLoginRecipe,
  webClickAfterWait,
  webPaginate,
  webScrollLong,
  webFillExtract,
  excelReadWrite,
  excelMultisheet,
  excelReport,
  desktopModifier,
  desktopMultiline,
  errorBranch,
  dataCleanup,
  delayRhythm,
  ocrLog,
  excelAppendWeb,
  oncePoll,
  excelStyledReport,
  wordPlaceholderFill,
  officeChartReport
]

/** 市场分类 chips（去重保持出现顺序） */
export const TEMPLATE_CATEGORIES: string[] = [...new Set(OFFICIAL_TEMPLATES.map((t) => t.category))]

/** 递归统计步骤数（含子步骤与 else 分支） */
export function countTemplateSteps(t: TemplateInfo): number {
  const walk = (steps: StepNode[]): number =>
    steps.reduce(
      (acc, s) =>
        acc + 1 + (s.children ? walk(s.children) : 0) + (s.else ? walk(s.else) : 0),
      0
    )
  return walk(t.flow.steps)
}
