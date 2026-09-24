/**
 * 指令注册表：引擎侧把 CmdMeta（UI 元数据）与 runner（执行函数）绑在一起。
 *
 * 新增指令 = register() 一条 RegisteredCommand；
 * UI 从 list() 拿到元数据渲染指令库 / 参数面板，解释器从 get() 拿到 runner 执行。
 */

import type { StepNode } from '../../shared/ast'
import type { CmdMeta } from '../../shared/cmd-schema'
import type { RunContext } from '../core/context'

/** 引擎侧注册的指令：元数据 + 执行函数 */
export interface RegisteredCommand extends CmdMeta {
  /**
   * 执行函数。
   * @param ctx  运行上下文（变量/日志/子步骤/取消）
   * @param params 步骤参数
   * @param step  步骤节点（块指令据此访问 children / else）
   */
  runner: (
    ctx: RunContext,
    params: Record<string, unknown>,
    step: StepNode
  ) => Promise<unknown>
}

export class CommandRegistry {
  private commands = new Map<string, RegisteredCommand>()

  register(cmd: RegisteredCommand): void {
    if (this.commands.has(cmd.id)) {
      throw new Error(`指令 id 重复注册: ${cmd.id}`)
    }
    this.commands.set(cmd.id, cmd)
  }

  get(id: string): RegisteredCommand | undefined {
    return this.commands.get(id)
  }

  has(id: string): boolean {
    return this.commands.has(id)
  }

  list(): RegisteredCommand[] {
    return [...this.commands.values()]
  }
}
