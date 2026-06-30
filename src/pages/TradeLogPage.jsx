import { useState } from 'react'
import TradeLog from '../components/TradeLog'
import TradeModal from '../components/TradeModal'
import { calculateRealizedPLByTrade } from '../services/positionCalculator'
import { deleteTrade, getTrades, updateTrade } from '../services/storage'
import { money, valueClass } from '../utils/formatters'
import { useI18n } from '../i18n'

export default function TradeLogPage() {
  const { t } = useI18n()
  const [trades, setTrades] = useState(getTrades())
  const [editingTrade, setEditingTrade] = useState(null)
  const realizedPL = calculateRealizedPLByTrade(trades)
  const realizedByCurrency = trades.reduce((totals, trade) => {
    if (trade.side !== 'SELL' || !realizedPL.has(trade.id)) return totals
    const currency = trade.currency || 'USD'
    totals[currency] = (totals[currency] || 0) + realizedPL.get(trade.id)
    return totals
  }, {})
  const realizedEntries = Object.entries(realizedByCurrency)
  const realizedClass = realizedEntries.length === 1 ? valueClass(realizedEntries[0][1]) : ''
  const realizedDisplay = realizedEntries.length ? realizedEntries.map(([currency, value]) => money(value, currency)).join(' · ') : '—'
  const tradeStats = [
    [t('totalTrades'), trades.length],
    [t('buyTrades'), trades.filter((trade) => trade.side === 'BUY').length],
    [t('sellTrades'), trades.filter((trade) => trade.side === 'SELL').length],
    [t('placedOrders'), trades.filter((trade) => trade.side === 'ORDER').length],
    [t('soldPL'), realizedDisplay, realizedClass],
    [t('notedTrades'), trades.filter((trade) => trade.note).length],
  ]
  return <section><div className="page-head"><div><p className="eyebrow">{t('allSymbols')}</p><h1>{t('tradeLogTitle')}</h1><p>{t('tradeLogSubtitle')}</p></div></div>
    <div className="trade-log-summary">{tradeStats.map(([label, value, className]) => <span key={label}>{label}<strong className={className || ''}>{value}</strong></span>)}</div>
    <div className="panel trade-log-panel"><TradeLog trades={trades} showSymbol onEdit={setEditingTrade} onDelete={(id) => { deleteTrade(id); setTrades(getTrades()) }} /></div>
    {editingTrade && <TradeModal side={editingTrade.side} symbol={editingTrade.symbol} defaultPrice={editingTrade.price} initialTrade={editingTrade} onClose={() => setEditingTrade(null)} onSave={(trade) => { updateTrade(trade); setTrades(getTrades()); setEditingTrade(null) }} />}</section>
}
