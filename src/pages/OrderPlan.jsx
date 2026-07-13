import { useEffect, useMemo, useState } from 'react'
import OrderPlanCard, { localizedText, safeText } from '../components/OrderPlanCard'
import OrderPlanErrorBoundary from '../components/OrderPlanErrorBoundary'
import SymbolLink from '../components/SymbolLink'
import { loadOrderPlanFromGitHub } from '../services/githubSync'
import { normalizeOrderPlan } from '../services/orderPlan'
import { calculateReservedCashByCurrency, deleteOrderCommitment, getOrderCommitments, orderCommitmentKey, reconcileOrderPlanSignature, recordOrderCommitmentFill, saveOrderCommitment, updateOrderCommitmentStatus } from '../services/storage'
import { money, number } from '../utils/formatters'
import { useI18n } from '../i18n'

const formatDate = (date) => {
  const value = String(date || '')
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: value.includes('T') || value.includes(':') ? 'short' : undefined }) : 'Not specified'
}
const hasValue = (value) => value != null && Number.isFinite(Number(value)) && Number(value) !== 0
const getText = (value, fallback = '', language = 'zh') => {
  if (!value) return fallback
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => getText(item, '', language)).filter(Boolean).join(' · ') || fallback
  if (typeof value === 'object') return value[language] || value.zh || value.en || fallback
  return String(value)
}
const fieldVariants = (item, key, language, { includePlain = true } = {}) => {
  if (!item || typeof item !== 'object') return []
  const primary = language === 'zh'
    ? [`${key}Zh`, `${key}ZH`, `${key}Cn`, `${key}CN`]
    : [`${key}En`, `${key}EN`]
  const fallback = language === 'zh'
    ? [`${key}En`, `${key}EN`]
    : [`${key}Zh`, `${key}ZH`, `${key}Cn`, `${key}CN`]
  return [...primary, ...(includePlain ? [key] : []), ...fallback].map((variant) => item[variant])
}
const textFromFields = (language, ...entries) => {
  for (const entry of entries) {
    const value = Array.isArray(entry) ? fieldVariants(entry[0], entry[1], language, entry[2]) : [entry]
    for (const candidate of value) {
      const text = getText(candidate, '', language)
      if (text) return text
    }
  }
  return ''
}
const compactText = (value, max = 130) => {
  const text = getText(value).trim()
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
  return safeText(language === 'zh' ? zh[key] || value : en[key] || value, language)
}
const formatPrice = (value) => hasValue(value) ? Number(value).toFixed(2) : null
const rawOf = (item) => item?.raw && typeof item.raw === 'object' ? item.raw : {}
const summarizeLegs = (order, language) => {
  const rows = (order.legs || []).map((leg) => {
    const raw = rawOf(leg)
    const label = textFromFields(language, [raw, 'label'], [leg, 'label'], leg.labelText, raw.label, leg.label)
    const condition = textFromFields(language, [raw, 'condition'], [leg, 'condition'], leg.conditionText, raw.condition, leg.condition)
    const parts = [
      tokenLabel(leg.side || raw.side || order.side, language),
      formatPrice(leg.price ?? raw.price),
      hasValue(leg.shares ?? raw.shares) ? language === 'zh' ? `${number(leg.shares ?? raw.shares, 4)}股` : `${number(leg.shares ?? raw.shares, 4)} sh` : null,
      label,
      condition,
    ].filter(Boolean)
    return parts.join(language === 'zh' ? ' ' : ' ')
  }).filter(Boolean)
  return rows.length ? rows.join(language === 'zh' ? '；' : '; ') : language === 'zh' ? '无挂单 / 观察' : 'No order / watch'
}
const fallbackSuggestion = (order, language) => {
  const side = tokenLabel(order.side, language)
  const status = order.status ? tokenLabel(order.status, language) : ''
  if (language === 'zh') return [side, status].filter(Boolean).join(' · ') || '—'
  return [side, status].filter(Boolean).join(' · ') || '—'
}
const currentSituationFor = (order, language) => {
  const raw = rawOf(order)
  return textFromFields(
    language,
    [raw, 'currentSituation', { includePlain: false }],
    order.currentSituationText,
    order.currentSituation,
    raw.currentSituation,
    [raw, 'reason'],
    order.reasonText,
    order.reason,
  )
}
const suggestionFor = (order, language) => {
  const raw = rawOf(order)
  const recommendation = textFromFields(
    language,
    [raw, 'recommendation', { includePlain: false }],
    raw.recommendationText,
    order.recommendationText,
    order.recommendation,
    order.suggestionText,
    order.suggestion,
    raw.recommendation,
  )
  if (recommendation) return recommendation

  const risk = textFromFields(language, [raw, 'risk'], order.riskText, order.risk)
  const reEntryPlan = textFromFields(language, [raw, 'reEntryPlan'], [raw, 'reentryPlan'], order.reEntryPlanText, order.reEntryPlan)
  if (risk && reEntryPlan) return [risk, reEntryPlan].join(language === 'zh' ? '；' : '; ')
  if (risk || reEntryPlan) return risk || reEntryPlan

  return ''
}
const plannedOrderFor = (order, language) => summarizeLegs(order, language)

const ORDER_LIFECYCLE_STATUSES = ['PLACED', 'PARTIAL', 'FILLED', 'CANCELLED', 'EXPIRED']

function OrderPlanSummaryTable({ orders, language, t, committedKeys, commitmentsByKey, onToggleCommitment, onStatusChange, onRecordFill }) {
  if (!orders.length) return null
  return <div className="panel order-summary-table-panel">
    <h2>{t('orderQuickSummary')}</h2>
    <div className="order-summary-table-wrap">
      <table className="order-summary-table">
        <thead><tr>
          <th>{t('orderPlaced')}</th>
          <th>{t('priority')}</th>
          <th>{t('orderSymbol')}</th>
          <th>{t('currentSituation')}</th>
          <th>{t('suggestion')}</th>
          <th>{t('plannedOrder')}</th>
        </tr></thead>
        <tbody>{orders.map((order, index) => {
          const current = currentSituationFor(order, language)
          const suggestion = suggestionFor(order, language) || fallbackSuggestion(order, language)
          const plannedOrder = plannedOrderFor(order, language)
          const checked = committedKeys.has(orderCommitmentKey(order))
          const commitment = commitmentsByKey.get(orderCommitmentKey(order))
          return <tr className={`${orderTone(order)} ${checked ? 'committed' : ''}`} key={order.id || `${order.symbol}-${index}`}>
            <td><label className="order-commit-checkbox"><input type="checkbox" checked={checked} onChange={() => onToggleCommitment(order)} aria-label={t('orderPlacedFor', { symbol: order.symbol || index + 1 })} /><span /></label></td>
            <td>{index + 1}</td>
            <td><strong>{order.symbol ? <SymbolLink symbol={order.symbol} className="order-summary-symbol" /> : '—'}</strong></td>
            <td>{compactText(getText(current, '', language), 150)}</td>
            <td><strong>{compactText(getText(suggestion, '', language), 120)}</strong></td>
            <td><div className="order-lifecycle-cell"><span>{getText(plannedOrder, '', language)}</span>{checked && commitment ? <><select value={commitment.lifecycleStatus || 'PLACED'} onChange={(event) => onStatusChange(commitment.id, event.target.value)}>{ORDER_LIFECYCLE_STATUSES.map((status) => <option key={status} value={status}>{t(`orderStatus${status}`)}</option>)}</select>{['BUY', 'SELL'].includes(commitment.side) && ['PARTIAL', 'FILLED'].includes(commitment.lifecycleStatus || 'PLACED') ? <button type="button" className="secondary record-fill-button" onClick={() => onRecordFill(commitment)}>{t('recordFill')}</button> : null}</> : null}</div></td>
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
  const [orderCommitments, setOrderCommitments] = useState(() => getOrderCommitments())
  const [planType, setPlanType] = useState('REGULAR')

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
        const normalizedPlan = normalizeOrderPlan(result.data)
        reconcileOrderPlanSignature(JSON.stringify(result.data || normalizedPlan))
        setOrderCommitments(getOrderCommitments())
        setPlan(normalizedPlan)
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
  const committedKeys = useMemo(() => new Set(orderCommitments.map(orderCommitmentKey)), [orderCommitments])
  const commitmentsByKey = useMemo(() => new Map(orderCommitments.map((order) => [orderCommitmentKey(order), order])), [orderCommitments])
  const planTypeCounts = useMemo(() => ({
    REGULAR: (plan?.orders || []).filter((order) => order.planType !== 'INTRADAY').length,
    INTRADAY: (plan?.orders || []).filter((order) => order.planType === 'INTRADAY').length,
  }), [plan])
  const visibleOrders = useMemo(() => (plan?.orders || []).filter((order) => planType === 'INTRADAY' ? order.planType === 'INTRADAY' : order.planType !== 'INTRADAY'), [plan, planType])
  const committedSellValueByCurrency = useMemo(() => orderCommitments.reduce((result, order) => {
    if ((order.lifecycleStatus || 'PLACED') !== 'PLACED') return result
    if (order.side !== 'SELL') return result
    const currency = order.currency || 'USD'
    const legValue = (order.legs || []).reduce((sum, leg) => {
      if (String(leg.side || order.side).toUpperCase() !== 'SELL') return sum
      const price = Number(leg.price)
      const shares = Number(leg.shares)
      return Number.isFinite(price) && Number.isFinite(shares) ? sum + price * shares : sum
    }, 0)
    const value = legValue || Number(order.totalAmount || 0)
    result[currency] = (result[currency] || 0) + value
    return result
  }, {}), [orderCommitments])
  const reservedCash = useMemo(() => calculateReservedCashByCurrency(orderCommitments), [orderCommitments])
  const moneyLines = (values) => Object.entries(values).map(([currency, value]) => money(value, currency)).join(' · ') || '—'
  const toggleCommitment = (order) => {
    const key = orderCommitmentKey(order)
    setOrderCommitments(committedKeys.has(key) ? deleteOrderCommitment(key) : saveOrderCommitment(order))
  }
  const changeCommitmentStatus = (id, status) => setOrderCommitments(updateOrderCommitmentStatus(id, status))
  const recordFill = (commitment) => {
    const defaultPrice = commitment.legs?.find((leg) => Number(leg.price) > 0)?.price || ''
    const defaultShares = commitment.legs?.reduce((sum, leg) => sum + (Number(leg.shares) || 0), 0) || ''
    const price = prompt(t('fillPricePrompt', { symbol: commitment.symbol }), defaultPrice)
    if (price == null) return
    const shares = prompt(t('fillSharesPrompt', { symbol: commitment.symbol }), defaultShares)
    if (shares == null) return
    try {
      recordOrderCommitmentFill(commitment.id, { price, shares, lifecycleStatus: commitment.lifecycleStatus })
      setOrderCommitments(getOrderCommitments())
      setMessage(t('fillRecorded', { symbol: commitment.symbol }))
    } catch (error) {
      setMessage(error.message)
    }
  }

  const grouped = useMemo(() => {
    const groups = { BUY: [], SELL: [], WATCH: [] }
    visibleOrders.forEach((order) => {
      const key = order.side === 'BUY' || order.side === 'SELL' ? order.side : 'WATCH'
      groups[key].push(order)
    })
    return groups
  }, [visibleOrders])
  const actionGroups = useMemo(() => {
    const groups = { must: [], conditional: [], watch: [] }
    visibleOrders.forEach((order) => {
      const text = `${order.priority || ''} ${order.status || ''} ${order.side || ''}`.toLowerCase()
      if (order.side === 'WATCH' || text.includes('watch') || text.includes('no action')) groups.watch.push(order)
      else if (text.includes('high') || text.includes('ready') || text.includes('must')) groups.must.push(order)
      else groups.conditional.push(order)
    })
    return groups
  }, [visibleOrders])

  const sideLabel = { BUY: t('buyOrders'), SELL: t('sellOrders'), WATCH: t('watchNoAction') }
  const emptyLabel = { BUY: t('noBuyRecommendations'), SELL: t('noSellRecommendations'), WATCH: t('noWatchRecommendations') }

  return <section><div className="page-head"><div><p className="eyebrow">{t('orderEyebrow')}</p><h1>{t('orderTitle')}</h1><p>{t('orderSubtitle')}</p></div><button onClick={load} disabled={loading}>{loading ? t('loading') : t('reloadPlan')}</button></div>
    <details className="panel order-plan-source"><summary><span>{t('githubJsonFile')}</span><strong>{filename}</strong></summary><label><input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="order-plan.json" /></label><small>{t('orderFileHint')}</small></details>
    {message && <p className="notice">{message}</p>}
    <OrderPlanErrorBoundary resetKey={`${filename}:${message}:${planType}:${plan?.generatedAt || ''}`} onRetry={load}>
    {plan && <div className="order-plan-summary">
      <span>{t('title')}<strong>{localizedText(plan.titleText, language) || safeText(plan.title, language)}</strong></span>
      <span>{t('tradingDate')}<strong>{safeText(plan.tradingDate, language) || '—'}</strong></span>
      <span>{t('generated')}<strong>{formatDate(plan.generatedAt)}</strong></span>
      <span>{t('orders')}<strong>{plan.orders.length}</strong></span>
      <span>{t('committedOrders')}<strong>{orderCommitments.length}</strong></span>
      <span>{t('reservedByOrders')}<strong>{moneyLines(reservedCash)}</strong></span>
      <span>{t('sellReleaseEstimate')}<strong>{moneyLines(committedSellValueByCurrency)}</strong></span>
    </div>}
    {plan && <div className="order-plan-type-tabs" role="tablist" aria-label={t('planType')}>
      <button type="button" className={planType === 'REGULAR' ? 'active regular' : 'regular'} onClick={() => setPlanType('REGULAR')}>{t('regularPlan')} <strong>{planTypeCounts.REGULAR}</strong></button>
      <button type="button" className={planType === 'INTRADAY' ? 'active intraday' : 'intraday'} onClick={() => setPlanType('INTRADAY')}>{t('intradayPlan')} <strong>{planTypeCounts.INTRADAY}</strong></button>
    </div>}
    {(localizedText(plan?.summaryText, language) || safeText(plan?.summary, language)) && <div className="panel plan-briefing-panel"><div><span>{t('todayFocus')}</span><h2>{t('planSummary')}</h2></div><p>{localizedText(plan.summaryText, language) || safeText(plan.summary, language)}</p></div>}
    {plan && <OrderPlanSummaryTable orders={visibleOrders} language={language} t={t} committedKeys={committedKeys} commitmentsByKey={commitmentsByKey} onToggleCommitment={toggleCommitment} onStatusChange={changeCommitmentStatus} onRecordFill={recordFill} />}
    {(plan?.assumptionsText?.[language]?.length || plan?.assumptions?.length) ? <div className="panel order-bullets"><h2>{t('assumptions')}</h2>{(plan.assumptionsText?.[language] || plan.assumptions).map((item, index) => <p key={index}>{safeText(item, language)}</p>)}</div> : null}
    {(plan?.warningsText?.[language]?.length || plan?.warnings?.length) ? <div className="panel order-bullets warning"><h2>{t('warnings')}</h2>{(plan.warningsText?.[language] || plan.warnings).map((item, index) => <p key={index}>{safeText(item, language)}</p>)}</div> : null}
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
    </OrderPlanErrorBoundary>
  </section>
}
