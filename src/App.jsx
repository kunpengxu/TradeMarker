import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import Layout from './components/Layout'
import SyncManager from './components/SyncManager'
import { saveAuthTokenFromHash } from './services/authSync'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const StockDetail = lazy(() => import('./pages/StockDetail'))
const TradeLogPage = lazy(() => import('./pages/TradeLogPage'))
const Settings = lazy(() => import('./pages/Settings'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const Events = lazy(() => import('./pages/Events'))
const OrderPlan = lazy(() => import('./pages/OrderPlan'))
const AIAnalysis = lazy(() => import('./pages/AIAnalysis'))

function AuthReturnHandler() {
  const navigate = useNavigate()
  useEffect(() => {
    if (saveAuthTokenFromHash()) {
      window.dispatchEvent(new CustomEvent('trademarker:auth-changed'))
      navigate('/settings', { replace: true })
    }
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
          <Route path="/" element={<Suspense fallback={<div className="loading">Loading...</div>}><Dashboard /></Suspense>} />
          <Route path="/stock/:symbol" element={<Suspense fallback={<div className="loading">Loading...</div>}><StockDetail /></Suspense>} />
          <Route path="/trades" element={<Suspense fallback={<div className="loading">Loading...</div>}><TradeLogPage /></Suspense>} />
          <Route path="/portfolio" element={<Suspense fallback={<div className="loading">Loading...</div>}><Portfolio /></Suspense>} />
          <Route path="/orders" element={<Suspense fallback={<div className="loading">Loading...</div>}><OrderPlan /></Suspense>} />
          <Route path="/events" element={<Suspense fallback={<div className="loading">Loading...</div>}><Events /></Suspense>} />
          <Route path="/ai" element={<Suspense fallback={<div className="loading">Loading...</div>}><AIAnalysis /></Suspense>} />
          <Route path="/settings" element={<Suspense fallback={<div className="loading">Loading...</div>}><Settings /></Suspense>} />
        </Route>
      </Routes>
    </>
  )
}
