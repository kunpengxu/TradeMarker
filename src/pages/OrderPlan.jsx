import { useEffect, useMemo, useState } from 'react'
import OrderPlanCard, { localizedText } from '../components/OrderPlanCard'
import { loadOrderPlanFromGitHub } from '../services/githubSync'
import { normalizeOrderPlan } from '../services/orderPlan'
import { number } from '../utils/formatters'
import { useI18n } from '../i18n'

const formatDate = (date) => {
  const value = String(date || '')
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: value.includes('T') || value.includes(':') ? 'short' : undefined }) : 'Not specified'
}
const hasValue = (value) => value != null && Number.isFinite(Number(value)) && Number(value) !== 0
const compactText = (value, max = 130) => {
  const text = String(value || '').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
const orderTone = (order) => {
  const side = String(order.side || '').toLowerCase().replace(/[^a-z]/g, '-')
  const priority = String(order.priority || '').toLowerCase().replace(/[^a-z]/g, '-')
  return ['summary-row', side, priority && `priority-${priority}`].filter(Boolean).join(' ')
}
const tokenLabel = (value, language) => {
  const key = String(value || '').toUpperCase().replace(/\s+/g, '_')
  const zh = {
    BUY: '买',
    SELL: '卖',
    WATCH: '观察',
    HIGH: '高',
    MEDIUM: '中',
    LOW: '低',
    READY: '可执行',
    CONDITIONAL: '条件触发',
    PROPOSED: '建议',
    NO_ACTION: '不操作',
    LIMIT: '限价',
    MARKET: '市价',
  }
  const en = {
    BUY: 'buy',
    SELL: 'sell',
    WATCH: 'watch',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    READY: 'ready',
    CONDITIONAL: 'conditional',
    PROPOSED: 'proposed',
    NO_ACTION: 'no action',
    LIMIT: 'limit',
    MARKET: 'market',
  }
  return language === 'zh' ? zh[key] || value : en[key] || value
}
const formatPrice = (value) => hasValue(value) ? Number(value).toFixed(2) : null
const summarizeLegs = (order, language) => {
  const rows = (order.legs || []).map((leg) => {
    const parts = [
      formatPrice(leg.price),
      tokenLabel(order.side, language),
      hasValue(leg.shares) ? language === 'zh' ? `${number(leg.shares, 4)}股` : `${number(leg.shares, 4)} sh` : null,
      hasValue(leg.amount) ? language === 'zh' ? `金额 ${number(leg.amount, 2)}` : `amount ${number(leg.amount, 2)}` : null,
      hasValue(leg.percent) ? `${leg.percent}%` : null,
    ].filter(Boolean)
    return parts.join(language === 'zh' ? ' ' : ' ')
  }).filter(Boolean)
  return rows.length ? rows.join(language === 'zh' ? '；' : '; ') : '—'
}
const fallbackSuggestion = (order, language) => {
  const side = tokenLabel(order.side, language)
  const status = order.status ? tokenLabel(order.status, language) : ''
  if (language === 'zh') return [side, status].filter(Boolean).join(' · ') || '—'
  return [side, status].filter(Boolean).join(' · ') || '—'
}

function OrderPlanSummaryTable({ orders, language, t }) {
  if (!orders.length) return null
  return <div className="panel order-summary-table-panel">
    <h2>{t('orderQuickSummary')}</h2>
    <div className="order-summary-table-wrap">
      <table className="order-summary-table">
        <thead><tr>
          <th>{t('priority')}</th>
          <th>{t('orderSymbol')}</th>
          <th>{t('currentSituation')}</th>
          <th>{t('suggestion')}</th>
          <th>{t('plannedOrder')}</th>
        </tr></thead>
        <tbody>{orders.map((order, index) => {
          const current = localizedText(order.currentSituationText, language) || order.currentSituation || localizedText(order.reasonText, language) || order.reason || '—'
          const suggestion = localizedText(order.suggestionText, language) || order.suggestion || localizedText(order.noteText, language) || order.note || fallbackSuggestion(order, language)
          const plannedOrder = localizedText(order.plannedOrderText, language) || order.plannedOrder || summarizeLegs(order, language)
          return <tr className={orderTone(order)} key={order.id || `${order.symbol}-${index}`}>
            <td>{index + 1}</td>
            <td><strong>{order.symbol || '—'}</strong></td>
            <td>{compactText(current, 150)}</td>
            <td><strong>{compactText(suggestion, 120)}</strong></td>
            <td>{plannedOrder}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
  </div>
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
  const actionGroups = useMemo(() => {
    const groups = { must: [], conditional: [], watch: [] }
    ;(plan?.orders || []).forEach((order) => {
      const text = `${order.priority || ''} ${order.status || ''} ${order.side || ''}`.toLowerCase()
      if (order.side === 'WATCH' || text.includes('watch') || text.includes('no action')) groups.watch.push(order)
      else if (text.includes('high') || text.includes('ready') || text.includes('must')) groups.must.push(order)
      else groups.conditional.push(order)
    })
    return groups
  }, [plan])

  const sideLabel = { BUY: t('buyOrders'), SELL: t('sellOrders'), WATCH: t('watchNoAction') }
  const emptyLabel = { BUY: t('noBuyRecommendations'), SELL: t('noSellRecommendations'), WATCH: t('noWatchRecommendations') }

  return <section><div className="page-head"><div><p className="eyebrow">{t('orderEyebrow')}</p><h1>{t('orderTitle')}</h1><p>{t('orderSubtitle')}</p></div><button onClick={load} disabled={loading}>{loading ? t('loading') : t('reloadPlan')}</button></div>
    <details className="panel order-plan-source"><summary><span>{t('githubJsonFile')}</span><strong>{filename}</strong></summary><label><input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="order-plan.json" /></label><small>{t('orderFileHint')}</small></details>
    {message && <p className="notice">{message}</p>}
    {plan && <div className="order-plan-summary">
      <span>{t('title')}<strong>{localizedText(plan.titleText, language) || plan.title}</strong></span>
      <span>{t('tradingDate')}<strong>{plan.tradingDate || '—'}</strong></span>
      <span>{t('generated')}<strong>{formatDate(plan.generatedAt)}</strong></span>
      <span>{t('orders')}<strong>{plan.orders.length}</strong></span>
    </div>}
    {(localizedText(plan?.summaryText, language) || plan?.summary) && <div className="panel plan-briefing-panel"><div><span>{t('todayFocus')}</span><h2>{t('planSummary')}</h2></div><p>{localizedText(plan.summaryText, language) || plan.summary}</p></div>}
    {plan && <OrderPlanSummaryTable orders={plan.orders} language={language} t={t} />}
    {(plan?.assumptionsText?.[language]?.length || plan?.assumptions?.length) ? <div className="panel order-bullets"><h2>{t('assumptions')}</h2>{(plan.assumptionsText?.[language] || plan.assumptions).map((item, index) => <p key={index}>{item}</p>)}</div> : null}
    {(plan?.warningsText?.[language]?.length || plan?.warnings?.length) ? <div className="panel order-bullets warning"><h2>{t('warnings')}</h2>{(plan.warningsText?.[language] || plan.warnings).map((item, index) => <p key={index}>{item}</p>)}</div> : null}
    {loading ? <div className="loading">{t('loadingOrderPlan')}</div> : plan ? <>
      <div className="action-board">
        {[
          ['must', t('mustAct')],
          ['conditional', t('conditional')],
          ['watch', t('watching')],
        ].map(([key, label]) => <section className={`action-column ${key}`} key={key}><h2>{label} <small>{actionGroups[key].length}</small></h2>{actionGroups[key].length ? <div className="order-plan-list">{actionGroups[key].map((order) => <OrderPlanCard order={order} key={order.id} />)}</div> : <div className="empty-inline">{t('notSpecified')}</div>}</section>)}
      </div>
      <details className="side-breakdown"><summary>{t('currentPlan')}</summary><div className="order-plan-groups compact-breakdown">{['BUY', 'SELL', 'WATCH'].map((side) => <section key={side}><h2>{sideLabel[side]} <small>{grouped[side].length}</small></h2>{grouped[side].length ? <div className="order-plan-list">{grouped[side].map((order) => <OrderPlanCard order={order} key={`side-${order.id}`} />)}</div> : <div className="empty-inline">{emptyLabel[side]}</div>}</section>)}</div></details>
    </> : <div className="empty-inline">{t('noOrderPlanLoaded')}</div>}
  </section>
}
