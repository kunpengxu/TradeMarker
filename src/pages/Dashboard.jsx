import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import IntervalSelector from '../components/IntervalSelector'
import SymbolSearch from '../components/SymbolSearch'
import StockChart from '../components/StockChart'
import TradeLog from '../components/TradeLog'
import TradeModal from '../components/TradeModal'
import WatchlistSidebar from '../components/WatchlistSidebar'
import { getMarketDataProviderName, getMarketSnapshot, hasMarketDataApiKey } from '../services/marketData'
import { calculatePosition } from '../services/positionCalculator'
import { addSymbol, deleteTrade, getTrades, getWatchlist, removeSymbol, saveTrade, updateTrade } from '../services/storage'
import { money, number, percent, valueClass } from '../utils/formatters'

export default function Dashboard() {
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [candles, setCandles] = useState([])
  const [historyCache, setHistoryCache] = useState({})
  const [trades, setTrades] = useState([])
  const [interval, setInterval] = useState('daily')
  const [activeSection, setActiveSection] = useState('chart')
  const [tradeSide, setTradeSide] = useState(null)
  const [editingTrade, setEditingTrade] = useState(null)
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
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    if (!selected) { setCandles([]); setTrades([]); return }
    setCandles(historyCache[selected] || [])
    setTrades(getTrades(selected))
  }, [selected, historyCache])

  const selectedItem = items.find((item) => item.symbol === selected)
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
    if (confirm(`Remove ${ticker} from your watchlist? Journal entries will be kept.`)) {
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
          {updated ? `${getMarketDataProviderName()} · refreshed ${updated.toLocaleTimeString()}` : 'Loading reference market data'}
          <button className="toolbar-button" onClick={() => refresh()} disabled={loading}>↻ Refresh</button>
        </div>
      </div>

      <div className="workspace-body">
        <WatchlistSidebar items={items} selected={selected} onSelect={setSelected} onRemove={remove} />
        <div className="market-main">
          {!selectedItem ? (
            <div className="workspace-empty">
              <div className="empty-icon">+</div>
              <h1>Your watchlist is empty</h1>
              <p>Add a symbol above or choose an example to open its chart and begin journaling.</p>
              <div className="examples">{['TSLL', 'RDW', 'QMCO', 'AAPL'].map((example) => <button className="secondary" key={example} onClick={async () => { addSymbol(example); await refresh([example], false); setSelected(example) }}>{example}</button>)}</div>
            </div>
          ) : !selectedItem.quote ? (
            <div className="workspace-empty market-error-state">
              <div className="empty-icon">!</div>
              <h1>Real market data unavailable</h1>
              <p>{marketError || selectedItem.error}</p>
              {!hasMarketDataApiKey() && <Link className="settings-link" to="/settings">Configure market data API key</Link>}
              <button className="secondary" onClick={() => refresh()}>Retry market data</button>
            </div>
          ) : (
            <>
              <header className="quote-header">
                <div className="quote-identity">
                  <span className="symbol-avatar">{selected.slice(0, 2)}</span>
                  <div><h1>{selected}</h1><small>{selectedItem.quote.exchange} · {selectedItem.quote.source} · reference data</small></div>
                </div>
                <div className="quote-price">
                  <strong className={valueClass(selectedItem.quote.change)}>{money(selectedItem.quote.price, selectedItem.quote.currency)}</strong>
                  <span className={valueClass(selectedItem.quote.change)}>{selectedItem.quote.change >= 0 ? '+' : ''}{money(selectedItem.quote.change, selectedItem.quote.currency)} &nbsp; {percent(selectedItem.quote.changePercent)}</span>
                </div>
                <div className="action-group">
                  <button className="buy-button" onClick={() => setTradeSide('BUY')}>B&nbsp; Record Buy</button>
                  <button className="sell-button" onClick={() => setTradeSide('SELL')}>S&nbsp; Record Sell</button>
                </div>
              </header>

              <div className="market-tabs">
                <button className={activeSection === 'chart' ? 'active' : ''} onClick={() => { setActiveSection('chart'); document.querySelector('.chart-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>Chart</button>
                <button className={activeSection === 'position' ? 'active' : ''} onClick={() => { setActiveSection('position'); document.querySelector('.position-ribbon')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>Position</button>
                <button className={activeSection === 'journal' ? 'active' : ''} onClick={() => { setActiveSection('journal'); document.querySelector('.workspace-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>Journal</button>
                <span>Journal-only workspace · no order execution</span>
              </div>

              <div className="chart-toolbar">
                <div className="chart-label"><strong>{selectedItem.quote.closeOnly && interval === 'daily' ? 'Daily closing-price chart' : 'K-line chart'}</strong><span>B/S markers use each journal entry's date and price</span></div>
                <IntervalSelector value={interval} onChange={setInterval} />
              </div>
              <StockChart candles={candles} interval={interval} trades={trades} averageCost={position.averageCost} closeOnly={selectedItem.quote.closeOnly} />

              <div className="position-ribbon">
                <span>Shares<strong>{number(position.shares, 4)}</strong></span>
                <span>Average cost<strong>{money(position.averageCost, selectedItem.quote.currency)}</strong></span>
                <span>Market value<strong>{money(position.marketValue, selectedItem.quote.currency)}</strong></span>
                <span>Unrealized P/L<strong className={valueClass(position.unrealizedPL)}>{money(position.unrealizedPL, selectedItem.quote.currency)} &nbsp; {percent(position.unrealizedPLPercent)}</strong></span>
              </div>

              <div className="workspace-panel"><div className="workspace-panel-head"><div><h2>Trade journal</h2><p>Manual Buy and Sell records shown as boxed markers on the chart.</p></div></div><TradeLog trades={trades} currency={selectedItem.quote.currency} onEdit={setEditingTrade} onDelete={(id) => { deleteTrade(id); reloadJournal() }} /></div>
            </>
          )}
        </div>
      </div>
      {tradeSide && <TradeModal side={tradeSide} symbol={selected} defaultPrice={selectedItem.quote.price} candles={candles} onClose={() => setTradeSide(null)} onSave={async (trade) => { saveTrade(trade); setTradeSide(null); reloadJournal(); await refresh([selected], false) }} />}
      {editingTrade && <TradeModal side={editingTrade.side} symbol={editingTrade.symbol} defaultPrice={editingTrade.price} candles={candles} initialTrade={editingTrade} onClose={() => setEditingTrade(null)} onSave={async (trade) => { updateTrade(trade); setEditingTrade(null); reloadJournal(); await refresh([selected], false) }} />}
    </section>
  )
}
