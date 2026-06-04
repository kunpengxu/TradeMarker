import { useCallback, useEffect, useState } from 'react'
import WatchlistTable from '../components/WatchlistTable'
import { addSymbol, getTrades, getWatchlist, removeSymbol } from '../services/storage'
import { getLatestQuote } from '../services/marketData'
import { calculatePosition } from '../services/positionCalculator'

export default function Dashboard() {
  const [symbol, setSymbol] = useState('')
  const [items, setItems] = useState([])
  const [updated, setUpdated] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (symbols = getWatchlist()) => {
    setLoading(true)
    const rows = await Promise.all(symbols.map(async (ticker) => {
      const quote = await getLatestQuote(ticker)
      return { symbol: ticker, quote, position: calculatePosition(getTrades(ticker), quote.price) }
    }))
    setItems(rows)
    setUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const submit = async (event) => {
    event.preventDefault()
    const clean = symbol.trim().toUpperCase()
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(clean)) return
    const next = addSymbol(clean)
    setSymbol('')
    await refresh(next)
  }
  const remove = async (ticker) => {
    if (confirm(`Remove ${ticker} from your watchlist? Journal entries will be kept.`)) await refresh(removeSymbol(ticker))
  }

  return (
    <section>
      <div className="page-head"><div><p className="eyebrow">Personal market journal</p><h1>Watchlist</h1><p>Track only the symbols you care about, with your notes in context.</p></div>
        <div className="refresh-block"><button className="secondary" onClick={() => refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh prices'}</button><small>{updated ? `Updated ${updated.toLocaleTimeString()}` : 'Not updated yet'}</small></div>
      </div>
      <form className="add-stock" onSubmit={submit}><input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Enter a US stock symbol" aria-label="Stock symbol" /><button type="submit">Add to watchlist</button></form>
      {items.length ? <WatchlistTable items={items} onRemove={remove} /> : !loading && <div className="empty-state"><div className="empty-icon">+</div><h2>No stocks yet</h2><p>Add a symbol such as TSLL, RDW, QMCO, or AAPL to begin.</p><div className="examples">{['TSLL', 'RDW', 'QMCO', 'AAPL'].map((example) => <button className="secondary" key={example} onClick={() => { const next = addSymbol(example); refresh(next) }}>{example}</button>)}</div></div>}
    </section>
  )
}
