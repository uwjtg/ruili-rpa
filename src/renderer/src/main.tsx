import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './theme/tokens.css'
import './styles/global.css'
import './styles/shell.css'
import './styles/home.css'

// M6-3：renderer 未捕获错误桥接到主进程落盘 crash.log
if (typeof window !== 'undefined' && window.ruili?.crash?.report) {
  window.addEventListener('error', (e) => {
    window.ruili?.crash?.report(
      e.message ?? 'unknown error',
      e.error?.stack ?? e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined
    )
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    window.ruili?.crash?.report(
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? reason.stack : undefined
    )
  })
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
