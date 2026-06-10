import { Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import StockDetail from './pages/StockDetail'
import TradeLogPage from './pages/TradeLogPage'
import Settings from './pages/Settings'
import SyncManager from './components/SyncManager'
import Portfolio from './pages/Portfolio'
import Events from './pages/Events'
import OrderPlan from './pages/OrderPlan'
import { saveAuthTokenFromHash } from './services/authSync'

function AuthReturnHandler() {
  const navigate = useNavigate()
  useEffect(() => {
    if (saveAuthTokenFromHash()) navigate('/settings', { replace: true })
  }, [navigate])
  return null
}

export default function App() {
  return (
    <>
      <SyncManager />
      <AuthReturnHandler />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stock/:symbol" element={<StockDetail />} />
          <Route path="/trades" element={<TradeLogPage />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/orders" element={<OrderPlan />} />
          <Route path="/events" element={<Events />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  )
}
