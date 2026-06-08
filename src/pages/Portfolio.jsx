import { useEffect, useMemo, useState } from 'react'
import { savePortfolioSummaryToGitHub } from '../services/githubSync'
import { getMarketSnapshot } from '../services/marketData'
import { calculatePosition } from '../services/positionCalculator'
import { getTrades, getWatchlist } from '../services/storage'
import { calculateTradingStatistics } from '../services/tradeAnalytics'
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
  const allTrades = useMemo(() => getTrades(), [])
  const tradingStats = useMemo(() => calculateTradingStatistics(positions, allTrades), [positions, allTrades])
  const currencies = Object.keys(totals)
  const singleCurrency = currencies.length === 1 ? currencies[0] : null
  const moneyOrNA = (value) => value == null || !singleCurrency ? 'N/A' : money(value, singleCurrency)
  const currencyLines = (values) => {
    const entries = Object.entries(values || {})
    return entries.length ? entries.map(([currency, value]) => <em className={valueClass(value)} key={currency}>{currency} {money(value, currency)}</em>) : 'N/A'
  }
  const portfolioSummary = useMemo(() => {
    const totalNominalMarketValue = Object.values(totals).reduce((sum, item) => sum + item.value, 0)
    return {
      generatedAt: new Date().toISOString(),
      source: 'TradeMarker',
      note: 'Currency totals are nominal by quote currency and are not converted through foreign exchange.',
      totalsByCurrency: Object.values(totals).map((total) => ({
        currency: total.currency,
        totalCost: Number(total.cost.toFixed(4)),
        marketValue: Number(total.value.toFixed(4)),
        unrealizedPL: Number(total.pl.toFixed(4)),
        unrealizedPLPercent: total.cost ? Number(((total.pl / total.cost) * 100).toFixed(4)) : 0,
        positionCount: positions.filter((position) => position.quote.currency === total.currency).length,
      })),
      currencyDistribution: Object.values(totals).map((total) => ({
        currency: total.currency,
        marketValue: Number(total.value.toFixed(4)),
        nominalSharePercent: totalNominalMarketValue ? Number(((total.value / totalNominalMarketValue) * 100).toFixed(4)) : 0,
      })),
      tradingStatistics: {
        totalUnrealizedPL: singleCurrency ? Number(tradingStats.totalUnrealizedPL.toFixed(4)) : null,
        totalUnrealizedPLByCurrency: Object.fromEntries(Object.entries(tradingStats.unrealizedByCurrency).map(([currency, value]) => [currency, Number(value.toFixed(4))])),
        totalRealizedPL: singleCurrency && tradingStats.totalRealizedPL != null ? Number(tradingStats.totalRealizedPL.toFixed(4)) : null,
        totalRealizedPLByCurrency: Object.fromEntries(Object.entries(tradingStats.realizedByCurrency).map(([currency, value]) => [currency, Number(value.toFixed(4))])),
        openPositions: tradingStats.openPositions,
        closedTrades: tradingStats.closedTrades,
        bestRealizedTrade: tradingStats.bestRealizedTrade ? {
          symbol: tradingStats.bestRealizedTrade.symbol,
          side: tradingStats.bestRealizedTrade.side,
          price: tradingStats.bestRealizedTrade.price,
          shares: tradingStats.bestRealizedTrade.shares,
          date: tradingStats.bestRealizedTrade.date,
          realizedPL: Number(tradingStats.bestRealizedTrade.realizedPL.toFixed(4)),
        } : null,
        worstRealizedTrade: tradingStats.worstRealizedTrade ? {
          symbol: tradingStats.worstRealizedTrade.symbol,
          side: tradingStats.worstRealizedTrade.side,
          price: tradingStats.worstRealizedTrade.price,
          shares: tradingStats.worstRealizedTrade.shares,
          date: tradingStats.worstRealizedTrade.date,
          realizedPL: Number(tradingStats.worstRealizedTrade.realizedPL.toFixed(4)),
        } : null,
        averageRealizedPL: singleCurrency && tradingStats.averageRealizedPL != null ? Number(tradingStats.averageRealizedPL.toFixed(4)) : null,
        averageRealizedPLByCurrency: Object.fromEntries(Object.entries(tradingStats.averageRealizedByCurrency).map(([currency, value]) => [currency, Number(value.toFixed(4))])),
        winRate: tradingStats.winRate == null ? null : Number(tradingStats.winRate.toFixed(4)),
        largestPosition: tradingStats.largestPosition ? {
          symbol: tradingStats.largestPosition.symbol,
          currency: tradingStats.largestPosition.quote.currency,
          marketValue: Number(tradingStats.largestPosition.marketValue.toFixed(4)),
        } : null,
        currencyExposure: Object.fromEntries(Object.entries(tradingStats.currencyExposure).map(([currency, value]) => [currency, Number(value.toFixed(4))])),
      },
      positions: positions.map((position) => ({
        symbol: position.symbol,
        currency: position.quote.currency,
        exchange: position.quote.exchange,
        source: position.quote.source,
        asOf: position.quote.asOf,
        latestPrice: position.quote.price,
        shares: Number(position.shares.toFixed(6)),
        averageCost: Number(position.averageCost.toFixed(4)),
        totalCost: Number(position.costBasis.toFixed(4)),
        marketValue: Number(position.marketValue.toFixed(4)),
        unrealizedPL: Number(position.unrealizedPL.toFixed(4)),
        unrealizedPLPercent: Number(position.unrealizedPLPercent.toFixed(4)),
      })).sort((a, b) => a.symbol.localeCompare(b.symbol)),
    }
  }, [positions, singleCurrency, totals, tradingStats])
  useEffect(() => {
    if (!loading && positions.length) savePortfolioSummaryToGitHub(portfolioSummary).catch(() => {})
  }, [loading, positions.length, portfolioSummary])
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
    <div className="panel trading-stats"><h2>Trading Statistics</h2><div className="stats-grid">
      <span>Total unrealized P/L<strong className={valueClass(singleCurrency ? tradingStats.totalUnrealizedPL : 0)}>{singleCurrency ? moneyOrNA(tradingStats.totalUnrealizedPL) : currencyLines(tradingStats.unrealizedByCurrency)}</strong></span>
      <span>Total realized P/L<strong className={valueClass(singleCurrency ? tradingStats.totalRealizedPL : 0)}>{singleCurrency ? moneyOrNA(tradingStats.totalRealizedPL) : currencyLines(tradingStats.realizedByCurrency)}</strong></span>
      <span>Open positions<strong>{tradingStats.openPositions}</strong></span>
      <span>Closed trades<strong>{tradingStats.closedTrades || 'N/A'}</strong></span>
      <span>Best realized trade<strong>{tradingStats.bestRealizedTrade ? `${tradingStats.bestRealizedTrade.symbol} ${money(tradingStats.bestRealizedTrade.realizedPL, tradingStats.bestRealizedTrade.currency || singleCurrency || 'USD')}` : 'N/A'}</strong></span>
      <span>Worst realized trade<strong>{tradingStats.worstRealizedTrade ? `${tradingStats.worstRealizedTrade.symbol} ${money(tradingStats.worstRealizedTrade.realizedPL, tradingStats.worstRealizedTrade.currency || singleCurrency || 'USD')}` : 'N/A'}</strong></span>
      <span>Average realized P/L<strong>{singleCurrency ? moneyOrNA(tradingStats.averageRealizedPL) : currencyLines(tradingStats.averageRealizedByCurrency)}</strong></span>
      <span>Win rate<strong>{tradingStats.winRate == null ? 'N/A' : `${tradingStats.winRate.toFixed(2)}%`}</strong></span>
      <span>Largest position<strong>{tradingStats.largestPosition ? `${tradingStats.largestPosition.symbol} ${money(tradingStats.largestPosition.marketValue, tradingStats.largestPosition.quote.currency)}` : 'N/A'}</strong></span>
      <span>Currency exposure<strong>{Object.entries(tradingStats.currencyExposure).map(([currency, value]) => `${currency} ${money(value, currency)}`).join(' · ') || 'N/A'}</strong></span>
    </div><p className="portfolio-note">Mixed-currency totals are shown by quote currency. TradeMarker does not convert FX rates.</p></div>
    <div className="portfolio-grid">
      <div className="panel"><h2>Current positions</h2>{positions.length ? <div className="table-wrap"><table className="portfolio-table"><thead><tr><th><button onClick={() => toggleSort('symbol')}>Symbol{sortArrow('symbol')}</button></th><th><button onClick={() => toggleSort('currency')}>Currency{sortArrow('currency')}</button></th><th><button onClick={() => toggleSort('shares')}>Shares{sortArrow('shares')}</button></th><th><button onClick={() => toggleSort('averageCost')}>Avg cost{sortArrow('averageCost')}</button></th><th><button onClick={() => toggleSort('costBasis')}>Total cost{sortArrow('costBasis')}</button></th><th><button onClick={() => toggleSort('marketValue')}>Market value{sortArrow('marketValue')}</button></th><th><button onClick={() => toggleSort('unrealizedPL')}>P/L{sortArrow('unrealizedPL')}</button></th></tr></thead><tbody>{sortedPositions.map((position) => <tr key={position.symbol}><td><strong>{position.symbol}</strong></td><td>{position.quote.currency}</td><td>{number(position.shares, 4)}</td><td>{money(position.averageCost, position.quote.currency)}</td><td>{money(position.costBasis, position.quote.currency)}</td><td>{money(position.marketValue, position.quote.currency)}</td><td className={valueClass(position.unrealizedPL)}>{money(position.unrealizedPL, position.quote.currency)} · {percent(position.unrealizedPLPercent)}</td></tr>)}</tbody></table></div> : <div className="empty-inline">No open positions yet.</div>}</div>
      <div className="panel"><h2>Currency distribution</h2><div className="currency-list">{Object.values(totals).map((total) => { const all = Object.values(totals).reduce((sum, item) => sum + item.value, 0); const share = all ? total.value / all * 100 : 0; return <div key={total.currency}><span><strong>{total.currency}</strong>{percent(share)}</span><div><i style={{ width: `${share}%` }} /></div><small>{money(total.value, total.currency)}</small></div> })}</div><p className="portfolio-note">Currency percentages compare nominal amounts and do not apply foreign-exchange conversion.</p></div>
    </div>
  </section>
}
