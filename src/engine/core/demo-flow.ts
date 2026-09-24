/**
 * 阶段 2 验收用 5 步演示流程。
 *
 * 链路：开场日志 → mock HTTP GET 取商品列表 → 循环遍历（子步骤输出每条商品）
 *      → 设置汇总变量 → 输出汇总。
 * 覆盖：叶子指令 / 块指令 / 变量读写 / ${var} 插值 / 局部作用域。
 */

import type { FlowDoc } from '../../shared/ast'

export const DEMO_FLOW: FlowDoc = {
  version: 1,
  name: '商品比价演示',
  vars: [],
  steps: [
    {
      id: 's1',
      cmdId: 'logMessage',
      params: { message: '=== 开始商品比价演示 ===', level: 'info' }
    },
    {
      id: 's2',
      cmdId: 'httpGet',
      params: {
        url: 'https://mock-api.example.com/products',
        resultVar: 'products'
      }
    },
    {
      id: 's3',
      cmdId: 'loopList',
      params: { listVar: 'products', itemVar: 'product' },
      children: [
        {
          id: 's3-1',
          cmdId: 'logMessage',
          params: {
            message: '抓取到商品: ${product.name} ¥${product.price}',
            level: 'success'
          }
        }
      ]
    },
    {
      id: 's4',
      cmdId: 'setVar',
      params: { name: 'summary', value: '共完成 2 个商品抓取' }
    },
    {
      id: 's5',
      cmdId: 'logMessage',
      params: { message: '${summary}', level: 'info' }
    }
  ]
}
