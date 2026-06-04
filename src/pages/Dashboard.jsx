import { useCallback, useEffect, useState } from 'react'
import IntervalSelector from '../components/IntervalSelector'
import PlannedOrderModal from '../components/PlannedOrderModal'
import PlannedOrders from '../components/PlannedOrders'
import StockChart from '../components/StockChart'
import TradeLog from '../components/TradeLog'
import TradeModal from '../components/TradeModal'
import WatchlistSidebar from '../components/WatchlistSidebar'
import { getHistoricalDaily, getLatestQuote } from '../services/marketData'
import { calculatePosition } from '../services/positionCalculator'
import {
  addSymbol, deleteOrder, deleteTrade, getOrders, getTrades, getWatchlist,
  removeSymbol, saveOrder, saveTrade, updateOrder,
} from '../services/storage'
import { money, number, percent, valueClass } from '../utils/formatters'

export default function Dashboard() {
  const [symbol, setSymbol] = useState('')
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [candles, setCandles] = useState([])
  const [trades, setTrades] = useState([])
  const [orders, setOrders] = useState([])
  const [interval, setInterval] = useState('daily')
  const [tradeSide, setTradeSide] = useState(null)
  const [orderOpen, setOrderOpen] = useState(false)
  const [updated, setUpdated] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (symbols = getWatchlist()) => {
    setLoading(true)
    const rows = await Promise.all(symbols.map(async (ticker) => {
      const quote = await getLatestQuote(ticker)
      return { symbol: ticker, quote, position: calculatePosition(getTrades(ticker), quote.price) }
    }))
    setItems(rows)
    setSelected((current) => current && symbols.includes(current) ? current : symbols[0] || null)
    setUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    if (!selected) { setCandles([]); setTrades([]); setOrders([]); return }
    getHistoricalDaily(selected).then(setCandles)
    setTrades(getTrades(selected))
    setOrders(getOrders(selected))
  }, [selected])

  const selectedItem = items.find((item) => item.symbol === selected)
  const position = selectedItem ? calculatePosition(trades, selectedItem.quote.price) : null
  const reloadJournal = () => {
    setTrades(getTrades(selected))
    setOrders(getOrders(selected))
    refresh()
  }
  const submit = async (event) => {
    event.preventDefault()
    const clean = symbol.trim().toUpperCase()
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(clean)) return
    const next = addSymbol(clean)
    setSymbol('')
    await refresh(next)
    setSelected(clean)
  }
  const remove = async (ticker) => {
    if (confirm(`Remove ${ticker} from your watchlist? Journal entries will be kept.`)) await refresh(removeSymbol(ticker))
  }

  return (
    <section className="market-workspace">
      <div className="workspace-toolbar">
        <form className="workspace-search" onSubmit={submit}>
          <span>⌕</span>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Add symbol, e.g. RDW" aria-label="Stock symbol" />
          <button type="submit">Add</button>
        </form>
        <div className="workspace-status">
          <span className={loading ? 'status-dot loading-dot' : 'status-dot'} />
          {updated ? `Mock market data · ${updated.toLocaleTimeString()}` : 'Loading market data'}
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
              <div className="examples">{['TSLL', 'RDW', 'QMCO', 'AAPL'].map((example) => <button className="secondary" key={example} onClick={async () => { await refresh(addSymbol(example)); setSelected(example) }}>{example}</button>)}</div>
            </div>
          ) : (
            <>
              <header className="quote-header">
                <div className="quote-identity">
                  <span className="symbol-avatar">{selected.slice(0, 2)}</span>
                  <div><h1>{selected}</h1><small>US · Mock market data</small></div>
                </div>
                <div className="quote-price">
                  <strong className={valueClass(selectedItem.quote.change)}>{money(selectedItem.quote.price)}</strong>
                  <span className={valueClass(selectedItem.quote.change)}>{selectedItem.quote.change >= 0 ? '+' : ''}{money(selectedItem.quote.change)} &nbsp; {percent(selectedItem.quote.changePercent)}</span>
                </div>
                <div className="action-group">
                  <button className="buy-button" onClick={() => setTradeSide('BUY')}>B&nbsp; Record Buy</button>
                  <button className="sell-button" onClick={() => setTradeSide('SELL')}>S&nbsp; Record Sell</button>
                  <button className="secondary" onClick={() => setOrderOpen(true)}>+ Plan</button>
                </div>
              </header>

              <div className="market-tabs"><button className="active">Chart</button><button>Position</button><button>Journal</button><span>Journal-only workspace · no order execution</span></div>

              <div className="chart-toolbar">
                <div className="chart-label"><strong>K-line chart</strong><span>OHLCV · B/S markers · average cost</span></div>
                <IntervalSelector value={interval} onChange={setInterval} />
              </div>
              <StockChart candles={candles} interval={interval} trades={trades} orders={orders} averageCost={position.averageCost} />

              <div className="position-ribbon">
                <span>Shares<strong>{number(position.shares, 4)}</strong></span>
                <span>Average cost<strong>{money(position.averageCost)}</strong></span>
                <span>Market value<strong>{money(position.marketValue)}</strong></span>
                <span>Unrealized P/L<strong className={valueClass(position.unrealizedPL)}>{money(position.unrealizedPL)} &nbsp; {percent(position.unrealizedPLPercent)}</strong></span>
              </div>

              <div className="journal-grid">
                <div className="workspace-panel"><div className="workspace-panel-head"><div><h2>Trade journal</h2><p>Buy and sell markers shown on the chart.</p></div></div><TradeLog trades={trades} onDelete={(id) => { deleteTrade(id); reloadJournal() }} /></div>
                <div className="workspace-panel"><div className="workspace-panel-head"><div><h2>Planned orders</h2><p>Planning notes only.</p></div><button onClick={() => setOrderOpen(true)}>Add</button></div><PlannedOrders orders={orders} onUpdate={(order) => { updateOrder(order); reloadJournal() }} onDelete={(id) => { deleteOrder(id); reloadJournal() }} /></div>
              </div>
            </>
          )}
        </div>
      </div>
      {tradeSide && <TradeModal side={tradeSide} symbol={selected} defaultPrice={selectedItem.quote.price} onClose={() => setTradeSide(null)} onSave={(trade) => { saveTrade(trade); setTradeSide(null); reloadJournal() }} />}
      {orderOpen && <PlannedOrderModal symbol={selected} defaultPrice={selectedItem.quote.price} onClose={() => setOrderOpen(false)} onSave={(order) => { saveOrder(order); setOrderOpen(false); reloadJournal() }} />}
    </section>
  )
}
