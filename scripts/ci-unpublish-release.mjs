#!/usr/bin/env node
/**
 * CI 辅助：把 electron-builder 自动建的 GitHub Release 从 draft 翻成正式发布（draft:false）。
 *
 * 背景：electron-builder --publish always 在 GitHub 上默认建草稿 Release（见 handoff 71 §5.3）。
 * 本脚本按当前 git tag 找到该 Release，PATCH draft=false，使 latest.yml / releases.atom 立即可用，
 * 装机版 electron-updater 才能查到。幂等：已是正式发布则 404/204 都不报错。
 *
 * 运行环境变量：
 *   GH_TOKEN   工作流自带的 secrets.GITHUB_TOKEN（contents:write 权限）
 *   GH_REPO    形如 uwjtg/ruili-rpa
 *   TAG        形如 v0.1.1
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
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
        }
      },
      (res) => {
        let buf = ''
        res.on('data', (c) => (buf += c))
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(buf ? JSON.parse(buf) : {})
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
  const rel = list.find((r) => r.tag_name === tag)
  if (!rel) {
    console.error(`[unpublish] 没找到 tag=${tag} 的 Release`)
    process.exit(2)
  }
  console.log(`[unpublish] 找到 Release id=${rel.id} draft=${rel.draft} tag=${rel.tag_name}`)
  if (rel.draft) {
    await gh('PATCH', `/releases/${rel.id}`, { draft: false, make_latest: 'true' })
    console.log(`[unpublish] 已发布：https://github.com/${repo}/releases/tag/${tag}`)
  } else {
    console.log('[unpublish] 已是正式发布，无需操作')
  }
}

main().catch((e) => {
  console.error('[unpublish] 失败：', e.message)
  process.exit(1)
})
