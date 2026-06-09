import { NavLink, Outlet } from 'react-router-dom'
import { useI18n } from '../i18n'

export default function Layout() {
  const { language, setLanguage, t } = useI18n()
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
          <NavLink to="/settings">{t('navSettings')}</NavLink>
        </nav>
        <div className="language-switch" aria-label={t('language')}>
          <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>{t('english')}</button>
          <button className={language === 'zh' ? 'active' : ''} onClick={() => setLanguage('zh')}>{t('chinese')}</button>
        </div>
      </header>
      <main className="app-content"><Outlet /></main>
      <footer>{t('footer')}</footer>
    </div>
  )
}
