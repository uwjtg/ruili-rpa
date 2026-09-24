import type { JSX } from 'react'
import { NavLink } from 'react-router-dom'
import Icon from './Icon'

const NAV_ITEMS = [
  { to: '/', label: '工作台', icon: 'home' },
  { to: '/apps', label: '应用', icon: 'apps' },
  { to: '/editor', label: '流程编辑器', icon: 'edit' },
  { to: '/triggers', label: '触发器', icon: 'trigger' },
  { to: '/robots', label: '机器人', icon: 'robot' },
  { to: '/market', label: '市场', icon: 'market' },
  { to: '/academy', label: '教程', icon: 'edu' }
] as const

/**
 * 顶部标题栏（全局）：红色圆形 logo + 产品名 + 版本胶囊 + 横向导航
 * + 右侧（邀请同事 / 帮助 / 通知 / 头像 / 窗口控制）。
 * 窗口控制走 preload 暴露的 window.ruili.win（IPC → 主进程）。
 */
export default function TopBar(): JSX.Element {
  const win = window.ruili?.win

  return (
    <header className="titlebar">
      <div className="logo" aria-hidden="true">
        锐
      </div>
      <span className="tb-name">锐流RPA</span>
      <span className="tb-ver">V3 原型 · v0.1</span>

      <nav className="tb-nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
            end={item.to === '/'}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="tb-right">
        <button type="button" className="pill-red">
          <Icon name="plus" size={13} strokeWidth={2.2} />
          邀请同事
        </button>
        <button type="button" className="tb-btn" aria-label="帮助中心" title="帮助中心">
          <Icon name="help" size={17} />
        </button>
        <button type="button" className="tb-btn" aria-label="通知" title="通知">
          <Icon name="bell" size={17} />
          <span className="reddot" aria-hidden="true" />
        </button>
        <span className="avatar" title="演示用户">
          演
        </span>
        <span className="tb-sep" aria-hidden="true" />
        <button
          type="button"
          className="tb-btn"
          aria-label="最小化"
          onClick={() => win?.minimize()}
        >
          <Icon name="win-min" size={15} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          className="tb-btn"
          aria-label="最大化"
          onClick={() => win?.maximize()}
        >
          <Icon name="win-max" size={14} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          className="tb-btn close"
          aria-label="关闭"
          onClick={() => win?.close()}
        >
          <Icon name="win-close" size={15} strokeWidth={1.9} />
        </button>
      </div>
    </header>
  )
}
