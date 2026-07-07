import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog'
import IndicatorMenu from '../components/IndicatorMenu'
import IntervalSelector from '../components/IntervalSelector'
import OrderPlanCard, { localizedText } from '../components/OrderPlanCard'
import SymbolSearch from '../components/SymbolSearch'
import StockChart from '../components/StockChart'
import TradeLog from '../components/TradeLog'
import TradeModal from '../components/TradeModal'
import WatchlistSidebar from '../components/WatchlistSidebar'
import { loadOrderPlanFromGitHub, saveEventsCalendarToGitHub, saveMarketAnalysisToGitHub } from '../services/githubSync'
import { buildEventsCalendarExport } from '../services/eventsData'
import { buildMarketAnalysisExport } from '../services/marketAnalysisExport'
import { getIntradayCandles, getMarketDataProviderName, getMarketSnapshot, hasMarketDataApiKey } from '../services/marketData'
import { normalizeOrderPlan } from '../services/orderPlan'
import { calculatePosition, calculateRealizedPLByTrade } from '../services/positionCalculator'
import { addSymbolToGroup, applyPresetWatchlistGroupsOnce, calculateReservedCashByCurrency, deleteTrade, getCashBalances, getOrderCommitments, getTrades, getWatchlist, getWatchlistGroups, migrateCdrSymbolsToTorontoOnce, normalizeSymbol, removeSymbol, saveTrade, updateTrade } from '../services/storage'
import { dateTime, money, number, percent, valueClass } from '../utils/formatters'
import { useChartIndicators } from '../hooks/useChartIndicators'
import { useI18n } from '../i18n'

const cleanSymbol = (value) => String(value || '').toUpperCase().replace(/(:CA|:US)$/i, '').replace(/\.(NE|TO|V)$/i, '')
const badgeClass = (type) => String(type || '').replace(/[^a-z]/gi, '-').toLowerCase()
const formatEventDate = (date) => date ? new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'
const matchesSymbol = (orderSymbol, symbol) => {
  const order = String(orderSymbol || '').toUpperCase()
  const current = String(symbol || '').toUpperCase()
  return order === current || cleanSymbol(order) === cleanSymbol(current)
}
const DENSITY_KEY = 'trademarker.displayDensity'
const SELECTED_SYMBOL_KEY = 'trademarker.selectedSymbol'
const OVERVIEW_COLLAPSED_KEY = 'trademarker.dashboardOverviewCollapsed'
const DECISION_COLLAPSED_KEY = 'trademarker.decisionPanelCollapsed'
const DECISION_WIDTH_KEY = 'trademarker.decisionPanelWidth'
const presetGroupLabelKey = (id) => ({
  'long-core': 'groupLongCore',
  'long-satellite': 'groupLongSatellite',
  swing: 'groupSwing',
  'leveraged-swing': 'groupLeveragedSwing',
})[id]
const getSavedSelectedSymbol = () => {
  try {
    return normalizeSymbol(localStorage.getItem(SELECTED_SYMBOL_KEY) || '')
  } catch {
    return ''
  }
}
const savedBoolean = (key, fallback = false) => {
  try {
    const value = localStorage.getItem(key)
    return value == null ? fallback : value === 'true'
  } catch {
    return fallback
  }
}
const savedNumber = (key, fallback) => {
  try {
    const value = Number(localStorage.getItem(key))
    return Number.isFinite(value) ? value : fallback
  } catch {
    return fallback
  }
}
const eventMatchesSymbol = (event, symbol) => {
  const current = String(symbol || '').toUpperCase()
  const symbols = event.symbol ? [event.symbol] : event.symbols || []
  return symbols.some((item) => matchesSymbol(item, current))
}
const eventPriority = (event) => ({ earnings: 0, 'stock-news': 1, 'market-news': 2, economic: 3 }[event.type] ?? 4)
const clampScore = (value) => Math.max(0, Math.min(100, Math.round(value)))
const orderSideIntent = (order) => {
  const text = [
    order?.side,
    order?.orderSide,
    order?.suggestion,
    order?.plannedOrder,
    order?.reason,
    order?.note,
  ].filter(Boolean).join(' ').toUpperCase()
  if (/(SELL|TRIM|TAKE[ _-]?PROFIT|REDUCE|STOP|卖|减仓|止盈|止损)/.test(text)) return 'SELL'
  if (/(BUY|ADD|ACCUMULATE|ENTRY|买|加仓|建仓|买入)/.test(text)) return 'BUY'
  return 'WATCH'
}
const sideWeight = (order) => orderSideIntent(order) === 'BUY' ? 10 : orderSideIntent(order) === 'SELL' ? -8 : 4
const orderLegSummary = (order, t) => (order.legs || [])
  .map((leg) => {
    const parts = [
      leg.price ? `${t('limit')} ${money(leg.price, order.currency)}` : null,
      leg.shares ? `${number(leg.shares, 4)} ${t('shares')}` : null,
      leg.amount ? `${t('amount')} ${money(leg.amount, order.currency)}` : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : ''
  })
  .filter(Boolean)
  .join('；')
const orderPrimaryText = (order, language, t) => (
  localizedText(order.plannedOrderText, language) ||
  order.plannedOrder ||
  orderLegSummary(order, t) ||
  localizedText(order.suggestionText, language) ||
  order.suggestion ||
  localizedText(order.reasonText, language) ||
  order.reason ||
  order.status ||
  order.side
)

const scoreItem = (item, orders = [], events = []) => {
  const change = Number(item?.quote?.changePercent || 0)
  const positionPL = Number(item?.position?.unrealizedPLPercent || 0)
  const orderBoost = Math.min(20, orders.reduce((sum, order) => sum + Math.max(0, sideWeight(order)), 0))
  const eventBoost = Math.min(15, events.length * 5)
  const trend = clampScore(50 + change * 6)
  const position = clampScore(50 + positionPL * 2)
  const setup = clampScore(45 + orderBoost + eventBoost + Math.max(-12, Math.min(16, change * 3)))
  const risk = clampScore(72 - Math.abs(change) * 4 - Math.max(0, -positionPL))
  const score = clampScore(trend * 0.32 + position * 0.24 + setup * 0.28 + risk * 0.16)
  return { score, trend, position, setup, risk }
}

function SymbolEventsPanel({ events, selected, collapsed, onToggle, onFocusEvent, t }) {
  return <aside className={`symbol-events-panel ${collapsed ? 'collapsed' : ''}`}>
    <div className="symbol-events-head"><span>{t('eventsEyebrow')}</span><strong>{t('currentSymbolEvents')}</strong><button type="button" onClick={onToggle}>{collapsed ? t('expandEvents') : t('collapseEvents')}</button></div>
    {collapsed ? null : <>
    {events.length ? <div className="symbol-events-list">{events.map((event) => (
      <article className="symbol-event-card" key={event.id} onClick={() => onFocusEvent(event)}>
        <time>{formatEventDate(event.date)}</time>
        <div>
          <span className={`event-type ${badgeClass(event.type)}`}>{event.type}</span>{event.impactScore ? <span className="event-impact-score">{event.impactScore}</span> : null}
          <h3>{event.title}</h3>
          <p>{event.site || event.source || selected}</p>
          {event.description && <small>{event.description}</small>}
          {event.url && <a href={event.url} target="_blank" rel="noreferrer">{t('openSource')}</a>}
        </div>
      </article>
    ))}</div> : <div className="symbol-events-empty">{t('noCurrentSymbolEvents')}</div>}</>}
  </aside>
}

function WorkspaceKpiStrip({ items, loading, updated, orders, eventsCalendar, t }) {
  const positioned = items.filter((item) => (item.position?.shares || 0) > 0)
  const marketValue = positioned.reduce((sum, item) => sum + (item.position?.marketValue || 0), 0)
  const unrealizedPL = positioned.reduce((sum, item) => sum + (item.position?.unrealizedPL || 0), 0)
  const gainers = items.filter((item) => Number(item.quote?.changePercent) > 0).length
  const losers = items.filter((item) => Number(item.quote?.changePercent) < 0).length
  const eventCount = (eventsCalendar?.symbolEvents || []).length + (eventsCalendar?.macroEvents || []).length
  return <div className="terminal-kpi-strip">
    <span><small>{t('kpiWatchlist')}</small><strong>{items.length}</strong><em>{t('kpiUpDown', { up: gainers, down: losers })}</em></span>
    <span><small>{t('kpiPositions')}</small><strong>{positioned.length}</strong><em>{money(marketValue)}</em></span>
    <span><small>{t('kpiOpenPL')}</small><strong className={valueClass(unrealizedPL)}>{money(unrealizedPL)}</strong><em>{t('kpiUnrealized')}</em></span>
    <span><small>{t('kpiOrderPlan')}</small><strong>{orders.length}</strong><em>{t('kpiActiveSuggestions')}</em></span>
    <span><small>{t('kpiEvents')}</small><strong>{eventCount}</strong><em>{t('kpiWatchMacro')}</em></span>
    <span><small>{t('kpiData')}</small><strong>{loading ? t('kpiScanning') : t('kpiReady')}</strong><em>{updated ? updated.toLocaleTimeString() : t('kpiNotRefreshed')}</em></span>
  </div>
}

function ScoreRadar({ score, t }) {
  const axes = [
    [t('trend'), score.trend],
    [t('setup'), score.setup],
    [t('positionScore'), score.position],
    [t('riskControl'), score.risk],
  ]
  const points = axes.map(([, value], index) => {
    const angle = (-90 + index * 90) * Math.PI / 180
    const radius = Math.max(8, Math.min(42, value * 0.42))
    return `${60 + Math.cos(angle) * radius},${60 + Math.sin(angle) * radius}`
  }).join(' ')
  return <div className="score-radar">
    <svg viewBox="0 0 120 120" role="img" aria-label="Decision score radar">
      {[18, 30, 42].map((radius) => <polygon className="radar-grid" key={radius} points={`60,${60 - radius} ${60 + radius},60 60,${60 + radius} ${60 - radius},60`} />)}
      <line x1="60" y1="18" x2="60" y2="102" />
      <line x1="18" y1="60" x2="102" y2="60" />
      <polygon points={points} />
    </svg>
    <div className="score-radar-total"><strong>{score.score}</strong><small>{t('score')}/100</small></div>
    <div className="score-radar-factors">{axes.map(([label, value]) => <span key={label}>{label}<b>{value}</b></span>)}</div>
  </div>
}

function DecisionPanel({ selected, score, position, orders, events, activeTab, setActiveTab, onShowOrders, onFocusEvent, onCollapse, onResizeStart, t, language }) {
  const tabs = [
    ['AI', t('decisionAI')],
    ['Technical', t('decisionTechnical')],
    ['Events', t('decisionEvents')],
    ['Orders', t('decisionOrders')],
  ]
  const hasPosition = Number(position?.shares || 0) > 0
  const buyOrders = orders.filter((order) => orderSideIntent(order) === 'BUY')
  const sellOrders = orders.filter((order) => orderSideIntent(order) === 'SELL')
  const watchOrders = orders.filter((order) => orderSideIntent(order) === 'WATCH')
  const [scoreOrderSide, setScoreOrderSide] = useState('')
  useEffect(() => {
    setScoreOrderSide(sellOrders.length ? 'SELL' : buyOrders.length ? 'BUY' : watchOrders.length ? 'WATCH' : '')
  }, [selected, buyOrders.length, sellOrders.length, watchOrders.length])
  const visibleScoreOrders = scoreOrderSide === 'SELL' ? sellOrders : scoreOrderSide === 'BUY' ? buyOrders : scoreOrderSide === 'WATCH' ? watchOrders : []
  return <aside className="decision-panel">
    <button type="button" className="decision-resize-handle" aria-label={t('resizePanel')} onMouseDown={onResizeStart} />
    <div className="decision-tabs">{tabs.map(([key, label]) => <button key={key} className={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)}>{label}</button>)}<button className="collapse-decision" onClick={onCollapse}>−</button></div>
    <div className="decision-score-card">
      <div><span>{t('aiComposite')}</span><strong>{selected || '—'} · {score.score}/100</strong><small>{score.score >= 70 ? t('highConvictionCandidate') : score.score >= 52 ? t('watchForConfirmation') : t('lowerPrioritySetup')}</small></div>
      <ScoreRadar score={score} t={t} />
      {(buyOrders.length || sellOrders.length || watchOrders.length) ? <div className="score-order-actions">
        {sellOrders.length ? <button type="button" className={scoreOrderSide === 'SELL' ? 'active sell' : 'sell'} onClick={() => setScoreOrderSide(scoreOrderSide === 'SELL' ? '' : 'SELL')}>{t('sellOrders')} {sellOrders.length}</button> : null}
        {buyOrders.length ? <button type="button" className={scoreOrderSide === 'BUY' ? 'active buy' : 'buy'} onClick={() => setScoreOrderSide(scoreOrderSide === 'BUY' ? '' : 'BUY')}>{t('buyOrders')} {buyOrders.length}</button> : null}
        {watchOrders.length ? <button type="button" className={scoreOrderSide === 'WATCH' ? 'active watch' : 'watch'} onClick={() => setScoreOrderSide(scoreOrderSide === 'WATCH' ? '' : 'WATCH')}>{t('watchNoAction')} {watchOrders.length}</button> : null}
      </div> : null}
      {visibleScoreOrders.length ? <div className="score-order-detail">
        {visibleScoreOrders.map((order) => {
          const intent = orderSideIntent(order)
          const primary = orderPrimaryText(order, language, t)
          const situation = localizedText(order.currentSituationText, language) || order.currentSituation
          const suggestion = localizedText(order.suggestionText, language) || order.suggestion
          const planned = localizedText(order.plannedOrderText, language) || order.plannedOrder
          return <article className={intent.toLowerCase()} key={order.id}>
          <strong>{primary}</strong>
          {situation && situation !== primary ? <p><b>{t('currentSituation')}</b>{situation}</p> : null}
          {suggestion && suggestion !== primary ? <p><b>{t('suggestion')}</b>{suggestion}</p> : null}
          {planned && planned !== primary ? <p><b>{t('plannedOrder')}</b>{planned}</p> : null}
          {order.legs?.length ? <small>{orderLegSummary(order, t)}</small> : null}
        </article>
        })}
      </div> : null}
      <p className="score-formula-note">{t('scoreFormula')}</p>
    </div>
    {activeTab === 'AI' ? <div className="decision-copy">
      <p>{hasPosition ? t('currentPositionSummary', { shares: number(position.shares, 4), pl: percent(position.unrealizedPLPercent) }) : t('noActivePosition')}</p>
      <p>{orders.length ? t('orderAttachedSummary', { count: orders.length }) : t('noOrderSuggestionAttached')}</p>
      <p>{events.length ? t('eventAttachedSummary', { count: events.length }) : t('noSymbolEventHighlighted')}</p>
    </div> : null}
    {activeTab === 'Technical' ? <div className="factor-bars">
      {[
        [t('trend'), score.trend, t('trendScoreHelp')],
        [t('setup'), score.setup, t('setupScoreHelp')],
        [t('positionScore'), score.position, t('positionScoreHelp')],
        [t('riskControl'), score.risk, t('riskControlHelp')],
      ].map(([label, value, help]) => <span key={label}><b>{label}<em>{value}</em></b><i style={{ width: `${value}%` }} /><small>{help}</small></span>)}
    </div> : null}
    {activeTab === 'Events' ? <div className="decision-list">
      {events.length ? events.map((event) => <button key={event.id} onClick={() => onFocusEvent(event)}><strong>{event.title}</strong><small>{formatEventDate(event.date)} · {event.type}</small></button>) : <p>{t('noSelectedSymbolEvents')}</p>}
    </div> : null}
    {activeTab === 'Orders' ? <div className="decision-list">
      {orders.length ? orders.map((order) => <button key={order.id} onClick={onShowOrders}><strong>{order.side || 'WATCH'} {order.symbol}</strong><small>{order.reason || order.suggestion || order.status}</small></button>) : <p>{t('noSelectedSymbolOrders')}</p>}
    </div> : null}
  </aside>
}

function OpportunityBoard({ rows, selected, onSelect, t }) {
  return <section className="opportunity-board">
    <div className="workspace-panel-head"><div><h2>{t('opportunityBoard')}</h2><p>{t('opportunityBoardHint')}</p></div></div>
    <div className="opportunity-table-wrap">
      <table className="opportunity-table">
        <thead><tr><th>{t('rank')}</th><th>{t('symbol')}</th><th>{t('score')}</th><th>{t('percentChange')}</th><th>{t('pl')}</th><th>{t('orders')}</th><th>{t('kpiEvents')}</th><th>{t('read')}</th></tr></thead>
        <tbody>{rows.slice(0, 18).map((row, index) => <tr key={row.item.symbol} className={selected === row.item.symbol ? 'selected' : ''} onClick={() => onSelect(row.item.symbol)}>
          <td>{index + 1}</td>
          <td><strong>{row.item.symbol}</strong></td>
          <td><b className={row.score.score >= 70 ? 'hot-score' : ''}>{row.score.score}</b></td>
          <td className={valueClass(row.item.quote?.change)}>{percent(row.item.quote?.changePercent)}</td>
          <td className={valueClass(row.item.position?.unrealizedPL)}>{percent(row.item.position?.unrealizedPLPercent)}</td>
          <td>{row.orders.length}</td>
          <td>{row.events.length}</td>
          <td>{row.score.score >= 70 ? t('activelyWatch') : row.orders.length ? t('planAttached') : t('monitor')}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>
}

function RunLogPanel({ logs, t }) {
  const logTypeLabel = (type) => t(`logType${String(type || '').charAt(0).toUpperCase()}${String(type || '').slice(1)}`)
  return <section className="workspace-panel run-log-panel">
    <div className="workspace-panel-head"><div><h2>{t('runLog')}</h2><p>{t('runLogHint')}</p></div></div>
    <div className="run-log-list">{logs.length ? logs.map((log) => <article key={log.id} className={log.type}>
      <span>{logTypeLabel(log.type)}</span><strong>{log.message}</strong><small>{dateTime(log.time)}</small>
    </article>) : <p>{t('noWorkflowActivity')}</p>}</div>
  </section>
}

export default function Dashboard() {
  const { t, language } = useI18n()
  const [searchParams] = useSearchParams()
  const requestedSymbol = searchParams.get('symbol') ? normalizeSymbol(searchParams.get('symbol')) : ''
  const [items, setItems] = useState([])
  const [selected, setSelectedState] = useState(() => requestedSymbol || getSavedSelectedSymbol() || null)
  const [candles, setCandles] = useState([])
  const [historyCache, setHistoryCache] = useState({})
  const [intradayCache, setIntradayCache] = useState({})
  const [sparklineCache, setSparklineCache] = useState({})
  const [trades, setTrades] = useState([])
  const [interval, setInterval] = useState('daily')
  const [indicators, setIndicators] = useChartIndicators()
  const [activeSection, setActiveSection] = useState('chart')
  const [tradeSide, setTradeSide] = useState(null)
  const [editingTrade, setEditingTrade] = useState(null)
  const [orders, setOrders] = useState([])
  const [eventsCalendar, setEventsCalendar] = useState(null)
  const [eventsCollapsed, setEventsCollapsed] = useState(() => savedBoolean(DECISION_COLLAPSED_KEY, false))
  const [decisionWidth, setDecisionWidth] = useState(() => savedNumber(DECISION_WIDTH_KEY, 320))
  const [overviewCollapsed, setOverviewCollapsed] = useState(() => savedBoolean(OVERVIEW_COLLAPSED_KEY, false))
  const [watchlistDrawerOpen, setWatchlistDrawerOpen] = useState(false)
  const [confirmRemoveSymbol, setConfirmRemoveSymbol] = useState('')
  const [watchlistPickerOpen, setWatchlistPickerOpen] = useState(false)
  const [watchlistTargetGroup, setWatchlistTargetGroup] = useState('')
  const [focusedEventDate, setFocusedEventDate] = useState(null)
  const [showOrders, setShowOrders] = useState(false)
  const [analysisTab, setAnalysisTab] = useState('AI')
  const [runLogs, setRunLogs] = useState([])
  const [density, setDensity] = useState(() => localStorage.getItem(DENSITY_KEY) || 'comfortable')
  const [updated, setUpdated] = useState(null)
  const [loading, setLoading] = useState(false)
  const [marketError, setMarketError] = useState('')
  const addRunLog = useCallback((type, message) => {
    setRunLogs((current) => [{ id: `${Date.now()}-${Math.random()}`, type, message, time: new Date().toISOString() }, ...current].slice(0, 8))
  }, [])
  const setSelected = useCallback((symbolOrUpdater) => {
    setSelectedState((current) => {
      const symbol = typeof symbolOrUpdater === 'function' ? symbolOrUpdater(current) : symbolOrUpdater
      try {
        if (symbol) localStorage.setItem(SELECTED_SYMBOL_KEY, symbol)
        else localStorage.removeItem(SELECTED_SYMBOL_KEY)
      } catch {}
      return symbol
    })
  }, [])

  const refresh = useCallback(async (symbols = getWatchlist(), replace = true, saveAnalysis = true) => {
    setLoading(true)
    addRunLog('scan', t('logRefreshingMarketData', { scope: replace ? t('logWatchlistScope') : symbols.join(', ') }))
    const rows = await Promise.all(symbols.map(async (ticker) => {
      try {
        const snapshot = await getMarketSnapshot(ticker, { force: true })
        return { symbol: ticker, quote: snapshot.quote, candles: snapshot.candles, position: calculatePosition(getTrades(ticker), snapshot.quote.price) }
      } catch (error) {
        return { symbol: ticker, quote: null, position: calculatePosition(getTrades(ticker), 0), error: error.message }
      }
    }))
    setItems((current) => replace ? rows : [
      ...current.filter((item) => !symbols.includes(item.symbol)),
      ...rows,
    ])
    setHistoryCache((current) => ({
      ...current,
      ...Object.fromEntries(rows.filter((row) => row.candles).map((row) => [row.symbol, row.candles])),
    }))
    setMarketError(rows.find((row) => row.error)?.error || '')
    setSelected((current) => current && getWatchlist().includes(current) ? current : getWatchlist()[0] || null)
    setUpdated(new Date())
    setLoading(false)
    if (saveAnalysis && replace) saveMarketAnalysisToGitHub(buildMarketAnalysisExport(rows))
      .then(() => addRunLog('saved', t('logUploadedMarketAnalysis', { count: rows.length })))
      .catch((error) => addRunLog('error', t('logMarketAnalysisFailed', { message: error.message })))
    buildEventsCalendarExport(getWatchlist())
      .then((events) => {
        setEventsCalendar(events)
        addRunLog('events', t('logBuiltEvents', { count: (events.symbolEvents || []).length + (events.macroEvents || []).length }))
        return saveAnalysis ? saveEventsCalendarToGitHub(events) : null
      })
      .then((result) => { if (result) addRunLog('saved', t('logUploadedEvents')) })
      .catch((error) => addRunLog('error', t('logEventsFailed', { message: error.message })))
  }, [addRunLog, t])

  useEffect(() => {
    migrateCdrSymbolsToTorontoOnce()
    applyPresetWatchlistGroupsOnce()
    const savedSymbol = getSavedSelectedSymbol()
    const symbols = [...new Set([...getWatchlist(), requestedSymbol, savedSymbol].filter(Boolean))]
    refresh(symbols).then(() => {
      if (requestedSymbol) setSelected(requestedSymbol)
    })
  }, [refresh, requestedSymbol, setSelected])
  useEffect(() => {
    const syncImportedData = () => {
      const savedSymbol = getSavedSelectedSymbol()
      const symbols = [...new Set([...getWatchlist(), requestedSymbol, savedSymbol].filter(Boolean))]
      refresh(symbols, true, false)
      if (selected) setTrades(getTrades(selected))
    }
    window.addEventListener('trademarker:data-imported', syncImportedData)
    return () => window.removeEventListener('trademarker:data-imported', syncImportedData)
  }, [refresh, requestedSymbol, selected])
  useEffect(() => { localStorage.setItem(DENSITY_KEY, density) }, [density])
  useEffect(() => { localStorage.setItem(OVERVIEW_COLLAPSED_KEY, String(overviewCollapsed)) }, [overviewCollapsed])
  useEffect(() => { localStorage.setItem(DECISION_COLLAPSED_KEY, String(eventsCollapsed)) }, [eventsCollapsed])
  useEffect(() => { localStorage.setItem(DECISION_WIDTH_KEY, String(decisionWidth)) }, [decisionWidth])
  useEffect(() => {
    loadOrderPlanFromGitHub('order-plan.json')
      .then((result) => {
        if (result.status !== 'loaded') {
          addRunLog('orders', t('logNoOrderPlan'))
          return setOrders([])
        }
        const normalized = normalizeOrderPlan(result.data).orders
        setOrders(normalized)
        addRunLog('orders', t('logLoadedOrderPlan', { count: normalized.length }))
      })
      .catch((error) => { addRunLog('error', t('logOrderPlanFailed', { message: error.message })); setOrders([]) })
  }, [addRunLog, t])
  useEffect(() => {
    if (!selected) { setCandles([]); setTrades([]); return }
    setCandles(historyCache[selected] || [])
    setTrades(getTrades(selected))
  }, [selected, historyCache])
  useEffect(() => {
    if (interval !== '1m' || !selected || intradayCache[selected]) return
    getIntradayCandles(selected)
      .then((rows) => setIntradayCache((current) => ({ ...current, [selected]: rows })))
      .catch(() => setIntradayCache((current) => ({ ...current, [selected]: [] })))
  }, [interval, selected, intradayCache])
  useEffect(() => {
    const missing = items
      .map((item) => item.symbol)
      .filter((symbol) => !Object.prototype.hasOwnProperty.call(sparklineCache, symbol))
      .slice(0, 24)
    if (!missing.length) return undefined
    let canceled = false
    const load = async () => {
      for (const symbol of missing) {
        try {
          const rows = await getIntradayCandles(symbol)
          if (!canceled) setSparklineCache((current) => ({ ...current, [symbol]: rows }))
        } catch {
          if (!canceled) setSparklineCache((current) => ({ ...current, [symbol]: [] }))
        }
        await new Promise((resolve) => setTimeout(resolve, 80))
      }
    }
    load()
    return () => { canceled = true }
  }, [items, sparklineCache])

  const selectedItem = items.find((item) => item.symbol === selected)
  const selectedInWatchlist = selected ? getWatchlist().includes(selected) : false
  const watchlistGroups = useMemo(() => getWatchlistGroups(), [items, watchlistPickerOpen])
  const groupLabel = (group) => {
    const key = presetGroupLabelKey(group.id)
    return key ? t(key) : group.name
  }
  const selectedOrders = useMemo(() => orders.filter((order) => matchesSymbol(order.symbol, selected)), [orders, selected])
  const selectedEvents = useMemo(() => (eventsCalendar?.symbolEvents || [])
    .filter((event) => eventMatchesSymbol(event, selected))
    .sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0) || eventPriority(a) - eventPriority(b) || new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 8), [eventsCalendar, selected])
  const selectedEventDates = useMemo(() => selectedEvents.map((event) => event.date).filter(Boolean), [selectedEvents])
  const orderSymbols = useMemo(() => [...new Set(orders.map((order) => order.symbol).filter(Boolean))], [orders])
  const selectedScore = useMemo(() => scoreItem(selectedItem, selectedOrders, selectedEvents), [selectedItem, selectedOrders, selectedEvents])
  const opportunityRows = useMemo(() => items.map((item) => {
    const itemOrders = orders.filter((order) => matchesSymbol(order.symbol, item.symbol))
    const itemEvents = (eventsCalendar?.symbolEvents || []).filter((event) => eventMatchesSymbol(event, item.symbol))
    return { item, orders: itemOrders, events: itemEvents, score: scoreItem(item, itemOrders, itemEvents) }
  }).sort((a, b) => b.score.score - a.score.score), [items, orders, eventsCalendar])
  const plannedWatchlistCount = useMemo(() => items.filter((item) => orderSymbols.some((symbol) => matchesSymbol(symbol, item.symbol))).length, [items, orderSymbols])
  const workflowItems = useMemo(() => {
    const placedOrders = getOrderCommitments().filter((order) => (order.lifecycleStatus || 'PLACED') === 'PLACED')
    const cashByCurrency = Object.fromEntries(getCashBalances().map((balance) => [balance.currency, balance.amount]))
    const reserved = calculateReservedCashByCurrency(placedOrders)
    const lowCashCurrencies = Object.entries(reserved).filter(([currency, amount]) => amount > (cashByCurrency[currency] || 0)).map(([currency]) => currency)
    const movers = items.filter((item) => Math.abs(Number(item.quote?.changePercent || 0)) >= 5).slice(0, 5)
    const highImpactEvents = (eventsCalendar?.events || []).filter((event) => Number(event.impactScore || 0) >= 60).slice(0, 5)
    return [
      { key: 'orders', label: t('workflowOrders'), value: placedOrders.length, tone: placedOrders.length ? 'info' : 'muted' },
      { key: 'cash', label: t('workflowCash'), value: lowCashCurrencies.length ? lowCashCurrencies.join(', ') : t('workflowCashOk'), tone: lowCashCurrencies.length ? 'warning' : 'ok' },
      { key: 'movers', label: t('workflowMovers'), value: movers.length, tone: movers.length ? 'warning' : 'muted' },
      { key: 'events', label: t('workflowEvents'), value: highImpactEvents.length, tone: highImpactEvents.length ? 'info' : 'muted' },
    ]
  }, [eventsCalendar, items, t])
  const hasIntradayLoaded = selected ? Object.prototype.hasOwnProperty.call(intradayCache, selected) : false
  const chartCandles = interval === '1m' ? intradayCache[selected] || [] : candles
  const position = selectedItem?.quote ? calculatePosition(trades, selectedItem.quote.price) : null
  const realizedPL = useMemo(() => {
    const realizedByTrade = calculateRealizedPLByTrade(trades)
    return [...realizedByTrade.values()].reduce((sum, value) => sum + value, 0)
  }, [trades])
  const totalPL = (position?.unrealizedPL || 0) + realizedPL
  const selectedOrderFocus = selectedOrders.length
    ? `${selected} · ${t('currentSymbolOrders', { count: selectedOrders.length })}${position?.shares ? ` · ${number(position.shares, 4)} ${t('shares').toLowerCase()}` : ''}`
    : t('orderFocusHint')
  const reloadJournal = () => {
    const nextTrades = getTrades(selected)
    setTrades(nextTrades)
    setItems((current) => current.map((item) => item.symbol === selected && item.quote
      ? { ...item, position: calculatePosition(nextTrades, item.quote.price) }
      : item))
  }
  const openSelectedSymbol = async (ticker) => {
    const clean = normalizeSymbol(ticker)
    if (!clean) return
    await refresh([clean], false)
    setSelected(clean)
  }
  const toggleSelectedWatchlist = async () => {
    if (!selected) return
    if (selectedInWatchlist) {
      removeSymbol(selected)
      setItems((current) => [...current])
      return
    }
    const groups = getWatchlistGroups()
    setWatchlistTargetGroup(groups[0]?.id || 'default')
    setWatchlistPickerOpen(true)
  }
  const addSelectedToWatchlistGroup = async () => {
    if (!selected) return
    addSymbolToGroup(selected, watchlistTargetGroup || getWatchlistGroups()[0]?.id)
    setWatchlistPickerOpen(false)
    if (selectedItem) setItems((current) => [...current])
    else await refresh([selected], false)
    setSelected(selected)
  }
  const remove = async (ticker) => {
    setConfirmRemoveSymbol(ticker)
  }
  const confirmRemove = () => {
    const ticker = confirmRemoveSymbol
    if (!ticker) return
    const next = removeSymbol(ticker)
    setItems((current) => current.filter((item) => item.symbol !== ticker))
    setSelected((current) => current === ticker ? next[0] || null : current)
    setConfirmRemoveSymbol('')
  }
  const selectFromWatchlist = (symbol) => {
    setSelected(symbol)
    setWatchlistDrawerOpen(false)
  }
  const startDecisionResize = (event) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = decisionWidth
    const move = (moveEvent) => {
      const nextWidth = Math.max(280, Math.min(460, startWidth - (moveEvent.clientX - startX)))
      setDecisionWidth(nextWidth)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <section className={`market-workspace ${density === 'compact' ? 'compact-density' : ''} ${watchlistDrawerOpen ? 'watchlist-drawer-open' : ''}`} style={{ '--decision-panel-width': `${decisionWidth}px` }}>
      <div className="workspace-toolbar">
        <button type="button" className="toolbar-button mobile-watchlist-toggle" onClick={() => setWatchlistDrawerOpen(true)}>{t('openWatchlist')}</button>
        <SymbolSearch onSelect={openSelectedSymbol} />
        <div className="workspace-status">
          <span className="market-status-pill"><i className={`status-dot ${loading ? 'loading-dot' : marketError ? 'error-dot' : ''}`} />{updated ? <><strong>{getMarketDataProviderName()}</strong><em>{t('refreshed')} {updated.toLocaleTimeString()}</em></> : t('loadingReferenceData')}</span>
          <button className="toolbar-button density-toggle" title={t('density')} onClick={() => setDensity((current) => current === 'compact' ? 'comfortable' : 'compact')}>{density === 'compact' ? t('compact') : t('comfortable')}</button>
          <button className="toolbar-button refresh-button" onClick={() => refresh()} disabled={loading}>↻ {t('refresh')}</button>
        </div>
      </div>
      <div className={`dashboard-overview ${overviewCollapsed ? 'collapsed' : ''}`}>
        <button type="button" className="overview-toggle" onClick={() => setOverviewCollapsed((current) => !current)}>{overviewCollapsed ? t('showOverview') : t('hideOverview')}</button>
        {!overviewCollapsed ? <>
          <WorkspaceKpiStrip items={items} loading={loading} updated={updated} orders={orders} eventsCalendar={eventsCalendar} t={t} />
          {orders.length ? <div className="today-focus-strip">
            <span>{t('todayFocus')}</span>
            <strong>{t('stocksWithOrders', { count: plannedWatchlistCount || orderSymbols.length })}</strong>
            <em>{selectedOrderFocus}</em>
            {selectedOrders.length ? <button onClick={() => setShowOrders(true)}>{t('orderSuggestions')}</button> : null}
          </div> : null}
          <div className="workflow-strip">{workflowItems.map((item) => <span className={item.tone} key={item.key}>{item.label}<strong>{item.value}</strong></span>)}</div>
        </> : <div className="overview-collapsed-line">
          <strong>{loading ? t('kpiScanning') : t('kpiReady')}</strong>
          <span>{t('stocksWithOrders', { count: plannedWatchlistCount || orderSymbols.length })}</span>
          <em>{selectedOrderFocus}</em>
        </div>}
      </div>

      <div className="workspace-body">
        <button type="button" className="watchlist-drawer-backdrop" onClick={() => setWatchlistDrawerOpen(false)} aria-label={t('closeWatchlist')} />
        <WatchlistSidebar items={items} selected={selected} onSelect={selectFromWatchlist} onRemove={remove} orderSymbols={orderSymbols} orderPlans={orders} sparklines={{ ...sparklineCache, ...intradayCache }} />
        <div className="market-main">
          {!selectedItem ? (
            <div className="workspace-empty">
              <div className="empty-icon">+</div>
              <h1>{t('emptyWatchlistTitle')}</h1>
              <p>{t('emptyWatchlistText')}</p>
              <div className="examples">{['TSLL', 'RDW', 'QMCO', 'AAPL'].map((example) => <button className="secondary" key={example} onClick={() => openSelectedSymbol(example)}>{example}</button>)}</div>
            </div>
          ) : !selectedItem.quote ? (
            <div className="workspace-empty market-error-state">
              <div className="empty-icon">!</div>
              <h1>{t('realMarketDataUnavailable')}</h1>
              <p>{marketError || selectedItem.error}</p>
              {!hasMarketDataApiKey() && <Link className="settings-link" to="/settings">{t('configureMarketDataApiKey')}</Link>}
              <button className="secondary" onClick={() => refresh()}>{t('retryMarketData')}</button>
            </div>
          ) : (
            <>
              <header className="quote-header">
                <div className="quote-identity">
                  <span className="symbol-avatar">{selected.slice(0, 2)}</span>
                  <div><h1>{selected}</h1><small>{selectedItem.quote.exchange} · {selectedItem.quote.source} · {t('referenceData')}</small></div>
                </div>
                <div className="quote-price">
                  <strong className={valueClass(selectedItem.quote.change)}>{money(selectedItem.quote.price, selectedItem.quote.currency)}</strong>
                  <span className={valueClass(selectedItem.quote.change)}>{selectedItem.quote.change >= 0 ? '+' : ''}{money(selectedItem.quote.change, selectedItem.quote.currency)} &nbsp; {percent(selectedItem.quote.changePercent)}</span>
                  <div className="quote-position-metrics">
                    <span>{t('shares')} <strong>{number(position.shares, 4)}</strong></span>
                    <span>{t('averageCost')} <strong>{money(position.averageCost, selectedItem.quote.currency)}</strong></span>
                    <span>{t('pl')} <strong className={valueClass(position.unrealizedPL)}>{money(position.unrealizedPL, selectedItem.quote.currency)} · {percent(position.unrealizedPLPercent)}</strong></span>
                    <span>{t('soldPL')} <strong className={valueClass(realizedPL)}>{money(realizedPL, selectedItem.quote.currency)}</strong></span>
                    <span>{t('totalPL')} <strong className={valueClass(totalPL)}>{money(totalPL, selectedItem.quote.currency)}</strong></span>
                  </div>
                </div>
                <div className="action-group">
                  <button
                    type="button"
                    className={`watchlist-heart ${selectedInWatchlist ? 'active' : ''}`}
                    aria-pressed={selectedInWatchlist}
                    title={selectedInWatchlist ? t('removeFromWatchlist') : t('addToWatchlist')}
                    onClick={toggleSelectedWatchlist}
                  >
                    {selectedInWatchlist ? '♥' : '♡'}
                  </button>
                  {selectedOrders.length ? <button className="secondary order-suggestion-button" onClick={() => setShowOrders(true)}>{t('orderSuggestions')} ({selectedOrders.length})</button> : null}
                  <button className="buy-button" onClick={() => setTradeSide('BUY')}>B&nbsp; {t('recordBuy')}</button>
                  <button className="sell-button" onClick={() => setTradeSide('SELL')}>S&nbsp; {t('recordSell')}</button>
                </div>
              </header>

              <div className="market-tabs">
                <button className={activeSection === 'chart' ? 'active' : ''} onClick={() => { setActiveSection('chart'); document.querySelector('.chart-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{t('chart')}</button>
                <button className={activeSection === 'position' ? 'active' : ''} onClick={() => { setActiveSection('position'); document.querySelector('.position-ribbon')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>{t('position')}</button>
                <button className={activeSection === 'journal' ? 'active' : ''} onClick={() => { setActiveSection('journal'); document.querySelector('.workspace-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{t('journal')}</button>
                <span>{t('journalOnlyWorkspace')}</span>
              </div>

              <div className="market-chart-layout decision-layout">
                <div className="chart-column">
                  <div className="chart-toolbar">
                    <div className="chart-label"><strong>{interval === '1m' ? t('intradayChart') : selectedItem.quote.closeOnly && interval === 'daily' ? t('dailyCloseChart') : t('kLineChart')}</strong><span>{interval === '1m' ? t('intradayHint') : t('markerHint')}</span></div>
                    <div className="chart-controls">
                      <IndicatorMenu value={indicators} onChange={setIndicators} />
                      <IntervalSelector value={interval} onChange={setInterval} />
                    </div>
                  </div>
                  {interval === '1m' && !hasIntradayLoaded ? <div className="workspace-empty"><h1>{t('loadingIntradayData')}</h1><p>{t('fetchingIntraday', { symbol: selected })}</p></div> : interval === '1m' && !chartCandles.length ? <div className="workspace-empty"><h1>{t('noIntradayData')}</h1><p>{t('noIntradayText')}</p></div> : <StockChart candles={chartCandles} interval={interval} trades={trades} averageCost={position.averageCost} closeOnly={selectedItem.quote.closeOnly} currency={selectedItem.quote.currency} quoteChange={selectedItem.quote.change} quotePrice={selectedItem.quote.price} indicators={indicators} orderPlans={selectedOrders} eventDates={selectedEventDates} focusDate={focusedEventDate} />}
                </div>
                {eventsCollapsed ? <SymbolEventsPanel events={selectedEvents} selected={selected} collapsed={eventsCollapsed} onToggle={() => setEventsCollapsed(false)} onFocusEvent={(event) => setFocusedEventDate(event.date || null)} t={t} /> : <DecisionPanel selected={selected} score={selectedScore} position={position} orders={selectedOrders} events={selectedEvents} activeTab={analysisTab} setActiveTab={setAnalysisTab} onShowOrders={() => selectedOrders.length && setShowOrders(true)} onFocusEvent={(event) => setFocusedEventDate(event.date || null)} onCollapse={() => setEventsCollapsed(true)} onResizeStart={startDecisionResize} t={t} language={language} />}
              </div>

              <div className="position-ribbon">
                <span>{t('shares')}<strong>{number(position.shares, 4)}</strong></span>
                <span>{t('averageCost')}<strong>{money(position.averageCost, selectedItem.quote.currency)}</strong></span>
                <span>{t('marketValue')}<strong>{money(position.marketValue, selectedItem.quote.currency)}</strong></span>
                <span>{t('unrealizedPL')}<strong className={valueClass(position.unrealizedPL)}>{money(position.unrealizedPL, selectedItem.quote.currency)} &nbsp; {percent(position.unrealizedPLPercent)}</strong></span>
              </div>

              <OpportunityBoard rows={opportunityRows} selected={selected} onSelect={setSelected} t={t} />
              <div className="decision-lower-grid">
                <div className="workspace-panel"><div className="workspace-panel-head"><div><h2>{t('tradeJournal')}</h2><p>{t('tradeJournalHint')}</p></div></div><TradeLog trades={trades} currency={selectedItem.quote.currency} onEdit={setEditingTrade} onDelete={(id) => { deleteTrade(id); reloadJournal(); addRunLog('journal', t('logDeletedTrade')) }} /></div>
                <RunLogPanel logs={runLogs} t={t} />
              </div>
            </>
          )}
        </div>
      </div>
      {tradeSide && <TradeModal side={tradeSide} symbol={selected} defaultPrice={selectedItem.quote.price} currency={selectedItem.quote.currency} candles={candles} onClose={() => setTradeSide(null)} onSave={async (trade) => { saveTrade(trade); setTradeSide(null); reloadJournal(); await refresh([selected], false) }} />}
      {editingTrade && <TradeModal side={editingTrade.side} symbol={editingTrade.symbol} defaultPrice={editingTrade.price} currency={selectedItem.quote.currency} candles={candles} initialTrade={editingTrade} onClose={() => setEditingTrade(null)} onSave={async (trade) => { updateTrade(trade); setEditingTrade(null); reloadJournal(); await refresh([selected], false) }} />}
      {selectedItem?.quote ? <div className="mobile-action-bar">
        <button className="buy-button" onClick={() => setTradeSide('BUY')}>B {t('recordBuy')}</button>
        <button className="sell-button" onClick={() => setTradeSide('SELL')}>S {t('recordSell')}</button>
        <button className="secondary" onClick={() => selectedOrders.length && setShowOrders(true)} disabled={!selectedOrders.length}>{t('orderSuggestions')} {selectedOrders.length || ''}</button>
      </div> : null}
      {watchlistPickerOpen && <div className="modal-backdrop" onMouseDown={() => setWatchlistPickerOpen(false)}>
        <div className="modal add-watchlist-modal" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-head"><h2>{t('chooseWatchlistGroup')}</h2><button type="button" className="icon-button" onClick={() => setWatchlistPickerOpen(false)}>×</button></div>
          <div className="modal-body add-watchlist-body">
            <p>{t('chooseWatchlistGroupHint', { symbol: selected })}</p>
            <label>{t('watchlistGroup')}
              <select value={watchlistTargetGroup || watchlistGroups[0]?.id || ''} onChange={(event) => setWatchlistTargetGroup(event.target.value)}>
                {watchlistGroups.map((group) => <option key={group.id} value={group.id}>{groupLabel(group)}</option>)}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setWatchlistPickerOpen(false)}>{t('cancel')}</button>
              <button type="button" onClick={addSelectedToWatchlistGroup}>{t('addToSelectedGroup')}</button>
            </div>
          </div>
        </div>
      </div>}
      {showOrders && <div className="modal-backdrop" onMouseDown={() => setShowOrders(false)}>
        <div className="modal order-plan-modal" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-head"><h2>{t('orderSuggestionsFor', { symbol: selected })}</h2><button type="button" className="icon-button" onClick={() => setShowOrders(false)}>×</button></div>
          <div className="modal-body order-plan-list">{selectedOrders.map((order) => <OrderPlanCard order={order} key={order.id} />)}</div>
        </div>
      </div>}
      {confirmRemoveSymbol ? <ConfirmDialog
        title={t('removeWatchlistTitle')}
        message={t('removeWatchlistConfirm', { symbol: confirmRemoveSymbol })}
        confirmLabel={t('remove')}
        cancelLabel={t('cancel')}
        danger
        onCancel={() => setConfirmRemoveSymbol('')}
        onConfirm={confirmRemove}
      /> : null}
    </section>
  )
}
