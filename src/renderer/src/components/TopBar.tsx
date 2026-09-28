import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
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

type UpdState = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
  version?: string
  percent?: number
}

const UPD_LABEL: Record<UpdState['status'], string> = {
  idle: 'v0.1.0',
  checking: '检查更新中…',
  available: '有新版',
  downloading: '下载中',
  downloaded: '更新已就绪',
  'not-available': '已是最新',
  error: '更新检查失败'
}

const UPD_COLOR: Record<UpdState['status'], { bg: string; fg: string }> = {
  idle: { bg: 'var(--gray)', fg: 'var(--text-3)' },
  checking: { bg: 'var(--gray)', fg: 'var(--text-3)' },
  available: { bg: 'var(--blue-soft)', fg: 'var(--blue)' },
  downloading: { bg: 'var(--blue-soft)', fg: 'var(--blue)' },
  downloaded: { bg: 'var(--bg-success, #E7F8F0)', fg: 'var(--green, #1DBF73)' },
  'not-available': { bg: 'var(--bg-success, #E7F8F0)', fg: 'var(--green, #1DBF73)' },
  error: { bg: 'var(--red-soft)', fg: 'var(--red)' }
}

/**
 * 顶部标题栏（全局）：红色圆形 logo + 产品名 + 版本胶囊（点击检查更新）+ 横向导航
 * + 右侧（邀请同事 / 帮助 / 通知 / 头像 / 窗口控制）。
 * 窗口控制走 preload 暴露的 window.ruili.win（IPC → 主进程）。
 */
export default function TopBar(): JSX.Element {
  const win = window.ruili?.win
  const updater = window.ruili?.updater
  const [upd, setUpd] = useState<UpdState>({ status: 'idle' })
  // P2：占位按钮未实装，点击给轻提示（2s 自动消失）
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showNotice = (msg: string): void => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice(msg)
    noticeTimer.current = setTimeout(() => setNotice(null), 2000)
  }

  useEffect(() => {
    if (!updater?.onStatus) return
    const off = updater.onStatus((s) => {
      setUpd({ status: s.status, version: s.version, percent: s.percent })
      // 瞬时状态 3 秒后回到 idle
      if (s.status === 'not-available' || s.status === 'error') {
        setTimeout(() => setUpd({ status: 'idle' }), 3000)
      }
    })
    return off
  }, [updater])

  const appVersion = window.ruili?.appVersion ?? '0.0.0'
  const label =
    upd.status === 'available' && upd.version
      ? `${UPD_LABEL.available} v${upd.version}`
      : upd.status === 'downloading'
        ? `${UPD_LABEL.downloading} ${upd.percent ?? 0}%`
        : upd.status === 'downloaded' && upd.version
          ? `${UPD_LABEL.downloaded} v${upd.version}`
          : upd.status === 'idle'
            ? `v${appVersion}`
            : UPD_LABEL[upd.status]

  const color = UPD_COLOR[upd.status]

  return (
    <header className="titlebar">
      <div className="logo" aria-hidden="true">
        锐
      </div>
      <span className="tb-name">锐流RPA</span>
      <button
        type="button"
        className="tb-ver"
        title="点击检查更新"
        onClick={() => updater?.check()}
        style={{ background: color.bg, color: color.fg, border: 'none', cursor: 'pointer' }}
      >
        {label}
      </button>

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
        <button
          type="button"
          className="pill-red"
          onClick={() => showNotice('协作邀请功能即将上线')}
        >
          <Icon name="plus" size={13} strokeWidth={2.2} />
          邀请同事
        </button>
        <button
          type="button"
          className="tb-btn"
          aria-label="帮助中心"
          title="帮助中心"
          onClick={() => showNotice('帮助中心即将上线，可查看教程页')}
        >
          <Icon name="help" size={17} />
        </button>
        <button
          type="button"
          className="tb-btn"
          aria-label="通知"
          title="通知"
          onClick={() => showNotice('暂无新通知')}
        >
          <Icon name="bell" size={17} />
          <span className="reddot" aria-hidden="true" />
        </button>
        <span className="avatar" title="本机用户（本地单机版）">
          本
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

      {notice ? (
        <div
          style={{
            position: 'fixed',
            top: 48,
            right: 24,
            zIndex: 9999,
            background: 'rgba(31,35,41,.92)',
            color: '#fff',
            fontSize: 12,
            padding: '8px 14px',
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,.18)',
            pointerEvents: 'none'
          }}
          role="status"
        >
          {notice}
        </div>
      ) : null}
    </header>
  )
}
