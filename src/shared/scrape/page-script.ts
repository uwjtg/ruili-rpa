/**
 * 数据抓取向导 V1：页面内执行脚本（M4 切片 1）。
 *
 * 这两段函数体是**自包含字符串**（不 import、不闭包外部变量），由主进程包成
 * `new Function('arg', 'return (' + body + ')(arg)')` 再交给 Playwright
 * `page.evaluate(fn, arg)` 注入真实页面执行；单测用 linkedom 在 Node 侧跑
 * 同一份字符串——生产与测试跑的是同一段逻辑，不重复实现。
 *
 * 风格刻意用 ES5（var / function / 字符串拼接）：既兼容老旧目标站的 CSP
 * 环境（Playwright 用 Runtime.callFunctionOn，不受页面 CSP 影响），也避免
 * 模板串/可选链等在拼接转写时出错。
 */

import type { ScrapeInspectResult } from './spec'

/**
 * 在页面里跑：给定示例项选择器，沿祖先向上找"同 tag+class 兄弟最多"的一层，
 * 聚类出整列列表项；并返回示例项内可标注的候选子元素。
 *
 * 入参 arg = sampleSelector（字符串）
 * 返回 ScrapeInspectResult（见 spec.ts）
 */
export const INSPECT_FN_BODY = `function inspectInPage(sampleSelector) {
  'use strict';
  function textOf(el) {
    return (el.textContent || '').replace(/\\s+/g, ' ').trim();
  }
  function clsChain(el) {
    var c = (el.getAttribute('class') || '').trim();
    if (!c) return '';
    return c.split(/\\s+/).slice(0, 3).join('.');
  }
  function groupKey(el) {
    var t = el.tagName.toLowerCase();
    var c = clsChain(el);
    return c ? t + '.' + c : t;
  }
  function relPath(from, to) {
    var parts = [];
    var cur = from;
    while (cur && cur !== to) {
      var seg = cur.tagName.toLowerCase();
      var c = clsChain(cur);
      if (c) seg += '.' + c;
      parts.unshift(seg);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  var sample = document.querySelector(sampleSelector);
  if (!sample) return { ok: false, error: '未找到示例元素：' + sampleSelector };

  // 沿祖先找"示例所在兄弟组最大"的那一层
  var best = null; // { key, count }
  var node = sample.parentElement;
  var guard = 0;
  while (node && node.tagName !== 'BODY' && guard < 12) {
    guard++;
    var kids = node.children;
    var groups = {};
    for (var i = 0; i < kids.length; i++) {
      var k = groupKey(kids[i]);
      (groups[k] = groups[k] || []).push(kids[i]);
    }
    for (var gk in groups) {
      var g = groups[gk];
      if (g.indexOf(sample) >= 0 && g.length >= 2) {
        if (!best || g.length > best.count) best = { key: gk, count: g.length };
      }
    }
    node = node.parentElement;
  }
  if (!best) {
    return { ok: false, error: '未识别到相似列表项：示例元素同级至少需要 2 个同标签同 class 的兄弟节点' };
  }

  var listSelector = best.key;
  var matched = document.querySelectorAll(listSelector);
  if (matched.length < 2) {
    return { ok: false, error: '聚类结果只命中 ' + matched.length + ' 个元素，不足以成列；请换一个更内层的示例选择器' };
  }

  var samples = [];
  for (var s = 0; s < Math.min(3, matched.length); s++) {
    var t = textOf(matched[s]).slice(0, 60);
    samples.push(t);
  }

  // 示例项内候选字段：常见文本/链接/媒体元素
  var candidateTags = 'h1,h2,h3,h4,h5,h6,a,img,p,span,strong,em,time,button,div';
  var raw = sample.querySelectorAll(candidateTags);
  var candidates = [];
  var seen = {};
  for (var c = 0; c < raw.length && candidates.length < 12; c++) {
    var el = raw[c];
    var rp = relPath(el, sample);
    if (!rp || seen[rp]) continue;
    var txt = textOf(el).slice(0, 40);
    var href = el.getAttribute('href') || '';
    var src = el.getAttribute('src') || '';
    // 跳过纯空容器（无文本且无 href/src）
    if (!txt && !href && !src) continue;
    seen[rp] = true;
    candidates.push({
      selector: rp,
      tag: el.tagName.toLowerCase(),
      sampleText: txt,
      href: href || undefined,
      src: src || undefined
    });
  }

  return {
    ok: true,
    listSelector: listSelector,
    itemCount: matched.length,
    samples: samples,
    candidates: candidates
  };
}`

/**
 * 在页面里跑：对 listSelector 命中的每一项，按 fields 取 textContent/属性。
 *
 * 入参 arg = { listSelector: string, fields: [{name, subSelector, attr?}], maxItems?: number }
 * 返回 Array<Record<fieldName, string>>
 */
export const SCRAPE_FN_BODY = `function scrapeInPage(arg) {
  'use strict';
  var items = document.querySelectorAll(arg.listSelector);
  var fields = arg.fields || [];
  var max = Number(arg.maxItems) || 0;
  var n = max > 0 ? Math.min(items.length, max) : items.length;
  var out = [];
  for (var i = 0; i < n; i++) {
    var item = items[i];
    var row = {};
    for (var f = 0; f < fields.length; f++) {
      var fld = fields[f];
      var el = item.querySelector(fld.subSelector);
      if (!el) { row[fld.name] = ''; continue; }
      row[fld.name] = fld.attr ? (el.getAttribute(fld.attr) || '') : (el.textContent || '').trim();
    }
    out.push(row);
  }
  return out;
}`

/** 供 TS 侧引用的返回类型（页面内 JSON 序列化后对齐） */
export type { ScrapeInspectResult }
