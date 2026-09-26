import type { JSX, ReactNode } from 'react'
import TopBar from './TopBar'
import WelcomeModal from './WelcomeModal'

/** 应用壳：顶部标题栏 + 内容区（7 视图路由渲染于此）+ 首次引导 */
export default function AppShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="app">
      <TopBar />
      <main className="app-content">{children}</main>
      <WelcomeModal />
    </div>
  )
}
