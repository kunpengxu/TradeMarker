import { useState } from 'react'
import TradeLog from '../components/TradeLog'
import TradeModal from '../components/TradeModal'
import { deleteTrade, getTrades, updateTrade } from '../services/storage'
import { useI18n } from '../i18n'

export default function TradeLogPage() {
  const { t } = useI18n()
  const [trades, setTrades] = useState(getTrades())
  const [editingTrade, setEditingTrade] = useState(null)
  return <section><div className="page-head"><div><p className="eyebrow">{t('allSymbols')}</p><h1>{t('tradeLogTitle')}</h1><p>{t('tradeLogSubtitle')}</p></div></div><div className="panel"><TradeLog trades={trades} showSymbol onEdit={setEditingTrade} onDelete={(id) => { deleteTrade(id); setTrades(getTrades()) }} /></div>{editingTrade && <TradeModal side={editingTrade.side} symbol={editingTrade.symbol} defaultPrice={editingTrade.price} initialTrade={editingTrade} onClose={() => setEditingTrade(null)} onSave={(trade) => { updateTrade(trade); setTrades(getTrades()); setEditingTrade(null) }} />}</section>
}
