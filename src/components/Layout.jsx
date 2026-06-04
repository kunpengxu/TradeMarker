import { NavLink, Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand"><span>TM</span> TradeMarker</NavLink>
        <nav>
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/trades">Trade Log</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      <main className="app-content"><Outlet /></main>
      <footer>For personal journaling and visualization only. Not financial advice. No brokerage connection. No order execution.</footer>
    </div>
  )
}
