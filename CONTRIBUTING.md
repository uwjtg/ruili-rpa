# 贡献指南（Contributing）

> 本项目为单人 + AI 智能体接力开发，不对外开放 PR 流程。本文件记录本地开发、新增指令、测试与交接约定，供下一个接力会话与本人维护使用。普通用户请看 [README.md](./README.md)。

---

## 1. 环境准备

- Windows 10/11（64 位）
- Node.js 20+
- Python 3.10+（sidecar 桌面/OCR 指令需要）

```powershell
git clone https://github.com/uwjtg/ruili-rpa.git
cd ruili-rpa
npm install
cd sidecar; pip install -r requirements.txt; cd ..
```

桌面元素拾取依赖 `uiautomation`，截图依赖 `Pillow`，OCR 可选 `rapidocr_onnxruntime`（均在 sidecar 的 requirements 内）。

## 2. 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | electron-vite 开发模式，带 renderer 热更新 |
| `npm test` | vitest run（引擎 / renderer 单测，一次性） |
| `npm run typecheck` | `tsc --noEmit` 跑 node + web 两个 project，须 0 错 |
| `npm run test:sidecar` | `python -m pytest sidecar/tests -q` |
| `npm run lint` / `npm run format` | eslint / prettier |
| `npm run build` | electron-vite build（出 `out/`） |
| `npm run dist` | build + electron-builder 出 NSIS 安装包到 `dist-installer/` |
| `npm run build:sidecar` | 重裁 Python 运行时进 `build/python/` |
| `npm run license:check` | license-checker 摘要，审计第三方许可证 |

## 3. 目录速记

```
src/
  main/      # Electron 主进程：窗口/托盘/IPC/调度/sidecar 拉起
  renderer/  # React 渲染层（7 视图、流程编辑器）
  preload/   # 预加载桥（contextBridge）
  engine/    # 运行引擎
    core/        # AST 解释器、RunContext
    commands/    # 指令库（文件/系统/数据/CSV/邮件/Word/PDF/XLSX/IMAP）
    web/         # 浏览器会话与 web 指令（Playwright CDP）
    desktop/     # 桌面指令
    sidecar/     # Python sidecar HTTP 客户端
    run/         # RunManager（指令注册总装）
shared/      # 指令 schema / AST / 事件类型（UI 与引擎共用）
sidecar/     # Python 端（拾取/录制/OCR/桌面高级）
docs/        # 计划书、交接文档、handoff/
scripts/     # POC 与打包脚本
```

## 4. 新增一条指令（标准流程）

1. **先查重**。`CommandRegistry.register` 遇到重复 `id` 会直接 throw，新增 id 前先 grep：
   ```powershell
   Select-String -Path src/engine -Pattern "id: 'yourNewId'" -Recurse
   ```
   历史上撞过 `listSum/listUnique/stringPadEnd/numRound`，别靠记忆起名。
2. **写注册函数**。在 `src/engine/commands/`（或对应 `web/`、`desktop/`、`sidecar/`）写
   `registerXxxCommands(reg: CommandRegistry, deps?: XxxLike)`。每条指令是一个 `RegisteredCommand`：
   `id / name / group / icon / params / summary / runner(ctx, params, step)`（字段见 `src/shared/cmd-schema.ts`）。
   外部依赖（浏览器、SMTP、IMAP、sidecar）一律走构造注入的 `XxxLike` 接口，便于单测 fake。
3. **注册**。在 `src/engine/run/runManager.ts` 的 `buildEngineRegistry()` 顶部 import 并在装配区调用 `registerXxxCommands(reg)`。
4. **导出**。若该指令集合需要被别处引用，在 `src/engine/index.ts` 补导出。
5. **写单测**。同目录 `xxx.test.ts`，用 fake 注入外部依赖，**不真起浏览器 / Office / 邮箱**。
6. **自验**。`npm test` 与 `npm run typecheck` 全绿再提交。

最小骨架：

```ts
export function registerFooCommands(reg: CommandRegistry, foo: FooLike) {
  reg.register({
    id: 'fooDoBar',
    name: '做某事',
    group: 'Foo',
    icon: 'spark',
    params: [{ key: 'input', label: '输入', type: 'string' }],
    summary: (p) => `做某事：${p.input}`,
    runner: async (ctx, params) => {
      const out = await foo.doBar(String(params.input))
      ctx.log('info', `完成：${out}`)
      return out
    },
  })
}
```

## 5. Python sidecar 约定

- 新增 HTTP endpoint 后，**必须**在 `sidecar/tests/` 加对应 pytest，且用 fake `_PICKER` 注入——
  fake 会绕过「方法是否真实存在」的检查，漏写就是切片 90 的教训（Node 侧调了 Python 端根本没实现的方法）。
- 跑 `npm run test:sidecar` 确认全绿。

## 6. 编码硬约束（历史踩坑汇总）

- **改 `.ts` 必须用 UTF-8 无 BOM**。仓库文件多为 LF；用 PowerShell `Replace` 改文件时锚点不要用 CRLF，
  否则静默不命中（切片 90 踩过）。建议直接用 `[System.IO.File]::ReadAllText/WriteAllText` 显式 UTF-8。
- **`RunWireEvent`（`src/shared/events.ts`）形状冻结**。主进程推事件、renderer 订阅都依赖它；不要改字段、不要加可选破坏项。
- **不引入 GPL/AGPL 进主程序**。红线清单见计划书 §4.4（EPPlus 5+ / PyMuPDF / Emgu.CV / n8n 源码等）；
  新依赖先 `npm run license:check` 确认许可证。
- **无硬编码密钥 / token**。GitHub classic token 只放桌面 `api.txt`（已 `.gitignore`，勿入库）；
  LLM apiKey、邮件口令等运行时凭据走 Electron `safeStorage`（DPAPI），日志默认脱敏。
- 不反编译、不引用影刀任何二进制或资源；品牌文案为自有占位。

## 7. 测试与 DoD

每个切片结束必须达成（并在交接文档贴运行原文）：

- `npm run typecheck` → 0 错
- `npm test` → 全绿
- `npm run test:sidecar` → 全绿
- 新功能核心路径带单测；UI 改动允许手动冒烟（`npm run smoke`）。

## 8. 接力交接流程

本项目按「切片」串行推进，每个切片完成后：

1. 按 `docs/锐流RPA-V3-接力开发模式说明.md` §4 的 7 段模板（目标 / 产出物 / 测试原文 / 自检 / 遗留 / 下一阶段输入 / 待拍板），
   落盘 `docs/handoff/NN-XXX.md`（NN 取 INDEX 最大号 +1）。
2. 在 `docs/handoff/INDEX.md` 表格追加一行。
3. 提交并 push `main`：
   ```powershell
   git add CONTRIBUTING.md README.md docs/handoff/NN-XXX.md docs/handoff/INDEX.md
   git commit -m "docs: 切片 NN 说明"
   git push origin main   # 网络常抖，失败重试
   ```
   只暂存本次改动文件；工作区里的 `smoke.png`、`@AutomationLog.txt`、`out/` 等残留不要带进去。

## 9. 提交信息约定

中文短句，前缀 `feat:` / `fix:` / `docs:` / `chore:`。例：

- `feat: IMAP 收邮件 3 条（imapflow）`
- `fix: 装机版版本徽章 v0.0.0`
- `docs: 新增根 README（用户文档）`

---

*许可证见仓库根 `package.json`（private）；第三方组件清单见 `docs/THIRD-PARTY-NOTICES.md`。*
