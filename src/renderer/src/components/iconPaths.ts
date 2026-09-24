/**
 * 自绘线性 SVG 图标路径库（迁移自 V3 原型 icon() 的 P 对象）。
 * 规范：24 viewBox、线性、描边 1.7-1.9、currentColor、圆角端点。
 * 禁止引入图标库与 emoji。本数据为静态常量，无外部输入，可安全内联。
 */
export const ICON_PATHS: Record<string, string> = {
  loop: '<path d="M17 3l3 3-3 3"/><path d="M20 6H8a4 4 0 0 0-4 4v1"/><path d="M7 21l-3-3 3-3"/><path d="M4 18h12a4 4 0 0 0 4-4v-1"/>',
  branch:
    '<circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="12" r="2.2"/><path d="M8.2 5H12a3 3 0 0 1 3 3v1M8.2 19H12a3 3 0 0 0 3-3v-1"/>',
  clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.5V12l3 2"/>',
  skip: '<path d="M5 5v14"/><path d="M13 7l5 5-5 5"/><path d="M18 12H9"/>',
  call: '<path d="M4 12h8"/><path d="m9 8 4 4-4 4"/><rect x="14" y="6" width="6" height="12" rx="1.5"/>',
  globe:
    '<circle cx="12" cy="12" r="8.2"/><path d="M3.8 12h16.4M12 3.8c2.6 2.2 3.9 5 3.9 8.2s-1.3 6-3.9 8.2c-2.6-2.2-3.9-5-3.9-8.2s1.3-6 3.9-8.2z"/>',
  cursor: '<path d="M5 3l7 17 2.2-6.8L21 11z"/>',
  keyboard: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 11h.01M11 11h.01M15 11h.01M7 14h10"/>',
  text: '<path d="M5 6h14M9 6v13h6V6"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/>',
  table: '<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M3.5 9.5h17M9 9.5V20M15 9.5V20"/>',
  mouse: '<rect x="8" y="3.5" width="8" height="17" rx="4"/><path d="M12 7v3.5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  folder: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  equals: '<path d="M5 9h14M5 15h14"/>',
  regex: '<path d="M6 4 18 20"/><path d="M9.5 4.5A2.5 2.5 0 1 1 7 2"/><path d="M17 21.5A2.5 2.5 0 1 1 19.5 24"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5 4.2 4.2 0 0 1 16.8 17z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7.5 7.5 6 7.5-6"/>',
  terminal: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="m7 10 2.5 2.5L7 15M12.5 15H17"/>',
  dialog: '<rect x="3.5" y="5" width="17" height="12" rx="2"/><path d="M8 21l2.5-4M12 11h.01"/>',
  window: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17M6.5 6.7h.01M9 6.7h.01"/>',
  camera:
    '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2.5h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.2"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  grip: '<circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
  bp: '<circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  disable: '<circle cx="12" cy="12" r="8.2"/><path d="M6.5 17.5 17.5 6.5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  trash: '<path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/>',
  check: '<path d="m5 12.5 5 5L19 7"/>',
  flagend: '<path d="M6 21V4"/><path d="M6 4h11l-2.5 4L17 12H6"/>',
  bag: '<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8z"/><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8"/>',
  // ---- 壳与导航补充（自绘，与原型同规范） ----
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10v9h11v-9"/><path d="M10.5 19v-4h3v4"/>',
  apps: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  edit: '<path d="M4 20h16"/><path d="M6.5 16.5l9.6-9.6a1.8 1.8 0 0 1 2.6 0l.4.4a1.8 1.8 0 0 1 0 2.6l-9.6 9.6L5 19z"/>',
  trigger: '<path d="M12 5v14M5 12h14"/>',
  robot: '<rect x="5" y="8" width="14" height="10" rx="3"/><circle cx="9.5" cy="13" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.5" cy="13" r="1.2" fill="currentColor" stroke="none"/><path d="M12 8V5.5"/><circle cx="12" cy="4" r="1.2"/><path d="M12 18v1.5a1.5 1.5 0 0 1-1.5 1.5h-1"/>',
  market: '<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8z"/><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8"/>',
  edu: '<path d="M4 9l8-4 8 4-8 4z"/><path d="M6.5 11.5V16a4 4 0 0 0 5.5 3.7A4 4 0 0 0 17.5 16v-4.5"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  help: '<circle cx="12" cy="12" r="8.2"/><path d="M9.6 9.2a2.5 2.5 0 0 1 4.9.7c0 1.6-2.5 2-2.5 3.3"/><path d="M12 16.5h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8"/>',
  chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M4 20h17"/>',
  arrow: '<path d="M5 12h14"/><path d="m14 7 5 5-5 5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  'win-min': '<path d="M5 12h14"/>',
  'win-max': '<rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/>',
  'win-close': '<path d="M7 7l10 10M17 7 7 17"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'
}

/** 未知名图标时的兜底 */
export const FALLBACK_ICON = 'terminal'
