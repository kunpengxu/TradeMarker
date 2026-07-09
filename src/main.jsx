import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './theme'
import './index.css'

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
