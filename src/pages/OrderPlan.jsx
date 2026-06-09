import { useEffect, useMemo, useState } from 'react'
import OrderPlanCard, { localizedText } from '../components/OrderPlanCard'
import { loadOrderPlanFromGitHub } from '../services/githubSync'
import { normalizeOrderPlan } from '../services/orderPlan'
import { useI18n } from '../i18n'

const formatDate = (date) => {
  const value = String(date || '')
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: value.includes('T') || value.includes(':') ? 'short' : undefined }) : 'Not specified'
}

export default function OrderPlan() {
  const { language, t } = useI18n()
  const [plan, setPlan] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [filename, setFilename] = useState('order-plan.json')

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const result = await loadOrderPlanFromGitHub(filename)
      if (result.status === 'disabled') {
        setPlan(null)
        setMessage(t('githubSyncNotConfigured'))
      } else if (result.status === 'empty') {
        setPlan(null)
        setMessage(t('noOrderFile', { filename }))
      } else {
        setPlan(normalizeOrderPlan(result.data))
        setMessage(t('loadedFile', { path: result.path }))
      }
    } catch (error) {
      setPlan(null)
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const grouped = useMemo(() => {
    const groups = { BUY: [], SELL: [], WATCH: [] }
    ;(plan?.orders || []).forEach((order) => {
      const key = order.side === 'BUY' || order.side === 'SELL' ? order.side : 'WATCH'
      groups[key].push(order)
    })
    return groups
  }, [plan])

  const sideLabel = { BUY: t('buyOrders'), SELL: t('sellOrders'), WATCH: t('watchNoAction') }
  const emptyLabel = { BUY: t('noBuyRecommendations'), SELL: t('noSellRecommendations'), WATCH: t('noWatchRecommendations') }

  return <section><div className="page-head"><div><p className="eyebrow">{t('orderEyebrow')}</p><h1>{t('orderTitle')}</h1><p>{t('orderSubtitle')}</p></div><button onClick={load} disabled={loading}>{loading ? t('loading') : t('reloadPlan')}</button></div>
    <div className="panel order-plan-source"><label>{t('githubJsonFile')}<input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="order-plan.json" /></label><small>{t('orderFileHint')}</small></div>
    {message && <p className="notice">{message}</p>}
    {plan && <div className="order-plan-summary">
      <span>{t('title')}<strong>{localizedText(plan.titleText, language) || plan.title}</strong></span>
      <span>{t('tradingDate')}<strong>{plan.tradingDate || '—'}</strong></span>
      <span>{t('generated')}<strong>{formatDate(plan.generatedAt)}</strong></span>
      <span>{t('orders')}<strong>{plan.orders.length}</strong></span>
    </div>}
    {(localizedText(plan?.summaryText, language) || plan?.summary) && <div className="panel"><h2>{t('planSummary')}</h2><p>{localizedText(plan.summaryText, language) || plan.summary}</p></div>}
    {(plan?.assumptionsText?.[language]?.length || plan?.assumptions?.length) ? <div className="panel order-bullets"><h2>{t('assumptions')}</h2>{(plan.assumptionsText?.[language] || plan.assumptions).map((item, index) => <p key={index}>{item}</p>)}</div> : null}
    {(plan?.warningsText?.[language]?.length || plan?.warnings?.length) ? <div className="panel order-bullets warning"><h2>{t('warnings')}</h2>{(plan.warningsText?.[language] || plan.warnings).map((item, index) => <p key={index}>{item}</p>)}</div> : null}
    {loading ? <div className="loading">{t('loadingOrderPlan')}</div> : plan ? <div className="order-plan-groups">{['BUY', 'SELL', 'WATCH'].map((side) => <section key={side}><h2>{sideLabel[side]} <small>{grouped[side].length}</small></h2>{grouped[side].length ? <div className="order-plan-list">{grouped[side].map((order) => <OrderPlanCard order={order} key={order.id} />)}</div> : <div className="empty-inline">{emptyLabel[side]}</div>}</section>)}</div> : <div className="empty-inline">{t('noOrderPlanLoaded')}</div>}
  </section>
}
