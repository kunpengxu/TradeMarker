import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import IndicatorMenu from '../components/IndicatorMenu'
import IntervalSelector from '../components/IntervalSelector'
import OrderPlanCard from '../components/OrderPlanCard'
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
import { calculatePosition } from '../services/positionCalculator'
import { addSymbol, applyPresetWatchlistGroupsOnce, deleteTrade, getTrades, getWatchlist, migrateCdrSymbolsToTorontoOnce, normalizeSymbol, removeSymbol, saveTrade, updateTrade } from '../services/storage'
import { money, number, percent, valueClass } from '../utils/formatters'
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
const getSavedSelectedSymbol = () => {
  try {
    return normalizeSymbol(localStorage.getItem(SELECTED_SYMBOL_KEY) || '')
  } catch {
    return ''
  }
}
const eventMatchesSymbol = (event, symbol) => {
  const current = String(symbol || '').toUpperCase()
  const symbols = event.symbol ? [event.symbol] : event.symbols || []
  return symbols.some((item) => matchesSymbol(item, current))
}
const eventPriority = (event) => ({ earnings: 0, 'stock-news': 1, 'market-news': 2, economic: 3 }[event.type] ?? 4)

function SymbolEventsPanel({ events, selected, collapsed, onToggle, onFocusEvent, t }) {
  return <aside className={`symbol-events-panel ${collapsed ? 'collapsed' : ''}`}>
    <div className="symbol-events-head"><span>{t('eventsEyebrow')}</span><strong>{t('currentSymbolEvents')}</strong><button type="button" onClick={onToggle}>{collapsed ? t('expandEvents') : t('collapseEvents')}</button></div>
    {collapsed ? null : <>
    {events.length ? <div className="symbol-events-list">{events.map((event) => (
      <article className="symbol-event-card" key={event.id} onClick={() => onFocusEvent(event)}>
        <time>{formatEventDate(event.date)}</time>
        <div>
          <span className={`event-type ${badgeClass(event.type)}`}>{event.type}</span>
          <h3>{event.title}</h3>
          <p>{event.site || event.source || selected}</p>
          {event.description && <small>{event.description}</small>}
          {event.url && <a href={event.url} target="_blank" rel="noreferrer">{t('openSource')}</a>}
        </div>
      </article>
    ))}</div> : <div className="symbol-events-empty">{t('noCurrentSymbolEvents')}</div>}</>}
  </aside>
}

export default function Dashboard() {
  const { t } = useI18n()
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
  const [eventsCollapsed, setEventsCollapsed] = useState(false)
  const [focusedEventDate, setFocusedEventDate] = useState(null)
  const [showOrders, setShowOrders] = useState(false)
  const [density, setDensity] = useState(() => localStorage.getItem(DENSITY_KEY) || 'comfortable')
  const [updated, setUpdated] = useState(null)
  const [loading, setLoading] = useState(false)
  const [marketError, setMarketError] = useState('')
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

  const refresh = useCallback(async (symbols = getWatchlist(), replace = true) => {
    setLoading(true)
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
    saveMarketAnalysisToGitHub(buildMarketAnalysisExport(rows)).catch(() => {})
    buildEventsCalendarExport(getWatchlist())
      .then((events) => {
        setEventsCalendar(events)
        return saveEventsCalendarToGitHub(events)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    migrateCdrSymbolsToTorontoOnce()
    applyPresetWatchlistGroupsOnce()
    const savedSymbol = getSavedSelectedSymbol()
    const symbols = [...new Set([...getWatchlist(), requestedSymbol, savedSymbol].filter(Boolean))]
    refresh(symbols).then(() => {
      if (requestedSymbol) setSelected(requestedSymbol)
    })
  }, [refresh, requestedSymbol, setSelected])
  useEffect(() => { localStorage.setItem(DENSITY_KEY, density) }, [density])
  useEffect(() => {
    loadOrderPlanFromGitHub('order-plan.json')
      .then((result) => {
        if (result.status !== 'loaded') return setOrders([])
        setOrders(normalizeOrderPlan(result.data).orders)
      })
      .catch(() => setOrders([]))
  }, [])
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
  const selectedOrders = useMemo(() => orders.filter((order) => matchesSymbol(order.symbol, selected)), [orders, selected])
  const selectedEvents = useMemo(() => (eventsCalendar?.symbolEvents || [])
    .filter((event) => eventMatchesSymbol(event, selected))
    .sort((a, b) => eventPriority(a) - eventPriority(b) || new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 8), [eventsCalendar, selected])
  const selectedEventDates = useMemo(() => selectedEvents.map((event) => event.date).filter(Boolean), [selectedEvents])
  const orderSymbols = useMemo(() => [...new Set(orders.map((order) => order.symbol).filter(Boolean))], [orders])
  const plannedWatchlistCount = useMemo(() => items.filter((item) => orderSymbols.some((symbol) => matchesSymbol(symbol, item.symbol))).length, [items, orderSymbols])
  const hasIntradayLoaded = selected ? Object.prototype.hasOwnProperty.call(intradayCache, selected) : false
  const chartCandles = interval === '1m' ? intradayCache[selected] || [] : candles
  const position = selectedItem?.quote ? calculatePosition(trades, selectedItem.quote.price) : null
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
    addSymbol(selected)
    if (selectedItem) setItems((current) => [...current])
    else await refresh([selected], false)
    setSelected(selected)
  }
  const remove = async (ticker) => {
    if (confirm(t('removeWatchlistConfirm', { symbol: ticker }))) {
      const next = removeSymbol(ticker)
      setItems((current) => current.filter((item) => item.symbol !== ticker))
      setSelected((current) => current === ticker ? next[0] || null : current)
    }
  }

  return (
    <section className={`market-workspace ${density === 'compact' ? 'compact-density' : ''}`}>
      <div className="workspace-toolbar">
        <SymbolSearch onSelect={openSelectedSymbol} />
        <div className="workspace-status">
          <span className="market-status-pill"><i className={`status-dot ${loading ? 'loading-dot' : marketError ? 'error-dot' : ''}`} />{updated ? <><strong>{getMarketDataProviderName()}</strong><em>{t('refreshed')} {updated.toLocaleTimeString()}</em></> : t('loadingReferenceData')}</span>
          <button className="toolbar-button density-toggle" title={t('density')} onClick={() => setDensity((current) => current === 'compact' ? 'comfortable' : 'compact')}>{density === 'compact' ? t('compact') : t('comfortable')}</button>
          <button className="toolbar-button refresh-button" onClick={() => refresh()} disabled={loading}>↻ {t('refresh')}</button>
        </div>
      </div>
      {orders.length ? <div className="today-focus-strip">
        <span>{t('todayFocus')}</span>
        <strong>{t('stocksWithOrders', { count: plannedWatchlistCount || orderSymbols.length })}</strong>
        <em>{selectedOrderFocus}</em>
        {selectedOrders.length ? <button onClick={() => setShowOrders(true)}>{t('orderSuggestions')}</button> : null}
      </div> : null}

      <div className="workspace-body">
        <WatchlistSidebar items={items} selected={selected} onSelect={setSelected} onRemove={remove} orderSymbols={orderSymbols} orderPlans={orders} sparklines={{ ...sparklineCache, ...intradayCache }} />
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

              <div className="market-chart-layout">
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
                <SymbolEventsPanel events={selectedEvents} selected={selected} collapsed={eventsCollapsed} onToggle={() => setEventsCollapsed((value) => !value)} onFocusEvent={(event) => setFocusedEventDate(event.date || null)} t={t} />
              </div>

              <div className="position-ribbon">
                <span>{t('shares')}<strong>{number(position.shares, 4)}</strong></span>
                <span>{t('averageCost')}<strong>{money(position.averageCost, selectedItem.quote.currency)}</strong></span>
                <span>{t('marketValue')}<strong>{money(position.marketValue, selectedItem.quote.currency)}</strong></span>
                <span>{t('unrealizedPL')}<strong className={valueClass(position.unrealizedPL)}>{money(position.unrealizedPL, selectedItem.quote.currency)} &nbsp; {percent(position.unrealizedPLPercent)}</strong></span>
              </div>

              <div className="workspace-panel"><div className="workspace-panel-head"><div><h2>{t('tradeJournal')}</h2><p>{t('tradeJournalHint')}</p></div></div><TradeLog trades={trades} currency={selectedItem.quote.currency} onEdit={setEditingTrade} onDelete={(id) => { deleteTrade(id); reloadJournal() }} /></div>
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
      {showOrders && <div className="modal-backdrop" onMouseDown={() => setShowOrders(false)}>
        <div className="modal order-plan-modal" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-head"><h2>{t('orderSuggestionsFor', { symbol: selected })}</h2><button type="button" className="icon-button" onClick={() => setShowOrders(false)}>×</button></div>
          <div className="modal-body order-plan-list">{selectedOrders.map((order) => <OrderPlanCard order={order} key={order.id} />)}</div>
        </div>
      </div>}
    </section>
  )
}
