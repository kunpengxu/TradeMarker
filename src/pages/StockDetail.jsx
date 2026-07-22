import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import IndicatorMenu from '../components/IndicatorMenu'
import IntervalSelector from '../components/IntervalSelector'
import OrderPlanCard from '../components/OrderPlanCard'
import StockChart from '../components/StockChart'
import TradeJournalTimeline, { DecisionTimeline } from '../components/TradeJournalTimeline'
import TradeLog from '../components/TradeLog'
import TradeModal from '../components/TradeModal'
import { loadOrderPlanFromGitHub, saveSymbolSnapshotToGitHub } from '../services/githubSync'
import { buildMarketAnalysisExport } from '../services/marketAnalysisExport'
import { getIntradayCandles, getMarketSnapshot } from '../services/marketData'
import { normalizeOrderPlan } from '../services/orderPlan'
import { calculatePosition } from '../services/positionCalculator'
import { deleteTrade, getTrades, saveTrade, updateTrade } from '../services/storage'
import { money, number, percent, valueClass } from '../utils/formatters'
import { useChartIndicators } from '../hooks/useChartIndicators'
import { useI18n } from '../i18n'

const cleanSymbol = (value) => String(value || '').toUpperCase().replace(/(:CA|:US)$/i, '').replace(/\.(NE|TO|V)$/i, '')
const matchesSymbol = (orderSymbol, symbol) => {
  const order = String(orderSymbol || '').toUpperCase()
  const current = String(symbol || '').toUpperCase()
  return order === current || cleanSymbol(order) === cleanSymbol(current)
}

export default function StockDetail() {
  const { t } = useI18n()
  const { symbol } = useParams()
  const [quote, setQuote] = useState(null)
  const [candles, setCandles] = useState([])
  const [intradayCandles, setIntradayCandles] = useState([])
  const [intradayLoaded, setIntradayLoaded] = useState(false)
  const [trades, setTrades] = useState(() => getTrades(symbol))
  const [interval, setInterval] = useState('daily')
  const [indicators, setIndicators] = useChartIndicators()
  const [tradeSide, setTradeSide] = useState(null)
  const [editingTrade, setEditingTrade] = useState(null)
  const [symbolOrders, setSymbolOrders] = useState([])
  const [showOrders, setShowOrders] = useState(false)
  const [error, setError] = useState('')
  const position = calculatePosition(trades, quote?.price)

  const load = useCallback(async () => {
    try {
      const snapshot = await getMarketSnapshot(symbol, { force: true })
      const nextPosition = calculatePosition(getTrades(symbol), snapshot.quote.price)
      setQuote(snapshot.quote); setCandles(snapshot.candles); setIntradayCandles([]); setIntradayLoaded(false); setError('')
      saveSymbolSnapshotToGitHub({
        generatedAt: new Date().toISOString(),
        source: 'TradeMarker',
        symbol,
        quote: snapshot.quote,
        position: nextPosition,
        marketAnalysis: buildMarketAnalysisExport([{ symbol, quote: snapshot.quote, candles: snapshot.candles, position: nextPosition }]).symbols[0],
      }).catch(() => {})
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [symbol])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const syncImportedData = () => {
      setTrades(getTrades(symbol))
      load()
    }
    window.addEventListener('trademarker:data-imported', syncImportedData)
    return () => window.removeEventListener('trademarker:data-imported', syncImportedData)
  }, [load, symbol])
  useEffect(() => {
    loadOrderPlanFromGitHub('order-plan.json')
      .then((result) => {
        if (result.status !== 'loaded') return setSymbolOrders([])
        const plan = normalizeOrderPlan(result.data)
        setSymbolOrders(plan.orders.filter((order) => matchesSymbol(order.symbol, symbol)))
      })
      .catch(() => setSymbolOrders([]))
  }, [symbol])
  useEffect(() => {
    if (interval !== '1m' || intradayLoaded) return
    getIntradayCandles(symbol)
      .then((rows) => setIntradayCandles(rows))
      .catch(() => setIntradayCandles([]))
      .finally(() => setIntradayLoaded(true))
  }, [interval, intradayLoaded, symbol])

  const recordTrade = async (trade) => { saveTrade(trade); setTrades(getTrades(symbol)); setTradeSide(null); await load() }
  if (error) return <div className="loading"><strong>Real market data unavailable.</strong><br />{error}<br /><Link to="/settings">Configure market data in Settings</Link></div>
  if (!quote) return <div className="loading">Loading real market data for {symbol}…</div>
  const chartCandles = interval === '1m' ? intradayCandles : candles

  return (
    <section>
      <Link to="/" className="back-link">← Back to watchlist</Link>
      <div className="detail-head"><div><p className="eyebrow">Stock journal</p><h1>{symbol}</h1><div className="detail-price">{money(quote.price, quote.currency)} <span className={valueClass(quote.change)}>{quote.change >= 0 ? '+' : ''}{money(quote.change, quote.currency)} ({percent(quote.changePercent)})</span></div></div>
        <div className="action-group">{symbolOrders.length ? <button className="secondary order-suggestion-button" onClick={() => setShowOrders(true)}>{t('orderSuggestions')} ({symbolOrders.length})</button> : null}<button className="buy-button" onClick={() => setTradeSide('BUY')}>Record Buy</button><button className="sell-button" onClick={() => setTradeSide('SELL')}>Record Sell</button></div>
      </div>
      <p className="safety-strip">All actions on this page are journal notes only. TradeMarker has no brokerage connection and cannot execute orders.</p>
      <div className="stat-strip"><span>Current shares<strong>{number(position.shares, 4)}</strong></span><span>Average cost<strong>{money(position.averageCost, quote.currency)}</strong></span><span>Market value<strong>{money(position.marketValue, quote.currency)}</strong></span><span>Unrealized P/L<strong className={valueClass(position.unrealizedPL)}>{money(position.unrealizedPL, quote.currency)} · {percent(position.unrealizedPLPercent)}</strong></span></div>
      <div className="panel chart-panel"><div className="panel-head"><div><h2>{interval === '1m' ? 'Intraday 1m chart' : quote.closeOnly && interval === 'daily' ? 'Daily closing-price chart' : 'Candlestick chart'}</h2><p>{interval === '1m' ? 'Yahoo intraday reference data; markers use trade time when available.' : 'Each candle represents one selected interval.'}</p></div><div className="chart-controls"><IndicatorMenu value={indicators} onChange={setIndicators} /><IntervalSelector value={interval} onChange={setInterval} /></div></div>{interval === '1m' && !intradayLoaded ? <div className="empty-inline">Loading Yahoo 1-minute data…</div> : interval === '1m' && !chartCandles.length ? <div className="empty-inline">No intraday data returned for this symbol right now.</div> : <StockChart candles={chartCandles} interval={interval} trades={trades} averageCost={position.averageCost} closeOnly={quote.closeOnly} currency={quote.currency} quoteChange={quote.change} quotePrice={quote.price} indicators={indicators} />}</div>
      <div className="panel"><div className="panel-head"><div><h2>Trade journal</h2><p>Richer journal cards with thesis, risk, targets, and compact table actions.</p></div></div><TradeJournalTimeline trades={trades} currency={quote.currency} /><TradeLog trades={trades} currency={quote.currency} onEdit={setEditingTrade} onDelete={(id) => { deleteTrade(id); setTrades(getTrades(symbol)) }} /></div>
      <div className="panel"><div className="panel-head"><div><h2>Decision Timeline</h2><p>A chronological investment story generated only from your stored journal data.</p></div></div><DecisionTimeline trades={trades} currency={quote.currency} /></div>
      {tradeSide && <TradeModal side={tradeSide} symbol={symbol} defaultPrice={quote.price} currency={quote.currency} candles={candles} onClose={() => setTradeSide(null)} onSave={recordTrade} />}
      {editingTrade && <TradeModal side={editingTrade.side} symbol={symbol} defaultPrice={editingTrade.price} currency={quote.currency} candles={candles} initialTrade={editingTrade} onClose={() => setEditingTrade(null)} onSave={(trade) => { updateTrade(trade); setTrades(getTrades(symbol)); setEditingTrade(null) }} />}
      {showOrders && <div className="modal-backdrop" onMouseDown={() => setShowOrders(false)}>
        <div className="modal order-plan-modal" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-head"><h2>{t('orderSuggestionsFor', { symbol })}</h2><button type="button" className="icon-button" onClick={() => setShowOrders(false)}>×</button></div>
          <div className="modal-body order-plan-list">{symbolOrders.map((order) => <OrderPlanCard order={order} key={order.id} />)}</div>
        </div>
      </div>}
    </section>
  )
}
