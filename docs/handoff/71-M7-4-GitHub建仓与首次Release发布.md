# M7 · 切片 4：GitHub 建仓 + 首次 Release 发布（自动更新链路打通）

> 接力开发交接文档 · V3 原型
>
> - 切片：M7-4（B 方向收尾）——本地 git 基线提交 → 建真实 GitHub repo → push main → 首次 Release 发布（electron-updater 链路验证）
> - 依赖切片：[70-M7-3-发版前准备与版本徽章修复.md](./70-M7-3-发版前准备与版本徽章修复.md)
> - 状态：**已完成并验证**（repo + v0.1.0 Release 已上线，atom feed 200）
> - 落盘日期：2026-09-26

---

## 1. 本阶段目标与完成情况

承接 70 号 §7 推荐：先 git 落基线，再建真实 GitHub repo 打通自动更新。

**A. 本地 git 基线：**
- `git add -A && git commit` 两个提交：
  - `15eb4c3` M7-3 baseline（版本徽章修复 + perf 埋点 + 重建的 package.json）
  - `cbf23ec` chore: publish owner -> uwjtg
- 历史里其实已有更早提交（adb079c / c863e21），M0 时期"无基线"的记录已过时。

**B. 建仓：**
- 账号 `uwjtg`。先用密码 basic auth → 401（GitHub 已禁密码 API）；fine-grained token → 403（不能建仓）；最后 classic `ghp_...` token → 建仓成功。
- 新建公开仓 **https://github.com/uwjtg/ruili-rpa**（public，免 token 拉 Release）。
- `package.json > build.publish.owner` 从占位 `ruili-rpa` 改为 `uwjtg`。

**C. push：**
- 用 token 作临时 URL push 后，`git remote set-url origin` 重置为干净 URL，**token 未留在 git config**（已校验）。
- `git fetch` 建立 origin/main 跟踪；远端 main sha = cbf23ec。

**D. 首次 Release 发布：**
- `GH_TOKEN=<classic> npx electron-builder --win nsis --publish always`。
- electron-builder 默认建 **draft** 草稿且跑重了两个；清理后保留一个，PATCH `draft:false` 正式发布。
- Release **v0.1.0** 已上线：https://github.com/uwjtg/ruili-rpa/releases/tag/v0.1.0
  - 资产：`ruili-rpa-0.1.0-setup.exe` (230.9 MB) + `.blockmap` + `latest.yml`
  - `releases.atom` 返回 HTTP 200（electron-updater 的检查源）。

## 2. 产出物

| 项 | 值 |
|---|---|
| GitHub repo | https://github.com/uwjtg/ruili-rpa （public） |
| Release | https://github.com/uwjtg/ruili-rpa/releases/tag/v0.1.0 |
| atom feed | https://github.com/uwjtg/ruili-rpa/releases.atom （HTTP 200） |
| 本地分支 | main → origin/main，sha cbf23ec |
| package.json | publish.owner = `uwjtg` |

无源码业务改动；仅 package.json 一处 owner。

## 3. 验证

```
GET /repos/uwjtg/ruili-rpa/branches/main  → sha cbf23ec
GET /repos/uwjtg/ruili-rpa/releases/latest → tag v0.1.0
GET /releases.atom                         → HTTP 200
Release assets: ruili-rpa-0.1.0-setup.exe (230.9MB) + blockmap + latest.yml
```

（本切片未改业务代码，沿用 70 号测试基线：typecheck 0 / vitest 330 / pytest 84。）

## 4. 自检清单

- [x] repo 存在、public、main 分支有完整代码；
- [x] v0.1.0 Release 正式发布（非 draft），3 个资产齐全；
- [x] releases.atom 200，装机版 electron-updater 不再 404；
- [x] token 未写入 git config / 未进交接文档；
- [x] package.json owner 与实际账号一致。

## 5. 遗留问题

1. **token 保管**：classic token 在桌面 `api.txt` 里（未提交进仓）。下次发布仍需 `$env:GH_TOKEN='...'` 再跑 `electron-builder --publish always`。建议后续配 CI（GitHub Actions）自动发布，免去本地带 token。
2. **当前版本=Release 版本=0.1.0**：装机版点"检查更新"会查到 v0.1.0（同版本，提示已是最新），不会触发升级。下次发版需先 `npm version patch`（0.1.1）再 publish。
3. **draft 重跑**：electron-builder 在 `--publish always` 下若中断重跑会重复建 draft。这次已手动清理；CI 化后用 `electron-builder --publish always` 幂等性需注意。
4. 代码签名证书仍未配（自用可缓，见计划书决策②）。
5. `.rui` 双击真机验证、用户文档仍未做。

## 6. 对下一阶段的输入要求

- **发版流程已打通**：改完代码 → `npm version patch`（改 package.json 版本）→ `npm run build:sidecar && npm run dist` → 设 `GH_TOKEN` → `npx electron-builder --win nsis --publish always` → GitHub 上把自动建的 draft 改 published（或 CI 自动）。
- 自动更新：装机版 TopBar 点"检查更新"即可查 https://github.com/uwjtg/ruili-rpa/releases.atom。
- 下一方向候选：真机 .rui 双击 / 用户文档 / 0.1.1 发版演练。

## 7. 待用户拍板的决策

1. 是否现在做一次 **0.1.1 发版演练**（patch 版本 → 重打 → publish → 在装机版上点"检查更新"真升级一次）？这是端到端验证自动更新的唯一办法，但会多传一个 230MB Release。
2. 要不要配 GitHub Actions CI（push tag 自动发布），把本地带 token 发布换成无人值守？
3. 还是先去做用户文档 / 真机 .rui 双击？
