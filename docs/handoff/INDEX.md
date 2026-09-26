# docs/handoff · 交接文档索引

> 接力开发模式事实源。每个阶段完成时追加一行并落盘对应交接文档。

| 交接文档 | 阶段 | 日期 | 状态 |
|---|---|---|---|
| [01-阶段1-骨架与壳.md](./01-阶段1-骨架与壳.md) | 阶段 1 · 骨架与壳 | 2026-09-24 | ✅ 完成 |
| [02-阶段2-引擎核心.md](./02-阶段2-引擎核心.md) | 阶段 2 · 引擎核心 | 2026-09-24 | ✅ 完成 |
| [03-阶段3-真实链路.md](./03-阶段3-真实链路.md) | 阶段 3 · 真实链路（网页CDP/Excel/sidecar） | 2026-09-24 | ✅ 完成 |
| [04-阶段4-贯通与AI.md](./04-阶段4-贯通与AI.md) | 阶段 4 · 贯通与 AI（日志流 IPC/LLM/function-calling） | 2026-09-24 | ✅ 完成 |
| [05-阶段5-审计与设计.md](./05-阶段5-审计与设计.md) | 阶段 5 · 审计与设计（license/选择器设计稿） | 2026-09-24 | ✅ 完成 |
| [06-M0-收尾核对报告.md](./06-M0-收尾核对报告.md) | 阶段 6 · M0 收尾核对报告 | 2026-09-24 | ✅ M0 出口 |
| [07-M1-引擎MVP.md](./07-M1-引擎MVP.md) | M1 · 引擎 MVP（资源生命周期 + webWaitFor/excelWriteRow + 端到端流程） | 2026-09-24 | ✅ 完成 |
| [08-M2-切片1-编辑器四区.md](./08-M2-切片1-编辑器四区.md) | M2 切片 1 · 编辑器四区（指令库/步骤树/参数·变量/运行高亮/撤销重做） | 2026-09-24 | ✅ 完成 |
| [09-M2-切片2-持久化与标签页.md](./09-M2-切片2-持久化与标签页.md) | M2 切片 2 · SQLite 持久化（flow:save/list/load/delete）+ 多标签页 + AppsView 真实列表 | 2026-09-24 | ✅ 完成 |
| [10-M2-切片3-自动保存与拖拽排序.md](./10-M2-切片3-自动保存与拖拽排序.md) | M2 切片 3 · 3s 自动保存 + 运行日志落 logs 表 + 卡片运行入口 + 拖拽重排 | 2026-09-24 | ✅ 完成 |
| [11-M2-切片4-AI面板与单步调试.md](./11-M2-切片4-AI面板与单步调试.md) | M2 切片 4 · AI 助手页签（function-calling）+ 单步 step-over + 标签重命名 | 2026-09-24 | ✅ 完成 |
| [12-M3-切片1-桌面拾取POC.md](./12-M3-切片1-桌面拾取POC.md) | M3 切片 1 · 桌面元素拾取 POC（Python UIA sidecar + pickElement 指令 + 编辑器「拾取」按钮） | 2026-09-24 | ✅ 完成 |
| [13-M3-切片2-选择器回退链与元素库.md](./13-M3-%20切片%202%20-%20选择器回退链与元素库.md) | M3 切片 2 · 选择器回退链（strict→property→ancestor→index→coords）+ 元素库持久化（elements 表 + 编辑器「元素」页签） | 2026-09-24 | ✅ 完成 |
| [14-M3-切片3-智能录制POC.md](./14-M3-%20切片%203%20-%20智能录制POC.md) | M3 切片 3 · 智能录制 POC（观察式事件流→click/typeText/scroll 指令 + 录制即入库 + 编辑器「录制」按钮/录制态 + locate_element dry-run 校验） | 2026-09-24 | ✅ 完成 |
| [15-M3-切片4-录制重放闭环与pressKey.md](./15-M3-%20切片%204%20-%20录制重放闭环与pressKey.md) | M3 切片 4 · 录制重放闭环（录→存→跑记事本回读验证）+ pressKey 非文本键/快捷键指令 + locate 校验失败原因 trace + HTTP 线程 COM 修复 | 2026-09-24 | ✅ 完成 |
| [16-M3-切片5-回放稳定性.md](./16-M3-%20切片%205%20-%20回放稳定性.md) | M3 切片 5 · 回放稳定性（click_element 定位失败自动重试 + 每次重跑定位链按标题重取窗口句柄 + 失败 trace 透传到运行日志） | 2026-09-24 | ✅ 完成 |
| [17-M3-切片6-窗口圈定录制.md](./17-M3-%20切片%206%20-%20窗口圈定录制.md) | M3 切片 6 · 窗口句柄圈定录制范围（record:start 加 target_pid，录制只保留目标进程事件 + /desktop/window_pid + 编辑器「圈定窗口」按钮） | 2026-09-24 | ✅ 完成 |
| [18-M3-切片7-坐标兜底窗口偏移修正.md](./18-M3-%20切片%207%20-%20坐标兜底窗口偏移修正.md) | M3 切片 7 · 坐标兜底加固（element_to_dict 记录 windowBoundingBox，回放 coords 按窗口当前位置 dx/dy 把旧包围盒换算到新偏移） | 2026-09-25 | ✅ 完成 |
| [19-M3-切片8-聚合阈值可配置.md](./19-M3-%20切片%208%20-%20聚合阈值可配置.md) | M3 切片 8 · 录制聚合阈值可配置（/record/start 加 thresholds，click_debounce/typing_gap/scroll_gap 可覆盖，默认沿用常量，非法静默忽略） | 2026-09-25 | ✅ 完成 |
| [20-M3-切片9-录制流程参数化.md](./20-M3-%20切片%209%20-%20录制流程参数化.md) | M3 切片 9 · 录制流程参数化（新增 record-params.ts，把 typeText 硬编码文本抽成 inputN 流程变量，步骤改为 ${var} 引用，运行时 interpolate 替换） | 2026-09-25 | ✅ 完成 |
| [21-M3-切片10-运行前变量填写对话框.md](./21-M3-%20切片%2010%20-%20运行前变量填写对话框.md) | M3 切片 10 · 运行前变量填写对话框（run-overrides.ts 按类型合并用户填值；flow.vars 非空时点运行弹窗填值后再跑） | 2026-09-25 | ✅ 完成 |
| [22-M3-切片11-坐标滚动量参数化.md](./22-M3-%20切片%2011%20-%20坐标滚动量参数化.md) | M3 切片 11 · 坐标/滚动量参数化（scroll delta/x/y 抽成 scrollDelta/scrollX/scrollY 数值变量，runner 插值后转数字） | 2026-09-25 | ✅ 完成 |
| [23-M3-切片12-阈值设置面板与持久化.md](./23-M3-%20切片%2012%20-%20阈值设置面板与持久化.md) | M3 切片 12 · 阈值设置面板+持久化（settings 表落盘 + 编辑器「设置」页签，录制自动带上 DB 阈值） | 2026-09-25 | ✅ 完成 |
| [24-M3-切片13-坐标兜底运行层加固.md](./24-M3-%20切片%2013%20-%20坐标兜底运行层加固.md) | M3 切片 13 · 坐标兜底运行层加固（点击前 SetForegroundWindow 置前 + AttachThreadInput 前台锁处理） | 2026-09-25 | ✅ 完成 |
| [25-M3-切片14-变量弹窗增强.md](./25-M3-%20切片%2014%20-%20变量弹窗增强.md) | M3 切片 14 · 变量弹窗增强（FlowVar required/description + 必填校验 + localStorage 上次值记忆） | 2026-09-25 | ✅ 完成 |
| [26-M3-切片15-点击boundingBox参数化.md](./26-M3-%20切片%2015%20-%20点击%20boundingBox%20参数化.md) | M3 切片 15 · 点击 boundingBox 内 JSON 插值参数化（clickX/clickY 变量，target 转插值 JSON 字符串） | 2026-09-25 | ✅ 完成 |
| [27-M3-切片16-控件路径点击统一置前.md](./27-M3-%20切片%2016%20-%20控件路径点击统一置前.md) | M3 切片 16 · 控件路径点击统一置前（可选加固收尾） | 2026-09-25 | ✅ 完成 |
| [28-M3-切片17-流程级录制阈值覆盖.md](./28-M3-%20切片%2017%20-%20流程级录制阈值覆盖.md) | M3 切片 17 · 流程级录制阈值覆盖 + 录制中显示生效阈值（FlowDoc.recordThresholds） | 2026-09-25 | ✅ 完成 |
| [29-M3-切片18-置前短延时开关.md](./29-M3-%20切片%2018%20-%20置前短延时开关.md) | M3 切片 18 · 回放点击置前后短延时开关（默认关，/desktop/config 推送） | 2026-09-25 | ✅ 完成 |
| [30-M4-1-数据抓取向导V1.md](./30-M4-1-数据抓取向导V1.md) | M4 切片 1 · 数据抓取向导 V1（WebSession.eval + webScrapeList + 兄弟聚类识别 + 字段标注向导 + CSV 导出） | 2026-09-25 | ✅ 完成 |
| [31-M4-2-聚类加固与离线基准.md](./31-M4-2-聚类加固与离线基准.md) | M4 切片 2 · 聚类算法加固（class-hash 去抖 / 属性包含 / 纯 tag 父级限定）+ 10 形态离线基准（10/10 通过） | 2026-09-25 | ✅ 完成 |
| [32-M4-3-浏览器CDP点选拾取.md](./32-M4-3-浏览器CDP点选拾取.md) | M4 切片 3 · 页面内高亮+点击确认拾取 CSS 路径，向导「点选」按钮回填示例选择器 | 2026-09-25 | ✅ 完成 |
| [33-M4-4-浏览器录制器V1.md](./33-M4-4-浏览器录制器V1.md) | M4 切片 4 · 页面 mousedown/input 录制，停止后转 webClick/webInput 步骤追加流程 | 2026-09-25 | ✅ 完成 |
| [34-M4-5-录制器V2.md](./34-M4-5-录制器V2.md) | M4 切片 5 · 滚动录制 webScroll + 导航后自动重注入 + 录制浮层 | 2026-09-25 | ✅ 完成 |
| [35-M4-6-录制器V3.md](./35-M4-6-录制器V3.md) | M4 切片 6 · 键盘功能键录制（Enter/Tab/Esc）→ webPressKey | 2026-09-25 | ✅ 完成 |
| [36-M4-7-翻页入抓.md](./36-M4-7-翻页入抓.md) | M4 切片 7 · webScrapeList 加 nextSelector/maxPages，自动点下一页循环抓 | 2026-09-25 | ✅ 完成 |
| [37-M4-8_9-XLSX与修饰键.md](./37-M4-8_9-XLSX与修饰键.md) | M4 切片 8-9 · XLSX 导出 + 录制器修饰键 Ctrl/Alt 组合 | 2026-09-25 | ✅ 完成 |
| [38-M4-10-录制器真站冒烟.md](./38-M4-10-录制器真站冒烟.md) | M4 切片 10 · 录制器真浏览器端到端冒烟（vite-node 跑 RealWebSession，click/fill/scroll/功能键/修饰键/跨导航重注入 10/10；旧 smoke_web_live 修到 7/7） | 2026-09-25 | ✅ 完成 |
| [39-M4-11-iframe支持.md](./39-M4-11-iframe支持.md) | M4 切片 11 · web 指令跨 iframe（frameSelector + frameLocator/contentFrame；iframe 冒烟 3/3） | 2026-09-25 | ✅ 完成 |
| [40-M5-1-计划任务调度.md](./40-M5-1-计划任务调度.md) | M5 切片 1 · 计划任务调度（tasks 表 + croner + TriggersView 真实列表/新建/启停；CRUD 冒烟 8/8） | 2026-09-25 | ✅ 完成 |
| [41-M5-2-调度加固-互斥与补跑.md](./41-M5-2-调度加固-互斥与补跑.md) | M5 切片 2 · TaskScheduler 全局互斥（isRunning）+ 启动错过补跑（catchUp/graceMs）；调度器 7 用例 | 2026-09-25 | ✅ 完成 |
| [42-M5-3-RobotsView执行记录.md](./42-M5-3-RobotsView执行记录.md) | M5 切片 3 · RobotsView 真实化：按 run_id 聚合运行历史 + 展开日志明细；查询冒烟 11/11 | 2026-09-25 | ✅ 完成 |
| [43-M5-4-热键触发器.md](./43-M5-4-热键触发器.md) | M5 切片 4 · globalShortcut 热键触发器（tasks 表加 hotkey 列 + HotkeyManager）；CRUD 冒烟 5/5 | 2026-09-25 | ✅ 完成 |
| [44-M5-5-文件监听触发器.md](./44-M5-5-文件监听触发器.md) | M5 切片 5 · fs.watch 文件监听触发器（watch_path 列 + FileWatchManager 防抖去重）；真冒烟 2/2 | 2026-09-25 | ✅ 完成 |
| [45-M5-6-桌面网页混合流程演示.md](./45-M5-6-桌面网页混合流程演示.md) | M5 切片 6 · 一条 FlowDoc 混合跑 M3 桌面+M4 网页指令（真 Chromium + stub 桌面）；冒烟 4/4 | 2026-09-25 | ✅ 完成 |
| [46-M5-7-9-triggerFile-RobotsView增强-查重.md](./46-M5-7-9-triggerFile-RobotsView增强-查重.md) | M5 切片 7-9 · triggerFile 注入 + RobotsView 筛选/清空 + 热键目录查重 | 2026-09-25 | ✅ 完成 |
| [47-M5-10-调度实时日志推RobotsView.md](./47-M5-10-调度实时日志推RobotsView.md) | M5 切片 10 · 调度触发 flowId 归属修复 + RobotsView 订阅 run:event 实时显示运行中项/流式日志；冒烟 10/10 | 2026-09-25 | ✅ 完成 |
| [48-M5-11-LLM配置入口.md](./48-M5-11-LLM配置入口.md) | M5 切片 11 · LLM 配置 UI（baseURL/model/apiKey DPAPI 加密 + 测试连接 + 热重载）；冒烟 8/8 | 2026-09-25 | ✅ 完成 |
| [49-M5-12-AI报错解释.md](./49-M5-12-AI报错解释.md) | M5 切片 12 · RobotsView 错误项一键 AI 解释（explainError 纯函数 + llm:explain-error IPC）；冒烟 9/9 | 2026-09-25 | ✅ 完成 |
| [50-M5-13-文件监听加固.md](./50-M5-13-文件监听加固.md) | M5 切片 13 · fs.watch recursive 递归 + waitStable 等文件写完 + 防抖按文件独立；冒烟 5/5 | 2026-09-25 | ✅ 完成 |
| [51-M5-14-LLM预设下拉.md](./51-M5-14-LLM预设下拉.md) | M5 切片 14 · LLM 配置面板厂商预设下拉（智谱/DeepSeek/Kimi/通义/Ollama 一键填 baseURL+model） | 2026-09-25 | ✅ 完成 |
| [52-M5-15-编辑器失败即时解释.md](./52-M5-15-编辑器失败即时解释.md) | M5 切片 15 · run:end-meta 事件 + EditorView 失败时一键 AI 解释（不切 RobotsView） | 2026-09-25 | ✅ 完成 |
| [53-M5-16-AI魔法指令前端入口.md](./53-M5-16-AI魔法指令前端入口.md) | M5 切片 16 · 工具栏 AI 魔法按钮 + 对话框调 llm:generate-flow 替换当前流程 | 2026-09-25 | ✅ 完成 |
| [54-M5-17-AI魔法追加模式.md](./54-M5-17-AI魔法追加模式.md) | M5 切片 17 · AI 魔法对话框加替换/追加单选，追加时步骤拼末尾+变量去重 | 2026-09-25 | ✅ 完成 |
| [55-M5-18-NSIS安装包.md](./55-M5-18-NSIS安装包.md) | M5 切片 18 · electron-builder NSIS 打包，npm run dist 出 ruili-rpa-0.1.0-setup.exe（123.7 MB） | 2026-09-25 | ✅ 完成 |
| [56-M5-19-应用图标.md](./56-M5-19-应用图标.md) | M5 切片 19 · build/icon.png 接入 win.icon + 开发窗口图标，exe/安装包内嵌品牌图标（124.0 MB） | 2026-09-25 | ✅ 完成 |
| [57-M5-20-PythonSidecar打包进resources.md](./57-M5-20-PythonSidecar打包进resources.md) | M5 切片 20 · 裁剪版 Python+sidecar 打进 resources（extraResources），主进程 resourcesPath 定位，装机即用桌面指令（155.4 MB） | 2026-09-25 | ✅ 完成 |
| [58-M5-21-固化sidecar裁剪脚本.md](./58-M5-21-固化sidecar裁剪脚本.md) | M5 切片 21 · scripts/build-sidecar.ts + npm run build:sidecar 固化 Python 裁剪复制流程（自验，重打包 151.3 MB） | 2026-09-25 | ✅ 完成 |
| [59-M5-22-OCR进包与自动更新坑位.md](./59-M5-22-OCR进包与自动更新坑位.md) | M5 切片 22 · RapidOCR+OpenCV 打进 build/python（装机端 ocr/cv2=true）；electron-updater 留空坑位；安装包 230.7 MB | 2026-09-25 | ✅ 完成 |
| [60-M5-23-官方模板30个.md](./60-M5-23-官方模板30个.md) | M5 切片 23 · 官方内置模板 33 个（shared/templates.ts）+ MarketView 模板市场（搜索/分类/使用→另存开编辑器）+ AppsView 入口；vitest 271、pytest 84 | 2026-09-25 | ✅ 完成 |
| [61-M5-24-流程包导入导出.md](./61-M5-24-流程包导入导出.md) | M5 切片 24 · 流程包 .json 导出（另存为）/导入（打开→校验→另存新流程）；shared/flow-package.ts 纯函数 + 8 例单测；主进程 dialog 与 preload/env 类型补齐；vitest 279 | 2026-09-25 | ✅ 完成 |
| [62-M5-25-官方模板扩到50.md](./62-M5-25-官方模板扩到50.md) | M5 切片 25 · 官方模板 33→50（新增网页/Excel/桌面/入门/OCR/端到端 17 个组合）；复用既有两测试自动校验；vitest 330、renderer 962.04 kB | 2026-09-25 | ✅ 完成 |
| [63-M5-26-electron-updater接入.md](./63-M5-26-electron-updater接入.md) | M5 切片 26 · electron-updater 接入（GitHub Releases publish + initUpdater/checkForUpdates/quitAndInstall + 状态推 renderer + 下载完成 dialog 重启提示；dev 环境自动跳过）；typecheck 0、vitest 330、pytest 84 | 2026-09-25 | ✅ 完成 |
| [64-M6-1-renderer更新UI.md](./64-M6-1-renderer更新UI.md) | M6 切片 1 · TopBar 版本胶囊改成可点击检查更新按钮（订阅 updater.onStatus 显示 checking/available/downloaded/error 状态；3s 瞬态恢复；renderer 963.58 kB） | 2026-09-25 | ✅ 完成 |
| [65-M6-3-崩溃上报.md](./65-M6-3-崩溃上报.md) | M6 切片 3 · 未捕获异常落盘 crash.log（主进程 uncaughtException/unhandledRejection + renderer error/unhandledrejection 经 IPC 转发 + render-process-gone；本地不上传）；typecheck 0、vitest 330、pytest 84 | 2026-09-25 | ✅ 完成 |
| [66-M6-2-首次运行引导.md](./66-M6-2-首次运行引导.md) | M6 切片 2 · 首次打开欢迎卡片（localStorage ruili-onboarded；浏览模板/开始使用）+ LLM 预设加硅基流动免费模型 Qwen2.5-7B-Instruct（已实测连通）；renderer 967.64 kB | 2026-09-26 | ✅ 完成 |
| [67-M6-4-5-6-分享更新设置完善.md](./67-M6-4-5-6-分享更新设置完善.md) | M6 切片 4/5/6 · .rui 扩展名关联 + 版本号动态化(app.getVersion) + 下载进度百分比 + 设置页关于区块(查看崩溃日志/检查更新)；renderer 970.18 kB。M6 全部切片完成 | 2026-09-26 | ✅ 完成 |
| [68-M7-1-rui导入与crash轮转.md](./68-M7-1-rui导入与crash轮转.md) | M7 切片 1 · .rui 双击真实导入(单实例锁+second-instance+读文件→落库→推 app:open-flow) + crash.log 1MB 启动轮转(.1/.2 备份) + 补 whenReady createWindow()；SMOKE 验证通过、重打安装包 230.9 MB；renderer 970.46 kB | 2026-09-26 | ✅ 完成 |
| [69-M7-2-性能基线度量.md](./69-M7-2-性能基线度量.md) | M7 切片 2 · 性能基线度量（RUILI_PERF 门控埋点：冷启动 ~0.8s / RSS 194MB / renderer 947.7KB·gzip180KB；只度量不改行为；vitest 330/pytest 84/typecheck 0） | 2026-09-26 | ✅ 完成 |
| [70-M7-3-发版前准备与版本徽章修复.md](./70-M7-3-发版前准备与版本徽章修复.md) | M7 切片 3 · 发版前准备：装机版冷启动实测 0.6-1.0s / RSS 194MB；修掉装机版版本徽章 v0.0.0 真 bug（preload 改读 package.json）；重打安装包 230.9MB 静默装机；vitest 330/pytest 84/typecheck 0 | 2026-09-26 | ✅ 完成 |
| [71-M7-4-GitHub建仓与首次Release发布.md](./71-M7-4-GitHub建仓与首次Release发布.md) | M7 切片 4 · GitHub 建仓 uwjtg/ruili-rpa + push main + v0.1.0 正式 Release（setup.exe 230.9MB + blockmap + latest.yml）；releases.atom 200，自动更新链路打通；token 未入库 | 2026-09-26 | ✅ 完成 |
| [72-M7-5-GitHub-Actions-CI.md](./72-M7-5-GitHub-Actions-CI.md) | M7 切片 5 · GitHub Actions CI（ci.yml push/PR 跑 typecheck+vitest+pytest；release.yml 推 tag v* 自动 build sidecar/构建/发 Release/draft 翻正式；用内置 GITHUB_TOKEN 不再本地带 token）；本地基线 330/84/0 | 2026-09-26 | ✅ 完成 |
| [73-M7-6-v0.1.1-CI自动发版.md](./73-M7-6-v0.1.1-CI自动发版.md) | M7 切片 6 · 0.1.1 发版演练（npm version patch → 推 tag → Actions 6 分钟全自动出 258MB NSIS+latest.yml 发 Release；修 ci.yml 漏装 pytest + un-draft 防 electron-builder 双 draft；装机版真升级受旧包 owner 错+CDN 不通阻塞） | 2026-09-26 | ✅ 完成 |
| [74-M7-7-真机rui双击验证.md](./74-M7-7-真机rui双击验证.md) | M7 切片 7 · 真机 .rui 双击导入验证（注册表关联确认；首次启动传 .rui 落库；已运行时再传 second-instance 落库；无崩溃；标准包+裸 FlowDoc 两种格式都通） | 2026-09-26 | ✅ 完成 |
| [75-M7-8-指令扩充第一批.md](./75-M7-8-指令扩充第一批.md) | M7 切片 8 · 指令扩充第一批（文件 6/网络 POST 1/通知 webhook 3/数据处理 6，共 16 条零新依赖；vitest 330→341；指令总数 33→49） | 2026-09-26 | ✅ 完成 |
| [76-M7-9-系统托盘与开机自启.md](./76-M7-9-系统托盘与开机自启.md) | M7 切片 9 · 系统托盘图标+右键菜单+关闭收托盘+开机自启（--hidden 静默启动）；新增 src/main/tray.ts；零新依赖；未做真机 GUI 冒烟 | 2026-09-26 | ✅ 完成 |
| [77-M7-10-指令扩充第二批.md](./77-M7-10-指令扩充第二批.md) | M7 切片 10 · 系统类 9 条（剪贴板 2/对话框 5/sleep/beep）；SystemLike 接口懒加载 electron；vitest 341→348；指令总数 49→58 | 2026-09-26 | ✅ 完成 |
| [78-M7-11-指令扩充第三批.md](./78-M7-11-指令扩充第三批.md) | M7 切片 11 · 数据处理 16 条（字符串 6/日期 3/数学 5/数组 2）；纯 Node 零依赖；vitest 348→358；指令总数 58→74 | 2026-09-26 | ✅ 完成 |
| [79-M7-12-指令扩充第四批.md](./79-M7-12-指令扩充第四批.md) | M7 切片 12 · CSV 5 条（parseText/readFile/rowsToObjects/objectsToRows/writeFile）；自实现 RFC4180 子集；UTF-8 BOM；vitest 358→365；指令总数 74→79 | 2026-09-26 | ✅ 完成 |
| [80-M7-13-指令扩充第五批.md](./80-M7-13-指令扩充第五批.md) | M7 切片 13 · 文件 6 + 字符串 5 + 数学 4（共 15 条零依赖）；registerFileExtraCommands/registerDataExtraCommands；vitest 365→369；指令总数 79→94 | 2026-09-26 | ✅ 完成 |
| [81-M7-14-指令扩充第六批.md](./81-M7-14-指令扩充第六批.md) | M7 切片 14 · 路径 4/环境 2/Base64 2/字符串 4/数学 3（共 15 条零依赖）；vitest 369→374；指令总数 94→109 | 2026-09-26 | ✅ 完成 |
| [82-M7-15-指令扩充第七批.md](./82-M7-15-指令扩充第七批.md) | M7 切片 15 · 数组 6/字符串 2/数字 2/文件 1/流程 1/时间 1（共 13 条零依赖；httpGet 与 demo 重复已删）；vitest 374→378；指令总数 109→122 | 2026-09-26 | ✅ 完成 |
| [83-M7-16-邮件指令.md](./83-M7-16-邮件指令.md) | M7 切片 16 · 第一个新依赖 nodemailer；sendMail/sendMailViaEnv 2 条 SMTP 发信；MailerLike 接口可测；vitest 378→382；指令总数 122→124 | 2026-09-26 | ✅ 完成 |
| [84-M7-17-Word文档生成.md](./84-M7-17-Word文档生成.md) | M7 切片 17 · 第二个新依赖 docx；docxCreateText/docxCreateTable 2 条；PK 魔数校验；vitest 382→385；指令总数 124→126 | 2026-09-26 | ✅ 完成 |
| [85-M7-18-PDF处理.md](./85-M7-18-PDF处理.md) | M7 切片 18 · 第三个新依赖 pdf-lib；pdfMerge/pdfExtractPages 2 条；页码/范围解析；vitest 385→388；指令总数 126→128 | 2026-09-26 | ✅ 完成 |
| [86-M7-19-Excel读写.md](./86-M7-19-Excel读写.md) | M7 切片 19 · 第四个新依赖 exceljs（纯 Node 不需 Office）；xlsxListSheets/ReadSheet/WriteSheet 3 条；vitest 388→390；指令总数 128→131 | 2026-09-26 | ✅ 完成 |
