/**
 * 构建内嵌 Python sidecar（M5-21）。
 *
 * 把开发机上「带 uiautomation/comtypes/tkinter 的完整 Python」裁剪复制到 build/python/，
 * 供 electron-builder extraResources 打进安装包（resources/python）。
 *
 * 为什么手工裁剪而不是 embeddable：开发机 Python 已含 tkinter（_tkinter.pyd + tcl），
 * embeddable 包不带 tkinter，补齐更脆弱；直接复制已知可用的整机再剪掉重型 ML 目录最稳。
 *
 * 运行：npm run build:sidecar   （源 Python 可用 RUILI_SIDECAR_PYTHON_PREFIX 覆盖）
 */
import { execSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync
} from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')
const DEST = join(ROOT, 'build', 'python')
const SIDECAR_DIR = join(ROOT, 'sidecar')

// 这些目录与桌面链路无关、且体积极大，整目录剪掉（OCR/cv2 装机端按需后续再加）
// 与桌面/OCR 链路无关、体积极大，整目录剪掉。
// 注意：OCR 所需的 cv2/onnxruntime/numpy/PIL 不再排除，会随源 Python 复制进来；
// rapidocr_onnxruntime 由下方 installOcr() 用 pip 装进 build/python。
const EXCLUDE_DIRS = [
  'torch', 'torchvision', 'torchgen', '_polars_runtime_32', 'polars',
  'scipy', 'scipy.libs', 'sympy',
  'matplotlib', 'skimage', 'fontTools',
  'cryptography', 'networkx', 'ultralytics', 'insightface',
  'pandas', 'pyarrow', '__pycache__', '.pytest_cache'
]

function log(msg: string): void {
  console.log(`[build:sidecar] ${msg}`)
}

/** 探测源 Python 前缀（sys.prefix）：优先环境变量，否则用 PATH 上的 python */
function detectSourcePrefix(): string {
  const override = process.env.RUILI_SIDECAR_PYTHON_PREFIX
  if (override && existsSync(join(override, 'python.exe'))) return override
  const r = spawnSync('python', ['-c', 'import sys;print(sys.prefix)'], {
    encoding: 'utf8'
  })
  if (r.status !== 0) {
    throw new Error(
      '找不到源 Python。请设环境变量 RUILI_SIDECAR_PYTHON_PREFIX 指向带 uiautomation 的完整 Python 安装目录。\n' +
        (r.stderr || '')
    )
  }
  return r.stdout.trim()
}

/** 确认源 Python 具备桌面链路三件套 */
function verifySource(prefix: string): void {
  const exe = join(prefix, 'python.exe')
  const r = spawnSync(
    exe,
    ['-c', 'import uiautomation, comtypes, tkinter; print("OK")'],
    { encoding: 'utf8' }
  )
  if (r.status !== 0 || !r.stdout.includes('OK')) {
    throw new Error(
      `源 Python 不满足桌面依赖（需 uiautomation/comtypes/tkinter）：\n${r.stderr || r.stdout}`
    )
  }
  log(`源 Python: ${prefix}`)
}

function dirSizeMB(dir: string): number {
  let total = 0
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else total += st.size
    }
  }
  walk(dir)
  return total / 1024 / 1024
}

/** 把 RapidOCR 装进裁剪后的 Python（首次需联网；onnxruntime/numpy/cv2 已随源复制） */
function installOcr(): void {
  const pip = spawnSync(
    join(DEST, 'python.exe'),
    ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', 'rapidocr_onnxruntime'],
    { stdio: 'inherit' }
  )
  if (pip.status !== 0) {
    throw new Error('pip install rapidocr_onnxruntime 失败（需联网或配置 PyPI 镜像）')
  }
  log('已安装 rapidocr_onnxruntime（OCR 引擎）')
}

function main(): void {
  const source = detectSourcePrefix()
  verifySource(source)

  if (existsSync(DEST)) {
    log('清理旧 build/python …')
    rmSync(DEST, { recursive: true, force: true })
  }
  mkdirSync(join(ROOT, 'build'), { recursive: true })

  // robocopy：/E 含子目录；/XD 整目录排除；/XF 排除单文件；<8 退出码均为成功
  const args = [
    `"${source}"`,
    `"${DEST}"`,
    '/E',
    ...EXCLUDE_DIRS.flatMap((d) => ['/XD', d]),
    '/XF', '*.pyc', '*.pyo',
    '/NFL', '/NDL', '/NJH', '/NJS'
  ]
  log('复制并裁剪（robocopy）…')
  const rc = spawnSync(`robocopy ${args.join(' ')}`, { shell: true })
  if (rc.status !== null && rc.status >= 8) {
    throw new Error(`robocopy 失败，退出码 ${rc.status}`)
  }

  // sidecar 脚本放到 python/app/（server.py 与 desktop_pick.py 同目录，from desktop_pick import 才成立）
  mkdirSync(join(DEST, 'app'), { recursive: true })
  for (const f of ['server.py', 'desktop_pick.py']) {
    cpSync(join(SIDECAR_DIR, f), join(DEST, 'app', f))
  }

  // 装入 OCR 引擎（rapidocr_onnxruntime + 自带 onnx 模型）
  installOcr()

  // 自验：裁剪后的解释器能 import 桌面三件套
  const check = spawnSync(
    join(DEST, 'python.exe'),
    ['-c', 'import uiautomation, comtypes, tkinter; print("SELFCHECK_OK")'],
    { encoding: 'utf8' }
  )
  if (check.status !== 0 || !check.stdout.includes('SELFCHECK_OK')) {
    throw new Error(`裁剪后自验失败：\n${check.stderr || check.stdout}`)
  }

  const mb = dirSizeMB(DEST)
  log(`完成：build/python = ${mb.toFixed(0)} MB，自验通过。下一步 npm run dist 打进安装包。`)
}

main()
