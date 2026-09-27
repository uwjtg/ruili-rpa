# M7 · 切片 32：邮件账号 safeStorage 加密入库 + sendMailSaved 指令

> 接力开发交接文档 · V3 原型
>
> - 切片：M7-32（收尾项 C 之「邮件密码未走 safeStorage 加密入库」）
> - 依赖切片：[98-M7-31-MIT开源许可证](./98-M7-31-MIT开源许可证.md)
> - 状态：**已完成**（typecheck 0 / vitest 407 / pytest 88；指令总数 161 → 162）
> - 落盘日期：2026-09-27

---

## 1. 本阶段目标与完成情况

此前发邮件靠每步填 host/user/pass（`sendMail`）或环境变量（`sendMailViaEnv`），密码不能加密保存。本切片仿 LLM 配置（切片 48）模式，把 SMTP 账号加密落盘：

- **DB 层**（`src/main/store/db.ts`）：新增 `MailAccountRecord`（host/port/secure/user/passEnc/from）与 `loadMailAccount()` / `saveMailAccount()`，存 settings 表键 `mail.account`；`passEnc` 只放加密后的 base64，DB 模块不碰加密。
- **引擎层**（`src/engine/commands/mail.ts`）：新增 `MailAccount` 类型、模块级 `setMailAccountProvider(fn)` 注入钩子，以及新指令 **`sendMailSaved`**——参数只需 to/subject/text/attachments，运行时从 provider 取已解密账号；未配置账号抛中文错误。
- **主进程**（`src/main/index.ts`）：import 后 `wireMailAccountProvider()`（惰性读 DB + `decryptKey` 解密）；新增 IPC `mail:get-account`（只回 hasPassword，绝不下发明文）和 `mail:save-account`（pass 空串保留旧密码，否则 `encryptKey`）。
- **preload / 类型**：preload 暴露 `mail.getAccount/saveAccount`；`env.d.ts` 补对应类型。
- **UI**：新建 `views/editor/MailAccountPanel.tsx`（SMTP 配置表单，密码框 password 类型、留空保留旧值），挂到编辑器「设置」页签 LlmConfigPanel 与 AboutPanel 之间。

安全面：密码只在主进程内存解密，渲染端拿不到明文；落盘是 DPAPI/safeStorage 密文。

## 2. 产出物

| 文件 | 改动 |
|---|---|
| `src/main/store/db.ts` | +MailAccountRecord / loadMailAccount / saveMailAccount |
| `src/engine/commands/mail.ts` | +MailAccount 类型、setMailAccountProvider、指令 sendMailSaved |
| `src/engine/commands/mail.test.ts` | 命令数 2→3，+2 用例（注入账号发信 / 未配置抛错） |
| `src/main/index.ts` | wireMailAccountProvider + IPC mail:get/save-account |
| `src/preload/index.ts` | +mail.getAccount/saveAccount |
| `src/renderer/src/env.d.ts` | +mail 类型声明 |
| `src/renderer/src/views/editor/MailAccountPanel.tsx` | 新增 SMTP 账号配置面板 |
| `src/renderer/src/views/EditorView.tsx` | 设置页签挂载 `<MailAccountPanel />` |
| `README.md` | 已知限制删掉「邮件密码未走 safeStorage 加密入库」 |

## 3. 测试结果原文

- `npm run typecheck`：0 错。
- `npm test`（vitest）：39 文件 / **407 passed**（基线 405 + 本切片 +2）。
- `npm run test:sidecar`（pytest）：**88 passed**（未改 sidecar）。

## 4. 自检清单

- [x] 新指令 id `sendMailSaved` 已 grep 不与现有 161 条冲突。
- [x] IPC get-account 不下发密码明文（只回 hasPassword）。
- [x] save-account pass 空串保留旧密码（与 LLM saveConfig 同语义）。
- [x] 单测覆盖「注入账号发信」与「未配置抛错」两条路径；fake mailer 断言 host/user/pass/from 正确。
- [x] 未碰 RunWireEvent；.ts 一律 UTF-8 无 BOM 改写。
- [x] 修了中途踩的两个坑：① EditorView import 因 LF/CRLF 锚点混用重复（TS2300），去重；② 行删除误伤 `import ScrapeWizard`，已恢复。

## 5. 遗留问题

1. 未做真实 SMTP 真机冒烟（无可用测试邮箱授权码）；单测已覆盖账号注入与未配置抛错两条路径。
2. IMAP 收信账号是否复用同一对账号配置未做——当前 safeStorage 只服务发信 `sendMailSaved`；IMAP 仍走既有路径。

## 6. 对下一阶段的输入

指令总数 162（V1 目标 150–180，达标）。收尾项 C 中「邮件密码加密入库」「教程占位」两条已完成并从 README 划掉。

## 7. 待用户拍板

剩余需外部条件的收尾项（挂账，本环境做不了）：Windows 代码签名（需购证书）、WPS/Office COM（需装 Office + 大工程）、装机版自动更新真机端到端、IMAP 真实邮箱兼容性验证。是否就此冻结 V1？
