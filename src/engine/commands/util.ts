/**
 * 通用工具指令（M7 切片 8）：文件操作 / 网络 POST / 通知 webhook / 数据处理。
 *
 * 全部只用 Node 内置 API（fs/promises、全局 fetch），不引入新 npm 依赖。
 * 文件路径支持 ${var} 插值；相对路径相对于进程 cwd。
 *
 * 清单（16 条）：
 *  文件: listFiles / readTextFile / writeTextFile / createFolder / copyFile / deleteFile
 *  网络: httpPost / notifyWebhook / notifyDingTalk / notifyFeishu
 *  数据: listLength / listJoin / stringConcat / regexExtract / jsonStringify / nowIso
 */

import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { RegisteredCommand } from './registry'

type RegistryLike = { register(c: RegisteredCommand): void }

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v)
}

export function registerUtilCommands(registry: RegistryLike): void {
  // ---------- 文件操作 ----------

  registry.register({
    id: 'listFiles',
    name: '列出文件夹',
    group: '文件',
    icon: 'folder',
    params: [
      { key: 'dir', label: '文件夹路径', type: 'text', placeholder: '支持 ${var} 插值' },
      { key: 'resultVar', label: '结果变量（列表）', type: 'text' }
    ],
    summary: (p) => `列出 ${str(p.dir)} → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const dir = ctx.interpolate(str(p.dir))
      const resultVar = str(p.resultVar)
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      const names = entries.map((e) => e.name)
      ctx.setVar(resultVar, names)
      ctx.log('success', `${dir} 下 ${names.length} 项 → ${resultVar}`)
      return names
    }
  })

  registry.register({
    id: 'readTextFile',
    name: '读文本文件',
    group: '文件',
    icon: 'file',
    params: [
      { key: 'path', label: '文件路径', type: 'text' },
      { key: 'resultVar', label: '结果变量（字符串）', type: 'text' },
      { key: 'encoding', label: '编码', type: 'select', default: 'utf-8', options: [
        { value: 'utf-8', label: 'UTF-8' },
        { value: 'gbk', label: 'GBK' }
      ] }
    ],
    summary: (p) => `读 ${str(p.path)} → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const filePath = ctx.interpolate(str(p.path))
      const resultVar = str(p.resultVar)
      const enc = str(p.encoding, 'utf-8') as BufferEncoding
      const text = await fsp.readFile(filePath, enc)
      ctx.setVar(resultVar, text)
      ctx.log('success', `已读 ${filePath}（${text.length} 字符）→ ${resultVar}`)
      return text
    }
  })

  registry.register({
    id: 'writeTextFile',
    name: '写文本文件',
    group: '文件',
    icon: 'file-edit',
    params: [
      { key: 'path', label: '文件路径', type: 'text' },
      { key: 'content', label: '内容', type: 'text', placeholder: '支持 ${var} 插值' },
      { key: 'append', label: '追加模式', type: 'boolean', default: false }
    ],
    summary: (p) => `写 ${str(p.path)}${p.append ? '（追加）' : ''}`,
    runner: async (ctx, p) => {
      const filePath = ctx.interpolate(str(p.path))
      const content = ctx.interpolate(str(p.content))
      const append = Boolean(p.append)
      await fsp.mkdir(path.dirname(filePath), { recursive: true })
      if (append) await fsp.appendFile(filePath, content, 'utf-8')
      else await fsp.writeFile(filePath, content, 'utf-8')
      ctx.log('success', `已${append ? '追加' : '写入'} ${filePath}`)
      return filePath
    }
  })

  registry.register({
    id: 'createFolder',
    name: '创建文件夹',
    group: '文件',
    icon: 'folder-plus',
    params: [{ key: 'path', label: '文件夹路径', type: 'text' }],
    summary: (p) => `创建 ${str(p.path)}`,
    runner: async (ctx, p) => {
      const dir = ctx.interpolate(str(p.path))
      await fsp.mkdir(dir, { recursive: true })
      ctx.log('success', `已创建文件夹 ${dir}`)
      return dir
    }
  })

  registry.register({
    id: 'copyFile',
    name: '复制文件',
    group: '文件',
    icon: 'copy',
    params: [
      { key: 'src', label: '源文件', type: 'text' },
      { key: 'dest', label: '目标文件', type: 'text' }
    ],
    summary: (p) => `${str(p.src)} → ${str(p.dest)}`,
    runner: async (ctx, p) => {
      const src = ctx.interpolate(str(p.src))
      const dest = ctx.interpolate(str(p.dest))
      await fsp.mkdir(path.dirname(dest), { recursive: true })
      await fsp.copyFile(src, dest)
      ctx.log('success', `已复制 ${src} → ${dest}`)
      return dest
    }
  })

  registry.register({
    id: 'deleteFile',
    name: '删除文件',
    group: '文件',
    icon: 'trash',
    params: [{ key: 'path', label: '文件路径', type: 'text' }],
    summary: (p) => `删除 ${str(p.path)}`,
    runner: async (ctx, p) => {
      const filePath = ctx.interpolate(str(p.path))
      await fsp.rm(filePath, { force: false })
      ctx.log('success', `已删除 ${filePath}`)
      return filePath
    }
  })

  // ---------- 网络 / 通知 ----------

  registry.register({
    id: 'httpPost',
    name: 'HTTP POST',
    group: '网络',
    icon: 'globe',
    params: [
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'body', label: '请求体（JSON 字符串）', type: 'text', placeholder: '支持 ${var} 插值' },
      { key: 'resultVar', label: '结果变量（响应文本）', type: 'text' }
    ],
    summary: (p) => `POST ${str(p.url)} → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const url = ctx.interpolate(str(p.url))
      const body = ctx.interpolate(str(p.body))
      const resultVar = str(p.resultVar)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      })
      const text = await res.text()
      ctx.setVar(resultVar, text)
      ctx.log('info', `POST ${url} → ${res.status}（${text.length} 字符）`)
      return { status: res.status, body: text }
    }
  })

  registry.register({
    id: 'notifyWebhook',
    name: '发送 Webhook 通知',
    group: '通知',
    icon: 'bell',
    params: [
      { key: 'url', label: 'Webhook URL', type: 'text' },
      { key: 'text', label: '通知内容', type: 'text' }
    ],
    summary: (p) => `Webhook ${str(p.url)}`,
    runner: async (ctx, p) => {
      const url = ctx.interpolate(str(p.url))
      const text = ctx.interpolate(str(p.text))
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      ctx.log('success', `Webhook 已发送（${res.status}）`)
      return res.status
    }
  })

  registry.register({
    id: 'notifyDingTalk',
    name: '钉钉机器人通知',
    group: '通知',
    icon: 'bell',
    params: [
      { key: 'webhook', label: '钉钉 Webhook', type: 'text' },
      { key: 'title', label: '标题', type: 'text' },
      { key: 'text', label: '内容', type: 'text' }
    ],
    summary: (p) => `钉钉: ${str(p.title)}`,
    runner: async (ctx, p) => {
      const url = ctx.interpolate(str(p.webhook))
      const title = ctx.interpolate(str(p.title))
      const text = ctx.interpolate(str(p.text))
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'text', text: { content: `${title}\n${text}` } })
      })
      ctx.log('success', `钉钉通知已发送: ${title}`)
      return title
    }
  })

  registry.register({
    id: 'notifyFeishu',
    name: '飞书机器人通知',
    group: '通知',
    icon: 'bell',
    params: [
      { key: 'webhook', label: '飞书 Webhook', type: 'text' },
      { key: 'text', label: '内容', type: 'text' }
    ],
    summary: (p) => `飞书: ${str(p.text)}`,
    runner: async (ctx, p) => {
      const url = ctx.interpolate(str(p.webhook))
      const text = ctx.interpolate(str(p.text))
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg_type: 'text', content: { text } })
      })
      ctx.log('success', '飞书通知已发送')
      return text
    }
  })

  // ---------- 数据处理 ----------

  registry.register({
    id: 'listLength',
    name: '取列表长度',
    group: '数据处理',
    icon: 'hash',
    params: [
      { key: 'listVar', label: '列表变量', type: 'text' },
      { key: 'resultVar', label: '结果变量（数字）', type: 'text' }
    ],
    summary: (p) => `len(${str(p.listVar)}) → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const listVar = str(p.listVar)
      const resultVar = str(p.resultVar)
      const list = ctx.getVar<unknown[]>(listVar)
      const n = Array.isArray(list) ? list.length : 0
      ctx.setVar(resultVar, n)
      ctx.log('info', `${listVar} 长度 = ${n}`)
      return n
    }
  })

  registry.register({
    id: 'listJoin',
    name: '列表拼接为字符串',
    group: '数据处理',
    icon: 'link',
    params: [
      { key: 'listVar', label: '列表变量', type: 'text' },
      { key: 'separator', label: '分隔符', type: 'text', default: ',' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    summary: (p) => `join(${str(p.listVar)}, "${str(p.separator)}")`,
    runner: async (ctx, p) => {
      const listVar = str(p.listVar)
      const sep = ctx.interpolate(str(p.separator, ','))
      const resultVar = str(p.resultVar)
      const list = ctx.getVar<unknown[]>(listVar)
      const joined = (Array.isArray(list) ? list : []).map(String).join(sep)
      ctx.setVar(resultVar, joined)
      return joined
    }
  })

  registry.register({
    id: 'stringConcat',
    name: '字符串拼接',
    group: '数据处理',
    icon: 'plus',
    params: [
      { key: 'a', label: '第一段', type: 'text' },
      { key: 'b', label: '第二段', type: 'text' },
      { key: 'resultVar', label: '结果变量', type: 'text' }
    ],
    summary: (p) => `${str(p.a)} + ${str(p.b)} → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const a = ctx.interpolate(str(p.a))
      const b = ctx.interpolate(str(p.b))
      const resultVar = str(p.resultVar)
      const out = a + b
      ctx.setVar(resultVar, out)
      return out
    }
  })

  registry.register({
    id: 'regexExtract',
    name: '正则提取',
    group: '数据处理',
    icon: 'search',
    params: [
      { key: 'source', label: '来源文本', type: 'text' },
      { key: 'pattern', label: '正则表达式', type: 'text' },
      { key: 'resultVar', label: '结果变量（第一个匹配）', type: 'text' }
    ],
    summary: (p) => `/${str(p.pattern)}/ → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const source = ctx.interpolate(str(p.source))
      const pattern = ctx.interpolate(str(p.pattern))
      const resultVar = str(p.resultVar)
      const m = source.match(new RegExp(pattern))
      const out = m ? m[1] ?? m[0] : ''
      ctx.setVar(resultVar, out)
      ctx.log('info', `正则提取 ${out ? '成功' : '无匹配'}`)
      return out
    }
  })

  registry.register({
    id: 'jsonStringify',
    name: '序列化为 JSON',
    group: '数据处理',
    icon: 'braces',
    params: [
      { key: 'sourceVar', label: '来源变量', type: 'text' },
      { key: 'resultVar', label: '结果变量（字符串）', type: 'text' }
    ],
    summary: (p) => `stringify(${str(p.sourceVar)}) → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const sourceVar = str(p.sourceVar)
      const resultVar = str(p.resultVar)
      const v = ctx.getVar(sourceVar)
      const out = JSON.stringify(v)
      ctx.setVar(resultVar, out)
      return out
    }
  })

  registry.register({
    id: 'nowIso',
    name: '当前时间 ISO',
    group: '数据处理',
    icon: 'clock',
    params: [{ key: 'resultVar', label: '结果变量', type: 'text' }],
    summary: (p) => `now() → ${str(p.resultVar)}`,
    runner: async (ctx, p) => {
      const resultVar = str(p.resultVar)
      const iso = new Date().toISOString()
      ctx.setVar(resultVar, iso)
      return iso
    }
  })
}
