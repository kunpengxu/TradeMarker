import { NavLink, Outlet } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useTheme } from '../theme'
import SyncStatus from './SyncStatus'

export default function Layout() {
  const { language, setLanguage, t } = useI18n()
  const { theme, toggleTheme } = useTheme()
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand"><span>TM</span> TradeMarker</NavLink>
        <nav>
          <NavLink to="/">{t('navDashboard')}</NavLink>
          <NavLink to="/portfolio">{t('navPortfolio')}</NavLink>
          <NavLink to="/orders">{t('navOrders')}</NavLink>
          <NavLink to="/events">{t('navEvents')}</NavLink>
          <NavLink to="/trades">{t('navTradeLog')}</NavLink>
          <NavLink to="/ai">{t('navAI')}</NavLink>
          <NavLink to="/settings">{t('navSettings')}</NavLink>
        </nav>
        <div className="topbar-controls">
          <button className="theme-toggle" onClick={toggleTheme} aria-label={t('theme')}>
            <span>{theme === 'dark' ? '☾' : '☼'}</span>{theme === 'dark' ? t('darkTheme') : t('lightTheme')}
          </button>
          <div className="language-switch" aria-label={t('language')}>
            <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>{t('english')}</button>
            <button className={language === 'zh' ? 'active' : ''} onClick={() => setLanguage('zh')}>{t('chinese')}</button>
          </div>
        </div>
      </header>
      <SyncStatus />
      <main className="app-content"><Outlet /></main>
      <nav className="mobile-tabbar" aria-label="Mobile navigation">
        <NavLink to="/">{t('navDashboard')}</NavLink>
        <NavLink to="/portfolio">{t('navPortfolio')}</NavLink>
        <NavLink to="/orders">{t('navOrders')}</NavLink>
        <NavLink to="/trades">{t('navTradeLog')}</NavLink>
        <NavLink to="/settings">{t('navSettings')}</NavLink>
      </nav>
      <footer>{t('footer')}</footer>
    </div>
  )
}
