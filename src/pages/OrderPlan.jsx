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
const hasValue = (value) => value != null && Number(value) !== 0
const compactText = (value, max = 180) => {
  const text = String(value || '').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
const textFor = (value, language) => {
  if (!value || typeof value !== 'object') return value || ''
  return value[language] || value.en || value.zh || ''
}

function OrderLegs({ legs, t, language }) {
  return <div className="order-leg-list compact">{legs.map((leg, index) => {
    const condition = textFor(leg.conditionText, language) || leg.condition
    const note = textFor(leg.noteText, language) || leg.note
    const parts = [
      leg.orderType,
      hasValue(leg.price) ? `${t('limit')} ${formatMaybeMoney(leg.price)}` : null,
      hasValue(leg.shares) ? `${t('shares')} ${formatMaybeNumber(leg.shares)}` : null,
      hasValue(leg.amount) ? `${t('amount')} ${formatMaybeMoney(leg.amount)}` : null,
      hasValue(leg.percent) ? `${t('size')} ${leg.percent}%` : null,
    ].filter(Boolean)
    return <div className="order-leg compact" key={leg.id || index}>
      <strong>{textFor(leg.labelText, language) || leg.label}</strong>
      <span>{parts.join(' · ') || t('notSpecified')}</span>
      {(condition || note) && <p>{compactText(condition || note, 150)}</p>}
    </div>
  })}</div>
}

function OrderCard({ order, t, language }) {
  const reason = textFor(order.reasonText, language) || order.reason
  const risk = textFor(order.riskText, language) || order.risk
  const note = textFor(order.noteText, language) || order.note
  const metrics = [
    hasValue(order.totalShares) ? `${t('shares')} ${formatMaybeNumber(order.totalShares)}` : null,
    hasValue(order.totalAmount) ? `${t('amount')} ${formatMaybeMoney(order.totalAmount)}` : null,
    hasValue(order.targetPrice) ? `${t('target')} ${formatMaybeMoney(order.targetPrice)}` : null,
    hasValue(order.stopLoss) ? `${t('stopLoss')} ${formatMaybeMoney(order.stopLoss)}` : null,
    hasValue(order.takeProfit) ? `${t('takeProfit')} ${formatMaybeMoney(order.takeProfit)}` : null,
    order.status ? `${t('status')} ${order.status}` : null,
  ].filter(Boolean)
  return <article className={`order-plan-card ${sideClass(order.side)}`}>
    <header><div><span className={`side ${sideClass(order.side)}`}>{order.side}</span><h3>{order.symbol || t('noSymbol')}</h3></div>{order.priority && <strong>{order.priority}</strong>}</header>
    {metrics.length ? <p className="order-compact-meta">{metrics.join(' · ')}</p> : null}
    <OrderLegs legs={order.legs} t={t} language={language} />
    {(reason || risk || note) && <p className="order-compact-note">
      {reason && <><b>{t('reason')}:</b> {compactText(reason)} </>}
      {risk && <><b className="risk">{t('riskInvalidation')}:</b> {compactText(risk)} </>}
      {note && <><b>{t('note')}:</b> {compactText(note)} </>}
    </p>}
  </article>
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
      <span>{t('title')}<strong>{textFor(plan.titleText, language) || plan.title}</strong></span>
      <span>{t('tradingDate')}<strong>{plan.tradingDate || '—'}</strong></span>
      <span>{t('generated')}<strong>{formatDate(plan.generatedAt)}</strong></span>
      <span>{t('orders')}<strong>{plan.orders.length}</strong></span>
    </div>}
    {(textFor(plan?.summaryText, language) || plan?.summary) && <div className="panel"><h2>{t('planSummary')}</h2><p>{textFor(plan.summaryText, language) || plan.summary}</p></div>}
    {(plan?.assumptionsText?.[language]?.length || plan?.assumptions?.length) ? <div className="panel order-bullets"><h2>{t('assumptions')}</h2>{(plan.assumptionsText?.[language] || plan.assumptions).map((item, index) => <p key={index}>{item}</p>)}</div> : null}
    {(plan?.warningsText?.[language]?.length || plan?.warnings?.length) ? <div className="panel order-bullets warning"><h2>{t('warnings')}</h2>{(plan.warningsText?.[language] || plan.warnings).map((item, index) => <p key={index}>{item}</p>)}</div> : null}
    {loading ? <div className="loading">{t('loadingOrderPlan')}</div> : plan ? <div className="order-plan-groups">{['BUY', 'SELL', 'WATCH'].map((side) => <section key={side}><h2>{sideLabel[side]} <small>{grouped[side].length}</small></h2>{grouped[side].length ? <div className="order-plan-list">{grouped[side].map((order) => <OrderCard order={order} key={order.id} t={t} language={language} />)}</div> : <div className="empty-inline">{emptyLabel[side]}</div>}</section>)}</div> : <div className="empty-inline">{t('noOrderPlanLoaded')}</div>}
  </section>
}
