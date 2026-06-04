import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import IntervalSelector from '../components/IntervalSelector'
import StockChart from '../components/StockChart'
import TradeLog from '../components/TradeLog'
import TradeModal from '../components/TradeModal'
import { getMarketSnapshot } from '../services/marketData'
import { calculatePosition } from '../services/positionCalculator'
import { deleteTrade, getTrades, saveTrade } from '../services/storage'
import { money, number, percent, valueClass } from '../utils/formatters'

export default function StockDetail() {
  const { symbol } = useParams()
  const [quote, setQuote] = useState(null)
  const [candles, setCandles] = useState([])
  const [trades, setTrades] = useState(() => getTrades(symbol))
  const [interval, setInterval] = useState('daily')
  const [tradeSide, setTradeSide] = useState(null)
  const [error, setError] = useState('')
  const position = calculatePosition(trades, quote?.price)

  const load = useCallback(async () => {
    try {
      const snapshot = await getMarketSnapshot(symbol, { force: true })
      setQuote(snapshot.quote); setCandles(snapshot.candles); setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [symbol])
  useEffect(() => { load() }, [load])

  const recordTrade = async (trade) => { saveTrade(trade); setTrades(getTrades(symbol)); setTradeSide(null); await load() }
  if (error) return <div className="loading"><strong>Real market data unavailable.</strong><br />{error}<br /><Link to="/settings">Configure market data in Settings</Link></div>
  if (!quote) return <div className="loading">Loading real market data for {symbol}…</div>

  return (
    <section>
      <Link to="/" className="back-link">← Back to watchlist</Link>
      <div className="detail-head"><div><p className="eyebrow">Stock journal</p><h1>{symbol}</h1><div className="detail-price">{money(quote.price, quote.currency)} <span className={valueClass(quote.change)}>{quote.change >= 0 ? '+' : ''}{money(quote.change, quote.currency)} ({percent(quote.changePercent)})</span></div></div>
        <div className="action-group"><button className="buy-button" onClick={() => setTradeSide('BUY')}>Record Buy</button><button className="sell-button" onClick={() => setTradeSide('SELL')}>Record Sell</button></div>
      </div>
      <p className="safety-strip">All actions on this page are journal notes only. TradeMarker has no brokerage connection and cannot execute orders.</p>
      <div className="stat-strip"><span>Current shares<strong>{number(position.shares, 4)}</strong></span><span>Average cost<strong>{money(position.averageCost, quote.currency)}</strong></span><span>Market value<strong>{money(position.marketValue, quote.currency)}</strong></span><span>Unrealized P/L<strong className={valueClass(position.unrealizedPL)}>{money(position.unrealizedPL, quote.currency)} · {percent(position.unrealizedPLPercent)}</strong></span></div>
      <div className="panel chart-panel"><div className="panel-head"><div><h2>{quote.closeOnly && interval === 'daily' ? 'Daily closing-price chart' : 'Candlestick chart'}</h2><p>Each candle represents one selected interval.</p></div><IntervalSelector value={interval} onChange={setInterval} /></div><StockChart candles={candles} interval={interval} trades={trades} averageCost={position.averageCost} closeOnly={quote.closeOnly} /></div>
      <div className="panel"><div className="panel-head"><div><h2>Trade journal</h2><p>Manual Buy and Sell records for {symbol}.</p></div></div><TradeLog trades={trades} onDelete={(id) => { deleteTrade(id); setTrades(getTrades(symbol)) }} /></div>
      {tradeSide && <TradeModal side={tradeSide} symbol={symbol} defaultPrice={quote.price} onClose={() => setTradeSide(null)} onSave={recordTrade} />}
    </section>
  )
}
