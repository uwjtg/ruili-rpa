/**
 * 浏览器 CDP 点选拾取（M4 切片 3）。
 *
 * 三段自包含函数字符串（同 page-script 模式），主进程一次性 evaluate 注入页面：
 *  - CSS_PATH_FN：从元素生成稳定 CSS 选择器；
 *  - PICK_START_FN：mousemove 高亮 / mousedown 捕获 / Esc 取消，结果写到
 *    window.__ruiliPickResult / __ruiliPickCancelled / __ruiliPickDone；
 *  - PICK_READ_FN：读取拾取结果。
 *
 * 主流程：渲染层「点选」→ IPC → 主进程 evaluate 注入三段 + startPagePick() →
 * waitForFunction(__ruiliPickDone) → evaluate(PICK_READ_FN) 取回结果。
 */

/** 从元素生成稳定 CSS 路径（ES5，自包含） */
export const CSS_PATH_FN = `function cssPathOf(el) {
  'use strict';
  if (!el || el.nodeType !== 1) return '';
  if (el.id) return '#' + el.id;
  var parts = [];
  var cur = el;
  var guard = 0;
  while (cur && cur.nodeType === 1 && cur !== document.documentElement && guard < 15) {
    guard++;
    if (cur.id) { parts.unshift('#' + cur.id); break; }
    var seg = cur.tagName.toLowerCase();
    var c = (cur.getAttribute && cur.getAttribute('class')) || '';
    if (c) {
      var firstCls = c.trim().split(/\\s+/)[0];
      // 跳过纯 hash 类名（product_abc123 / css-1a2b3cd），避免选择器失效
      if (firstCls && !/-[a-zA-Z0-9]{6,}$/.test(firstCls) && !/_[a-zA-Z0-9]{6,}$/.test(firstCls)) {
        seg += '.' + firstCls;
      }
    }
    var parent = cur.parentElement;
    if (parent) {
      var sameTag = 0, myIdx = 0;
      for (var i = 0; i < parent.children.length; i++) {
        if (parent.children[i].tagName === cur.tagName) {
          sameTag++;
          if (parent.children[i] === cur) myIdx = sameTag;
        }
      }
      if (sameTag > 1) seg += ':nth-of-type(' + myIdx + ')';
    }
    parts.unshift(seg);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}`

/** 注入拾取监听器（ES5；同 evaluate 作用域内可调 cssPathOf） */
export const PICK_START_FN = `function startPagePick() {
  'use strict';
  if (window.__ruiliPickActive) return;
  window.__ruiliPickActive = true;
  window.__ruiliPickDone = false;
  window.__ruiliPickCancelled = false;
  window.__ruiliPickResult = null;

  var box = document.createElement('div');
  box.setAttribute('data-ruili-pick-box', '1');
  box.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #7C5CFC;background:rgba(124,92,252,0.15);z-index:2147483647;display:none;';
  document.documentElement.appendChild(box);

  function stripHash(c) { var f = (c||'').trim().split(/\s+/)[0] || ''; return f.replace(/[-_][a-zA-Z0-9]{6,}$/, ''); }
  function onMove(e) {
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    var r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
    window.__ruiliPickTarget = el;
  }
  function finish(cancelled) {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mousedown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    if (box.parentNode) box.parentNode.removeChild(box);
    window.__ruiliPickActive = false;
    window.__ruiliPickDone = true;
    window.__ruiliPickCancelled = !!cancelled;
    if (!cancelled && window.__ruiliPickTarget) {
      var el = window.__ruiliPickTarget;
      window.__ruiliPickResult = {
        selector: cssPathOf(el),
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
        features: {
          id: el.id || '',
          name: el.getAttribute('name') || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          dataTestid: el.getAttribute('data-testid') || '',
          role: el.getAttribute('role') || '',
          placeholder: el.getAttribute('placeholder') || '',
          classStem: stripHash(el.getAttribute('class') || '')
        }
      };
    }
  }
  function onDown(e) {
    e.preventDefault();
    e.stopPropagation();
    finish(false);
  }
  function onKey(e) {
    if (e.key === 'Escape') finish(true);
  }
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
}`

/** 主进程等待拾取完成后读取结果（页面上下文） */
export const PICK_READ_FN = `function readPagePick() {
  return {
    done: window.__ruiliPickDone === true,
    cancelled: window.__ruiliPickCancelled === true,
    result: window.__ruiliPickResult || null
  };
}`

/** 拾取时冗余抓到的元素特征（用于回放回退链） */
export interface PickedFeatures {
  id: string
  name: string
  ariaLabel: string
  dataTestid: string
  role: string
  placeholder: string
  classStem: string
}

/** 拾取结果类型 */
export interface PagePickResult {
  selector: string
  tag: string
  text: string
  features?: PickedFeatures
}
