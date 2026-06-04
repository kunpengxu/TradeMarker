import { useState } from 'react'
import TradeLog from '../components/TradeLog'
import { deleteTrade, getTrades } from '../services/storage'

export default function TradeLogPage() {
  const [trades, setTrades] = useState(getTrades())
  return <section><div className="page-head"><div><p className="eyebrow">All symbols</p><h1>Trade log</h1><p>Your complete manual Buy and Sell journal.</p></div></div><div className="panel"><TradeLog trades={trades} showSymbol onDelete={(id) => { deleteTrade(id); setTrades(getTrades()) }} /></div></section>
}
