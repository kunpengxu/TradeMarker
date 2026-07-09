import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './theme'
import './index.css'

const CHUNK_RELOAD_KEY = 'trademarker.chunkReloaded'

const reloadAfterChunkFailure = () => {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
  } catch {}
  const url = new URL(window.location.href)
  url.searchParams.set('tm_reload', Date.now().toString())
  window.location.replace(url.toString())
}

const isChunkLoadFailure = (error) => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
  .test(String(error?.message || error || ''))

window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadFailure(event.reason)) reloadAfterChunkFailure()
})

window.addEventListener('error', (event) => {
  const target = event.target
  if (target?.tagName === 'SCRIPT' && String(target.src || '').includes('/assets/')) reloadAfterChunkFailure()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <I18nProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </I18nProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
)
