import { useEffect, useMemo, useState } from 'react'
import { getMarketSnapshot } from '../services/marketData'
import { calculatePosition } from '../services/positionCalculator'
import { getTrades, getWatchlist } from '../services/storage'
import { money, number, percent, valueClass } from '../utils/formatters'

export default function Portfolio() {
  const [positions, setPositions] = useState([])
  const [sort, setSort] = useState({ key: 'symbol', direction: 'asc' })
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.all(getWatchlist().map(async (symbol) => {
      try {
        const snapshot = await getMarketSnapshot(symbol)
        return { symbol, quote: snapshot.quote, ...calculatePosition(getTrades(symbol), snapshot.quote.price) }
      } catch { return null }
    })).then((rows) => {
      setPositions(rows.filter((row) => row?.shares > 0))
      setLoading(false)
    })
  }, [])
  const totals = useMemo(() => positions.reduce((result, position) => {
    const currency = position.quote.currency || 'USD'
    const current = result[currency] || { currency, cost: 0, value: 0, pl: 0 }
    current.cost += position.costBasis
    current.value += position.marketValue
    current.pl += position.unrealizedPL
    result[currency] = current
    return result
  }, {}), [positions])
  const sortedPositions = useMemo(() => [...positions].sort((a, b) => {
    const direction = sort.direction === 'asc' ? 1 : -1
    if (sort.key === 'symbol') return a.symbol.localeCompare(b.symbol) * direction
    if (sort.key === 'currency') return a.quote.currency.localeCompare(b.quote.currency) * direction
    return (a[sort.key] - b[sort.key]) * direction
  }), [positions, sort])
  const toggleSort = (key) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
  }))
  const sortArrow = (key) => sort.key === key ? (sort.direction === 'desc' ? ' ↓' : ' ↑') : ''

  if (loading) return <div className="loading">Loading portfolio…</div>
  return <section><div className="page-head"><div><p className="eyebrow">All current positions</p><h1>Portfolio</h1><p>Total cost, market value, unrealized profit/loss, and currency distribution.</p></div></div>
    <div className="portfolio-summary">{Object.values(totals).map((total) => <div className="panel portfolio-card" key={total.currency}><span>{total.currency} portfolio</span><strong>{money(total.value, total.currency)}</strong><div><small>Total cost {money(total.cost, total.currency)}</small><small className={valueClass(total.pl)}>P/L {money(total.pl, total.currency)} · {percent(total.cost ? total.pl / total.cost * 100 : 0)}</small></div></div>)}</div>
    <div className="portfolio-grid">
      <div className="panel"><h2>Current positions</h2>{positions.length ? <div className="table-wrap"><table className="portfolio-table"><thead><tr><th><button onClick={() => toggleSort('symbol')}>Symbol{sortArrow('symbol')}</button></th><th><button onClick={() => toggleSort('currency')}>Currency{sortArrow('currency')}</button></th><th><button onClick={() => toggleSort('shares')}>Shares{sortArrow('shares')}</button></th><th><button onClick={() => toggleSort('averageCost')}>Avg cost{sortArrow('averageCost')}</button></th><th><button onClick={() => toggleSort('costBasis')}>Total cost{sortArrow('costBasis')}</button></th><th><button onClick={() => toggleSort('marketValue')}>Market value{sortArrow('marketValue')}</button></th><th><button onClick={() => toggleSort('unrealizedPL')}>P/L{sortArrow('unrealizedPL')}</button></th></tr></thead><tbody>{sortedPositions.map((position) => <tr key={position.symbol}><td><strong>{position.symbol}</strong></td><td>{position.quote.currency}</td><td>{number(position.shares, 4)}</td><td>{money(position.averageCost, position.quote.currency)}</td><td>{money(position.costBasis, position.quote.currency)}</td><td>{money(position.marketValue, position.quote.currency)}</td><td className={valueClass(position.unrealizedPL)}>{money(position.unrealizedPL, position.quote.currency)} · {percent(position.unrealizedPLPercent)}</td></tr>)}</tbody></table></div> : <div className="empty-inline">No open positions yet.</div>}</div>
      <div className="panel"><h2>Currency distribution</h2><div className="currency-list">{Object.values(totals).map((total) => { const all = Object.values(totals).reduce((sum, item) => sum + item.value, 0); const share = all ? total.value / all * 100 : 0; return <div key={total.currency}><span><strong>{total.currency}</strong>{percent(share)}</span><div><i style={{ width: `${share}%` }} /></div><small>{money(total.value, total.currency)}</small></div> })}</div><p className="portfolio-note">Currency percentages compare nominal amounts and do not apply foreign-exchange conversion.</p></div>
    </div>
  </section>
}
