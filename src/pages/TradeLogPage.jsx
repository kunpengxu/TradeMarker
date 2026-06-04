import { useState } from 'react'
import TradeLog from '../components/TradeLog'
import TradeModal from '../components/TradeModal'
import { deleteTrade, getTrades, updateTrade } from '../services/storage'

export default function TradeLogPage() {
  const [trades, setTrades] = useState(getTrades())
  const [editingTrade, setEditingTrade] = useState(null)
  return <section><div className="page-head"><div><p className="eyebrow">All symbols</p><h1>Trade log</h1><p>Your complete manual Buy and Sell journal.</p></div></div><div className="panel"><TradeLog trades={trades} showSymbol onEdit={setEditingTrade} onDelete={(id) => { deleteTrade(id); setTrades(getTrades()) }} /></div>{editingTrade && <TradeModal side={editingTrade.side} symbol={editingTrade.symbol} defaultPrice={editingTrade.price} initialTrade={editingTrade} onClose={() => setEditingTrade(null)} onSave={(trade) => { updateTrade(trade); setTrades(getTrades()); setEditingTrade(null) }} />}</section>
}
