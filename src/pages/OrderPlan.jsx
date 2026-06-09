import { useEffect, useMemo, useState } from 'react'
import { loadOrderPlanFromGitHub } from '../services/githubSync'
import { normalizeOrderPlan } from '../services/orderPlan'
import { money, number } from '../utils/formatters'
import { useI18n } from '../i18n'

const sideClass = (side) => side.toLowerCase().replace(/[^a-z]/g, '-')
const formatDate = (date) => {
  const value = String(date || '')
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: value.includes('T') || value.includes(':') ? 'short' : undefined }) : 'Not specified'
}
const formatMaybeMoney = (value) => value == null ? '—' : money(value)
const formatMaybeNumber = (value) => value == null ? '—' : number(value, 4)

function OrderLegs({ legs, t }) {
  return <div className="order-leg-list">{legs.map((leg, index) => <div className="order-leg" key={leg.id || index}>
    <strong>{leg.label}</strong>
    <span>{t('type')} <b>{leg.orderType}</b></span>
    <span>{t('limit')} <b>{formatMaybeMoney(leg.price)}</b></span>
    <span>{t('shares')} <b>{formatMaybeNumber(leg.shares)}</b></span>
    <span>{t('amount')} <b>{formatMaybeMoney(leg.amount)}</b></span>
    {leg.percent != null && <span>{t('size')} <b>{leg.percent}%</b></span>}
    {leg.condition && <p>{leg.condition}</p>}
    {leg.note && <p>{leg.note}</p>}
  </div>)}</div>
}

function OrderCard({ order, t }) {
  return <article className={`order-plan-card ${sideClass(order.side)}`}>
    <header><div><span className={`side ${sideClass(order.side)}`}>{order.side}</span><h3>{order.symbol || t('noSymbol')}</h3></div>{order.priority && <strong>{order.priority}</strong>}</header>
    <div className="order-metrics">
      <span>{t('totalShares')}<strong>{formatMaybeNumber(order.totalShares)}</strong></span>
      <span>{t('totalAmount')}<strong>{formatMaybeMoney(order.totalAmount)}</strong></span>
      <span>{t('target')}<strong>{formatMaybeMoney(order.targetPrice)}</strong></span>
      <span>{t('stopLoss')}<strong>{formatMaybeMoney(order.stopLoss)}</strong></span>
      <span>{t('takeProfit')}<strong>{formatMaybeMoney(order.takeProfit)}</strong></span>
      <span>{t('status')}<strong>{order.status}</strong></span>
    </div>
    {order.reason && <div className="order-note"><span>{t('reason')}</span><p>{order.reason}</p></div>}
    {order.risk && <div className="order-note risk"><span>{t('riskInvalidation')}</span><p>{order.risk}</p></div>}
    {order.note && <div className="order-note"><span>{t('note')}</span><p>{order.note}</p></div>}
    <OrderLegs legs={order.legs} t={t} />
  </article>
}

export default function OrderPlan() {
  const { t } = useI18n()
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
      <span>{t('title')}<strong>{plan.title}</strong></span>
      <span>{t('tradingDate')}<strong>{plan.tradingDate || '—'}</strong></span>
      <span>{t('generated')}<strong>{formatDate(plan.generatedAt)}</strong></span>
      <span>{t('orders')}<strong>{plan.orders.length}</strong></span>
    </div>}
    {plan?.summary && <div className="panel"><h2>{t('planSummary')}</h2><p>{plan.summary}</p></div>}
    {plan?.assumptions?.length ? <div className="panel order-bullets"><h2>{t('assumptions')}</h2>{plan.assumptions.map((item, index) => <p key={index}>{item}</p>)}</div> : null}
    {plan?.warnings?.length ? <div className="panel order-bullets warning"><h2>{t('warnings')}</h2>{plan.warnings.map((item, index) => <p key={index}>{item}</p>)}</div> : null}
    {loading ? <div className="loading">{t('loadingOrderPlan')}</div> : plan ? <div className="order-plan-groups">{['BUY', 'SELL', 'WATCH'].map((side) => <section key={side}><h2>{sideLabel[side]} <small>{grouped[side].length}</small></h2>{grouped[side].length ? <div className="order-plan-list">{grouped[side].map((order) => <OrderCard order={order} key={order.id} t={t} />)}</div> : <div className="empty-inline">{emptyLabel[side]}</div>}</section>)}</div> : <div className="empty-inline">{t('noOrderPlanLoaded')}</div>}
  </section>
}
