/**
 * 浏览器录制器 V1（M4 切片 4）。
 *
 * 两段自包含函数字符串：
 *  - REC_START_FN：注入 mousedown/input 监听，事件 push 到 window.__ruiliWebEvents；
 *    mousedown 记元素 CSS 路径；input 用 500ms 去抖取最终值（避免每键一条）。
 *  - REC_STOP_FN：移除监听，返回事件数组并清空。
 *
 * 主流程：渲染层「录网页」→ IPC web-record:start → 注入监听 →
 * 用户在浏览器操作 → IPC web-record:stop → 取回事件数组 →
 * 渲染层转成 webClick/webInput 步骤追加流程。
 *
 * 事件形状：
 *  { type: 'click', selector: string }
 *  { type: 'fill', selector: string, value: string }
 *  { type: 'scroll', deltaY: number }
 */

import { CSS_PATH_FN } from './pick-script'

/** 注入录制监听器（同 evaluate 作用域内可调 cssPathOf） */
export const REC_START_FN = `function startWebRecord() {
  'use strict';
  if (window.__ruiliWebRecording) return;
  window.__ruiliWebRecording = true;
  window.__ruiliWebEvents = [];
  window.__ruiliWebTimers = {};

  // 录制浮层（右上角红色指示）
  var badge = document.createElement('div');
  badge.setAttribute('data-ruili-rec-badge', '1');
  badge.textContent = '● 网页录制中';
  badge.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;background:#E64340;color:#fff;font:12px/1.6 sans-serif;padding:4px 10px;border-radius:12px;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
  document.documentElement.appendChild(badge);
  window.__ruiliRecBadge = badge;

  function cssPathOf(el) {
    ${CSS_PATH_FN.replace(/^function cssPathOf\(el\) \{/, '').replace(/\}\s*$/, '')}
  }

  function onDown(e) {
    if (e.button !== 0) return; // 只录左键
    var el = e.target;
    if (!el || el.nodeType !== 1) return;
    var sel = cssPathOf(el);
    if (sel) {
      window.__ruiliWebEvents.push({ type: 'click', selector: sel, ts: Date.now() });
    }
  }

  function onInput(e) {
    var el = e.target;
    if (!el || el.nodeType !== 1) return;
    var tag = el.tagName.toLowerCase();
    var type = (el.getAttribute && el.getAttribute('type')) || '';
    // 只录文本类输入框
    var isText = tag === 'textarea' ||
      (tag === 'input' && !/^(button|submit|reset|checkbox|radio|file|hidden|image)$/i.test(type));
    if (!isText) return;
    var sel = cssPathOf(el);
    if (!sel) return;
    var v = el.value || '';
    // 去抖：500ms 内同选择器多次 input 只留最后一次
    if (window.__ruiliWebTimers[sel]) clearTimeout(window.__ruiliWebTimers[sel]);
    window.__ruiliWebTimers[sel] = setTimeout(function () {
      window.__ruiliWebEvents.push({ type: 'fill', selector: sel, value: v, ts: Date.now() });
    }, 500);
  }

  function onWheel(e) {
    // 连续滚动去抖 300ms：合并成一条
    if (window.__ruiliWebTimers.__scroll) clearTimeout(window.__ruiliWebTimers.__scroll);
    var delta = e.deltaY || 0;
    window.__ruiliWebTimers.__scroll = setTimeout(function () {
      window.__ruiliWebEvents.push({ type: 'scroll', deltaY: Math.round(delta), ts: Date.now() });
    }, 300);
  }

  window.__ruiliWebOnDown = onDown;
  window.__ruiliWebOnInput = onInput;
  window.__ruiliWebOnWheel = onWheel;
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('wheel', onWheel, true);
}`

/** 停止录制并返回事件 */
export const REC_STOP_FN = `function stopWebRecord() {
  'use strict';
  if (!window.__ruiliWebRecording) return [];
  document.removeEventListener('mousedown', window.__ruiliWebOnDown, true);
  document.removeEventListener('input', window.__ruiliWebOnInput, true);
  document.removeEventListener('wheel', window.__ruiliWebOnWheel, true);
  if (window.__ruiliRecBadge && window.__ruiliRecBadge.parentNode) {
    window.__ruiliRecBadge.parentNode.removeChild(window.__ruiliRecBadge);
  }
  // 清掉未触发的去抖定时器
  for (var k in window.__ruiliWebTimers) {
    clearTimeout(window.__ruiliWebTimers[k]);
  }
  window.__ruiliWebRecording = false;
  var evs = window.__ruiliWebEvents || [];
  window.__ruiliWebEvents = [];
  window.__ruiliWebTimers = {};
  return evs;
}`

/** 录制事件（跨进程传输形状） */
export interface WebRecordEvent {
  type: 'click' | 'fill' | 'scroll'
  selector?: string
  value?: string
  deltaY?: number
  ts?: number
}
