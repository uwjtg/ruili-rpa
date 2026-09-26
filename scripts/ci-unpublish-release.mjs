#!/usr/bin/env node
/**
 * CI 辅助：把 electron-builder 自动建的 GitHub Release 翻成正式发布，并清理重复 draft。
 *
 * 背景：
 * 1. electron-builder --publish always 在 GitHub 上默认建草稿 Release；
 * 2. 并发上传 blockmap / .exe 时，两个上传线程可能同时发现 release 不存在，
 *    各自建一个 draft（实测 v0.1.1 出现 id 相邻的两个 draft，分别只带一部分资产）。
 * 本脚本：
 *   - 列出所有同 tag 的 release（含 draft）；
 *   - 选 assets 最多的那个作为主 release，PATCH draft:false + make_latest:true；
 *   - 把其他同 tag 的 draft release 全部删除（避免 electron-updater 拿到残缺 release）。
 *
 * 运行环境变量：GH_TOKEN / GH_REPO / TAG
 */
import { request } from 'node:https'
import { env } from 'node:process'

const token = env.GH_TOKEN
const repo = env.GH_REPO
const tag = env.TAG
if (!token || !repo || !tag) {
  console.error('[unpublish] 缺少 GH_TOKEN / GH_REPO / TAG')
  process.exit(1)
}

function gh(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = request(
      {
        hostname: 'api.github.com',
        path: `/repos/${repo}${path}`,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ruili-rpa-ci',
          ...(data
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            : {})
        }
      },
      (res) => {
        let buf = ''
        res.on('data', (c) => (buf += c))
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300)
            resolve(buf ? JSON.parse(buf) : {})
          else reject(new Error(`GitHub ${method} ${path} -> ${res.statusCode}: ${buf}`))
        })
      }
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

async function main() {
  // 列最近 100 个 release，按 tag_name 精确匹配（draft 也在列表里）
  const list = await gh('GET', '/releases?per_page=100')
  const matches = list.filter((r) => r.tag_name === tag)
  if (matches.length === 0) {
    console.error(`[unpublish] 没找到 tag=${tag} 的 Release`)
    process.exit(2)
  }

  // 选 assets 最多的那个作为主 release（含 .exe + latest.yml + blockmap）
  matches.sort((a, b) => b.assets.length - a.assets.length)
  const main = matches[0]
  const extras = matches.slice(1)
  console.log(
    `[unpublish] tag=${tag} 共 ${matches.length} 个 release；主 id=${main.id} assets=${main.assets.length} draft=${main.draft}`
  )

  if (main.draft) {
    await gh('PATCH', `/releases/${main.id}`, { draft: false, make_latest: 'true' })
    console.log(`[unpublish] 已发布主 release: https://github.com/${repo}/releases/tag/${tag}`)
  } else {
    console.log('[unpublish] 主 release 已是正式发布')
  }

  // 删除多余的同 tag release（通常是只有 blockmap 的重复 draft）
  for (const extra of extras) {
    console.log(
      `[unpublish] 删除重复 release id=${extra.id} draft=${extra.draft} assets=${extra.assets.length}`
    )
    try {
      await gh('DELETE', `/releases/${extra.id}`)
    } catch (e) {
      console.error(`[unpublish] 删除 id=${extra.id} 失败：${e.message}`)
    }
  }
}

main().catch((e) => {
  console.error('[unpublish] 失败：', e.message)
  process.exit(1)
})
