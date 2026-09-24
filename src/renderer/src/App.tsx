import type { JSX } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import AcademyView from './views/AcademyView'
import AppsView from './views/AppsView'
import EditorView from './views/EditorView'
import HomeView from './views/HomeView'
import MarketView from './views/MarketView'
import RobotsView from './views/RobotsView'
import TriggersView from './views/TriggersView'

/** 7 视图路由（HashRouter：Electron 生产加载 file:// 下稳定） */
export default function App(): JSX.Element {
  return (
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomeView />} />
          <Route path="/apps" element={<AppsView />} />
          <Route path="/editor" element={<EditorView />} />
          <Route path="/triggers" element={<TriggersView />} />
          <Route path="/robots" element={<RobotsView />} />
          <Route path="/market" element={<MarketView />} />
          <Route path="/academy" element={<AcademyView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </HashRouter>
  )
}
