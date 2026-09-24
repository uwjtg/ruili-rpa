# src/engine · 执行引擎（阶段 2 起填充）

本目录为执行引擎工作区，规划结构：

```
src/engine/
  core/       # AST 解释器、作用域、取消令牌（阶段 2 / T2）
  commands/   # 指令注册表 + 内置指令（阶段 2 / T3）
  web/        # Playwright CDP 网页链路（阶段 3 / T4）
  excel/      # exceljs 读写（阶段 3 / T5）
  llm/        # LLM Provider 配置化（阶段 4 / T8）
```

本阶段仅占位。引擎逻辑在阶段 2 起实现，**核心路径必须带单元测试**（见《接力开发模式说明》§5 统一 DoD）。
