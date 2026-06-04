import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import IntervalSelector from '../components/IntervalSelector'
import PlannedOrderModal from '../components/PlannedOrderModal'
import PlannedOrders from '../components/PlannedOrders'
import StockChart from '../components/StockChart'
import TradeLog from '../components/TradeLog'
import TradeModal from '../components/TradeModal'
import { getHistoricalDaily, getLatestQuote } from '../services/marketData'
import { calculatePosition } from '../services/positionCalculator'
import { deleteOrder, deleteTrade, getOrders, getTrades, saveOrder, saveTrade, updateOrder } from '../services/storage'
import { money, number, percent, valueClass } from '../utils/formatters'

export default function StockDetail() {
  const { symbol } = useParams()
  const [quote, setQuote] = useState(null)
  const [candles, setCandles] = useState([])
  const [trades, setTrades] = useState(() => getTrades(symbol))
  const [orders, setOrders] = useState(() => getOrders(symbol))
  const [interval, setInterval] = useState('daily')
  const [tradeSide, setTradeSide] = useState(null)
  const [orderOpen, setOrderOpen] = useState(false)
  const position = calculatePosition(trades, quote?.price)

  const load = useCallback(async () => {
    const [nextQuote, nextCandles] = await Promise.all([getLatestQuote(symbol), getHistoricalDaily(symbol)])
    setQuote(nextQuote); setCandles(nextCandles)
  }, [symbol])
  useEffect(() => { load() }, [load])

  const recordTrade = (trade) => { saveTrade(trade); setTrades(getTrades(symbol)); setTradeSide(null) }
  const recordOrder = (order) => { saveOrder(order); setOrders(getOrders(symbol)); setOrderOpen(false) }
  if (!quote) return <div className="loading">Loading {symbol}…</div>

  return (
    <section>
      <Link to="/" className="back-link">← Back to watchlist</Link>
      <div className="detail-head"><div><p className="eyebrow">Stock journal</p><h1>{symbol}</h1><div className="detail-price">{money(quote.price)} <span className={valueClass(quote.change)}>{quote.change >= 0 ? '+' : ''}{money(quote.change)} ({percent(quote.changePercent)})</span></div></div>
        <div className="action-group"><button className="buy-button" onClick={() => setTradeSide('BUY')}>Record Buy</button><button className="sell-button" onClick={() => setTradeSide('SELL')}>Record Sell</button><button className="secondary" onClick={() => setOrderOpen(true)}>Add planned order</button></div>
      </div>
      <p className="safety-strip">All actions on this page are journal notes only. TradeMarker has no brokerage connection and cannot execute orders.</p>
      <div className="stat-strip"><span>Current shares<strong>{number(position.shares, 4)}</strong></span><span>Average cost<strong>{money(position.averageCost)}</strong></span><span>Market value<strong>{money(position.marketValue)}</strong></span><span>Unrealized P/L<strong className={valueClass(position.unrealizedPL)}>{money(position.unrealizedPL)} · {percent(position.unrealizedPLPercent)}</strong></span></div>
      <div className="panel chart-panel"><div className="panel-head"><div><h2>Candlestick chart</h2><p>Each candle represents one selected interval.</p></div><IntervalSelector value={interval} onChange={setInterval} /></div><StockChart candles={candles} interval={interval} trades={trades} orders={orders} averageCost={position.averageCost} /></div>
      <div className="panel"><div className="panel-head"><div><h2>Trade journal</h2><p>Manual Buy and Sell records for {symbol}.</p></div></div><TradeLog trades={trades} onDelete={(id) => { deleteTrade(id); setTrades(getTrades(symbol)) }} /></div>
      <div className="panel"><div className="panel-head"><div><h2>Planned orders</h2><p>Planning notes only, shown as chart lines while open.</p></div><button onClick={() => setOrderOpen(true)}>Add planned order</button></div><PlannedOrders orders={orders} onUpdate={(order) => { updateOrder(order); setOrders(getOrders(symbol)) }} onDelete={(id) => { deleteOrder(id); setOrders(getOrders(symbol)) }} /></div>
      {tradeSide && <TradeModal side={tradeSide} symbol={symbol} defaultPrice={quote.price} onClose={() => setTradeSide(null)} onSave={recordTrade} />}
      {orderOpen && <PlannedOrderModal symbol={symbol} defaultPrice={quote.price} onClose={() => setOrderOpen(false)} onSave={recordOrder} />}
    </section>
  )
}
