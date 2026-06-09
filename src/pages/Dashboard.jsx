import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { addSymbol, deleteTrade, getTrades, getWatchlist, removeSymbol, saveTrade, updateTrade } from '../services/storage'
import { money, number, percent, valueClass } from '../utils/formatters'
import { useI18n } from '../i18n'

const cleanSymbol = (value) => String(value || '').toUpperCase().replace(/(:CA|:US)$/i, '').replace(/\.(NE|TO|V)$/i, '')
const matchesSymbol = (orderSymbol, symbol) => {
  const order = String(orderSymbol || '').toUpperCase()
  const current = String(symbol || '').toUpperCase()
  return order === current || cleanSymbol(order) === cleanSymbol(current)
}

export default function Dashboard() {
  const { t } = useI18n()
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [candles, setCandles] = useState([])
  const [historyCache, setHistoryCache] = useState({})
  const [intradayCache, setIntradayCache] = useState({})
  const [trades, setTrades] = useState([])
  const [interval, setInterval] = useState('daily')
  const [activeSection, setActiveSection] = useState('chart')
  const [tradeSide, setTradeSide] = useState(null)
  const [editingTrade, setEditingTrade] = useState(null)
  const [orders, setOrders] = useState([])
  const [showOrders, setShowOrders] = useState(false)
  const [updated, setUpdated] = useState(null)
  const [loading, setLoading] = useState(false)
  const [marketError, setMarketError] = useState('')

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
      .then(saveEventsCalendarToGitHub)
      .catch(() => {})
  }, [])

  useEffect(() => { refresh() }, [refresh])
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

  const selectedItem = items.find((item) => item.symbol === selected)
  const selectedOrders = useMemo(() => orders.filter((order) => matchesSymbol(order.symbol, selected)), [orders, selected])
  const orderSymbols = useMemo(() => [...new Set(orders.map((order) => order.symbol).filter(Boolean))], [orders])
  const hasIntradayLoaded = selected ? Object.prototype.hasOwnProperty.call(intradayCache, selected) : false
  const chartCandles = interval === '1m' ? intradayCache[selected] || [] : candles
  const position = selectedItem?.quote ? calculatePosition(trades, selectedItem.quote.price) : null
  const reloadJournal = () => {
    const nextTrades = getTrades(selected)
    setTrades(nextTrades)
    setItems((current) => current.map((item) => item.symbol === selected && item.quote
      ? { ...item, position: calculatePosition(nextTrades, item.quote.price) }
      : item))
  }
  const addSelectedSymbol = async (ticker) => {
    addSymbol(ticker)
    await refresh([ticker], false)
    setSelected(ticker)
  }
  const remove = async (ticker) => {
    if (confirm(t('removeWatchlistConfirm', { symbol: ticker }))) {
      const next = removeSymbol(ticker)
      setItems((current) => current.filter((item) => item.symbol !== ticker))
      setSelected((current) => current === ticker ? next[0] || null : current)
    }
  }

  return (
    <section className="market-workspace">
      <div className="workspace-toolbar">
        <SymbolSearch onSelect={addSelectedSymbol} />
        <div className="workspace-status">
          <span className={`status-dot ${loading ? 'loading-dot' : marketError ? 'error-dot' : ''}`} />
          {updated ? `${getMarketDataProviderName()} · ${t('refreshed')} ${updated.toLocaleTimeString()}` : t('loadingReferenceData')}
          <button className="toolbar-button" onClick={() => refresh()} disabled={loading}>↻ {t('refresh')}</button>
        </div>
      </div>

      <div className="workspace-body">
        <WatchlistSidebar items={items} selected={selected} onSelect={setSelected} onRemove={remove} orderSymbols={orderSymbols} />
        <div className="market-main">
          {!selectedItem ? (
            <div className="workspace-empty">
              <div className="empty-icon">+</div>
              <h1>{t('emptyWatchlistTitle')}</h1>
              <p>{t('emptyWatchlistText')}</p>
              <div className="examples">{['TSLL', 'RDW', 'QMCO', 'AAPL'].map((example) => <button className="secondary" key={example} onClick={async () => { addSymbol(example); await refresh([example], false); setSelected(example) }}>{example}</button>)}</div>
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
                </div>
                <div className="action-group">
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

              <div className="chart-toolbar">
                <div className="chart-label"><strong>{interval === '1m' ? t('intradayChart') : selectedItem.quote.closeOnly && interval === 'daily' ? t('dailyCloseChart') : t('kLineChart')}</strong><span>{interval === '1m' ? t('intradayHint') : t('markerHint')}</span></div>
                <IntervalSelector value={interval} onChange={setInterval} />
              </div>
              {interval === '1m' && !hasIntradayLoaded ? <div className="workspace-empty"><h1>{t('loadingIntradayData')}</h1><p>{t('fetchingIntraday', { symbol: selected })}</p></div> : interval === '1m' && !chartCandles.length ? <div className="workspace-empty"><h1>{t('noIntradayData')}</h1><p>{t('noIntradayText')}</p></div> : <StockChart candles={chartCandles} interval={interval} trades={trades} averageCost={position.averageCost} closeOnly={selectedItem.quote.closeOnly} currency={selectedItem.quote.currency} />}

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
      {tradeSide && <TradeModal side={tradeSide} symbol={selected} defaultPrice={selectedItem.quote.price} candles={candles} onClose={() => setTradeSide(null)} onSave={async (trade) => { saveTrade(trade); setTradeSide(null); reloadJournal(); await refresh([selected], false) }} />}
      {editingTrade && <TradeModal side={editingTrade.side} symbol={editingTrade.symbol} defaultPrice={editingTrade.price} candles={candles} initialTrade={editingTrade} onClose={() => setEditingTrade(null)} onSave={async (trade) => { updateTrade(trade); setEditingTrade(null); reloadJournal(); await refresh([selected], false) }} />}
      {showOrders && <div className="modal-backdrop" onMouseDown={() => setShowOrders(false)}>
        <div className="modal order-plan-modal" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-head"><h2>{t('orderSuggestionsFor', { symbol: selected })}</h2><button type="button" className="icon-button" onClick={() => setShowOrders(false)}>×</button></div>
          <div className="modal-body order-plan-list">{selectedOrders.map((order) => <OrderPlanCard order={order} key={order.id} />)}</div>
        </div>
      </div>}
    </section>
  )
}
