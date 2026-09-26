# M7 · 切片 5：GitHub Actions CI（自动测试 + tag 自动发版）

> 接力开发交接文档 · V3 原型
>
> - 切片：M7-5（选项 B）——把本地带 token 发布换成 GitHub Actions：push 跑测试基线，推 tag 自动出安装包并发 Release
> - 依赖切片：[71-M7-4-GitHub建仓与首次Release发布.md](./71-M7-4-GitHub建仓与首次Release发布.md)
> - 状态：**代码已落地并 push**（工作流已随 `86c03cd` 上 main；首次 CI 跑绿需在 GitHub Actions 页确认）
> - 落盘日期：2026-09-26

---

## 1. 本阶段目标与完成情况

承接 71 号 §7 待拍板项。选 **B：配 GitHub Actions CI**（先于 A 做，让 A 的 0.1.1 演练变成"推个 tag 全自动发版 + 装机版真升级"，一次验证两件事）。

**完成内容：**
- `.github/workflows/ci.yml`：push 到 main / 任意 PR 触发，windows-latest 上跑 `typecheck` + `vitest` + `pytest`（先 pip 装 uiautomation/comtypes，再 npm ci）。
- `.github/workflows/release.yml`：push 形如 `v*` 的 tag 触发，windows-latest 上：
  1. setup-node 22（npm 缓存）+ setup-python 3.12；
  2. pip 装 uiautomation/comtypes（满足 `build:sidecar` 的 verifySource）；
  3. `npm ci` → `npm run build:sidecar`（裁 Python 进 build/python，含 RapidOCR）→ `npm run build`；
  4. `npx electron-builder --win nsis --publish always`，用工作流自带 `secrets.GITHUB_TOKEN`（已声明 `permissions: contents: write`），**不再需要本地带 classic token**；
  5. `node scripts/ci-unpublish-release.mjs` 把 electron-builder 默认建的 draft 翻成正式发布（`draft:false` + `make_latest:true`），否则 latest.yml / atom 不对外。
- `scripts/ci-unpublish-release.mjs`：纯 Node 脚本，按当前 tag 在最近 100 个 release 里精确匹配，PATCH `draft:false`；幂等，已是正式发布则跳过。
- 工作流未设任何额外 secret；用 GitHub 内置的 `GITHUB_TOKEN`（作用域仅限本仓、作业结束即失效），比本地 classic token 更安全，也免去"在仓里加密存 token"这一步。

**未做：** 没有推 tag（那是选项 A = 切片 73）；没在 GitHub 网页上看首次 run（本机到 api.github.com / raw.githubusercontent.com 此刻连接被重置，见 §5）。

## 2. 产出物

| 文件 | 作用 |
|---|---|
| `.github/workflows/ci.yml` | push/PR 测试基线（typecheck+vitest+pytest） |
| `.github/workflows/release.yml` | tag `v*` 触发的完整构建+发布流水线 |
| `scripts/ci-unpublish-release.mjs` | 把 electron-builder 建的 draft release 翻成正式发布 |

无业务代码改动；未动 `.ts`、未动 RunWireEvent 形状、未动 package.json。

## 3. 测试结果原文

本切片只加 CI 文件，本地基线复核：

```
$ npm run typecheck
> tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json     # 0 报错

$ npm test
 Test Files  29 passed (29)
      Tests  330 passed (330)
   Duration  6.60s

$ npm run test:sidecar
 84 passed in 13.25s
```

语法校验：`node --check scripts/ci-unpublish-release.mjs` 通过；两份 YAML `yaml.safe_load` 解析通过。

git：`86c03cd ci: GitHub Actions 自动发布与测试流水线`（3 files, +174），已 push（`ef8a38a..86c03cd main -> main`）。

## 4. 自检清单

- [x] 两份工作流 YAML 语法合法（本地解析通过）；
- [x] 辅助脚本 `node --check` 通过；
- [x] 未在仓内写入任何 token；用工作流自带 `GITHUB_TOKEN` + `permissions: contents: write`；
- [x] release 流水线补齐了"draft 翻正式"这一步（否则 71 号观察到的 draft 问题会在 CI 重演）；
- [x] 本地 typecheck / vitest 330 / pytest 84 全绿；
- [x] 未改 `.ts`、未改 RunWireEvent、未改 package.json；
- [x] 新文件 UTF-8 落盘（Write 工具默认 UTF-8 无 BOM）。

## 5. 遗留问题

1. **首次 CI run 未在本机亲眼确认**：push 之后本机到 `api.github.com` / `raw.githubusercontent.com` 接连被重置（401 / connection reset），`git ls-remote` 也连不上；但 `git push` 本身已成功回显 ref 更新，本地 HEAD `86c03cd` 与推送的 sha 一致。**需要用户打开 https://github.com/uwjtg/ruili-rpa/actions 看一眼刚那条 `ci` run 是否绿**；若红，按日志修。
2. **api.txt 里的 token 对 API 返回 401**：71 号说它是 classic token 能建仓，现在 `/api` 401。可能已过期/被吊销/scope 变了。本次发布 CI 不依赖它（用内置 GITHUB_TOKEN），但若以后还要在本机跑脚本调 GitHub API，需重新生成一个 classic / fine-grained token 覆盖到桌面 api.txt。
3. **build:sidecar 在 CI 上的首次真跑未验证**：windows-latest 自带 Python 3.12 + tkinter，pip 装 uiautomation/comtypes 后 `build:sidecar` 会把整个 runner Python 裁剪复制并 pip 装 rapidocr_onnxruntime。本地是从另一台 Python 装的；CI 首次跑若 robocopy 复制量或 pip 装包有坑，会在 release 那条 tag run 里暴露（即切片 73 发版演练时）。
4. better-sqlite3 等原生模块在 `npmRebuild:false` 下靠 prebuilt 跑通；CI 上 `npm ci` 装的是 Node ABI 的 prebuild，Electron 下能否直接用与本地一致，首次 tag run 是第一次真验证（本地已装机可用，风险低）。
5. 代码签名证书仍未配（自用可缓，决策②）。
6. `.rui` 双击真机验证、用户文档仍未做。

## 6. 对下一阶段的输入要求

- **发版流程已彻底改变**：以后发版**不需要**在本机 `GH_TOKEN=... electron-builder --publish always`。改成：
  1. 本机改完代码、测试绿；
  2. `npm version patch`（或 minor/major）→ 自动改 package.json 并打 tag；
  3. `git push origin main && git push origin v0.1.1`；
  4. 去 Actions 看 `Release` 那条 run，约 10-20 分钟出安装包并自动翻正式发布；
  5. 装机版点"检查更新"即升级。
- release.yml 依赖两个前提：windows runner 的 Python 带 tkinter（setup-python@v5 官方包默认带）；`GITHUB_TOKEN` 默认有 contents:write（已在 workflow 顶层声明）。
- 若首次 tag run 失败，最可能的两个点：①build:sidecar 复制 runner Python 体积/包差异；②better-sqlite3 native 在 Electron ABI 下加载。按 run 日志定位。
- 下一方向候选：
  - **A / 切片 73：0.1.1 发版演练**（`npm version patch` → 推 tag → CI 出包 → 装机版点检查更新真升级，端到端验证自动更新）；
  - C：真机 `.rui` 双击验证（闭环 M7-1 命令行传参）；
  - D：用户文档。

## 7. 待用户拍板的决策

1. 切片 73 是否就做 **0.1.1 发版演练**？推荐做——它是验证本条 CI 流水线 + 自动更新端到端的唯一办法，且现在零本地上传（CI 自动传 230MB）。
2. 本机 api.txt token 已 401，要不要现在重新生成一个 GitHub token 覆盖进去（仅本机脚本/后续手工备用用，CI 不需要）？还是干脆弃用、以后全走 Actions？
3. 还是先去做 C（真机 .rui 双击）/ D（用户文档）？
