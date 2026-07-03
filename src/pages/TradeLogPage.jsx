import { useEffect, useMemo, useState } from 'react'
import TradeLog from '../components/TradeLog'
import TradeModal from '../components/TradeModal'
import { calculateRealizedPLByTrade } from '../services/positionCalculator'
import { deleteTrade, getTrades, getWatchlistGroups, updateTrade } from '../services/storage'
import { money, valueClass } from '../utils/formatters'
import { useI18n } from '../i18n'

export default function TradeLogPage() {
  const { t } = useI18n()
  const [trades, setTrades] = useState(getTrades())
  const [editingTrade, setEditingTrade] = useState(null)
  const [sideFilter, setSideFilter] = useState('all')
  const [symbolFilter, setSymbolFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  useEffect(() => {
    const syncTrades = () => setTrades(getTrades())
    window.addEventListener('trademarker:data-imported', syncTrades)
    return () => window.removeEventListener('trademarker:data-imported', syncTrades)
  }, [])
  const groups = useMemo(() => getWatchlistGroups(), [trades])
  const symbols = useMemo(() => [...new Set(trades.map((trade) => trade.symbol).filter(Boolean))].sort(), [trades])
  const filteredTrades = useMemo(() => trades.filter((trade) => {
    if (sideFilter === 'executed' && trade.side === 'ORDER') return false
    if (sideFilter !== 'all' && sideFilter !== 'executed' && trade.side !== sideFilter) return false
    if (symbolFilter !== 'all' && trade.symbol !== symbolFilter) return false
    if (groupFilter !== 'all') {
      const group = groups.find((item) => item.id === groupFilter)
      if (!group?.symbols.includes(trade.symbol)) return false
    }
    return true
  }), [groupFilter, groups, sideFilter, symbolFilter, trades])
  const realizedPL = calculateRealizedPLByTrade(filteredTrades)
  const realizedByCurrency = filteredTrades.reduce((totals, trade) => {
    if (trade.side !== 'SELL' || !realizedPL.has(trade.id)) return totals
    const currency = trade.currency || 'USD'
    totals[currency] = (totals[currency] || 0) + realizedPL.get(trade.id)
    return totals
  }, {})
  const realizedEntries = Object.entries(realizedByCurrency)
  const realizedClass = realizedEntries.length === 1 ? valueClass(realizedEntries[0][1]) : ''
  const realizedDisplay = realizedEntries.length ? realizedEntries.map(([currency, value]) => money(value, currency)).join(' · ') : '—'
  const tradeStats = [
    [t('totalTrades'), filteredTrades.length],
    [t('buyTrades'), filteredTrades.filter((trade) => trade.side === 'BUY').length],
    [t('sellTrades'), filteredTrades.filter((trade) => trade.side === 'SELL').length],
    [t('placedOrders'), filteredTrades.filter((trade) => trade.side === 'ORDER').length],
    [t('soldPL'), realizedDisplay, realizedClass],
    [t('notedTrades'), filteredTrades.filter((trade) => trade.note).length],
  ]
  return <section><div className="page-head"><div><p className="eyebrow">{t('allSymbols')}</p><h1>{t('tradeLogTitle')}</h1><p>{t('tradeLogSubtitle')}</p></div></div>
    <div className="trade-log-summary">{tradeStats.map(([label, value, className]) => <span key={label}>{label}<strong className={className || ''}>{value}</strong></span>)}</div>
    <div className="panel trade-log-filters">
      <label>{t('side')}<select value={sideFilter} onChange={(event) => setSideFilter(event.target.value)}><option value="all">{t('allTrades')}</option><option value="executed">{t('executedTrades')}</option><option value="BUY">{t('buyTrades')}</option><option value="SELL">{t('sellTrades')}</option><option value="ORDER">{t('placedOrders')}</option></select></label>
      <label>{t('symbol')}<select value={symbolFilter} onChange={(event) => setSymbolFilter(event.target.value)}><option value="all">{t('allSymbols')}</option>{symbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}</select></label>
      <label>{t('watchlist')}<select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="all">{t('allStocks')}</option>{groups.map((group) => <option value={group.id} key={group.id}>{t(group.id === 'long-core' ? 'groupLongCore' : group.id === 'long-satellite' ? 'groupLongSatellite' : group.id === 'swing' ? 'groupSwing' : group.id === 'leveraged-swing' ? 'groupLeveragedSwing' : 'customGroup')}</option>)}</select></label>
    </div>
    <div className="panel trade-log-panel"><TradeLog trades={filteredTrades} showSymbol onEdit={setEditingTrade} onDelete={(id) => { deleteTrade(id); setTrades(getTrades()) }} /></div>
    {editingTrade && <TradeModal side={editingTrade.side} symbol={editingTrade.symbol} defaultPrice={editingTrade.price} initialTrade={editingTrade} onClose={() => setEditingTrade(null)} onSave={(trade) => { updateTrade(trade); setTrades(getTrades()); setEditingTrade(null) }} />}</section>
}
