import { useEffect, useMemo, useState } from 'react'
import SymbolLink from '../components/SymbolLink'
import { savePortfolioSummaryToGitHub } from '../services/githubSync'
import { getMarketSnapshot } from '../services/marketData'
import { calculatePosition } from '../services/positionCalculator'
import { buildPortfolioSummaryExport } from '../services/portfolioSummaryExport'
import { getCashBalances, getTrades, getWatchlist, saveCashBalances } from '../services/storage'
import { calculateTradingStatistics } from '../services/tradeAnalytics'
import { money, number, percent, valueClass } from '../utils/formatters'
import { useI18n } from '../i18n'

export default function Portfolio() {
  const { t } = useI18n()
  const [positions, setPositions] = useState([])
  const [sort, setSort] = useState({ key: 'symbol', direction: 'asc' })
  const [cashBalances, setCashBalances] = useState(() => getCashBalances())
  const [portfolioSyncError, setPortfolioSyncError] = useState('')
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
  const cashCurrencies = useMemo(() => [...new Set(['USD', 'CAD', ...currencies, ...cashBalances.map((balance) => balance.currency)])].sort(), [cashBalances, currencies])
  const cashByCurrency = useMemo(() => Object.fromEntries(cashBalances.map((balance) => [balance.currency, balance.amount])), [cashBalances])
  const singleCurrency = currencies.length === 1 ? currencies[0] : null
  const moneyOrNA = (value) => value == null || !singleCurrency ? 'N/A' : money(value, singleCurrency)
  const currencyLines = (values) => {
    const entries = Object.entries(values || {})
    return entries.length ? entries.map(([currency, value]) => <em className={valueClass(value)} key={currency}>{currency} {money(value, currency)}</em>) : 'N/A'
  }
  const portfolioSummary = useMemo(() => buildPortfolioSummaryExport(positions, cashBalances, allTrades), [allTrades, cashBalances, positions])
  useEffect(() => {
    if (loading) return undefined
    const timer = setTimeout(() => {
      savePortfolioSummaryToGitHub(portfolioSummary)
        .then(() => setPortfolioSyncError(''))
        .catch((error) => setPortfolioSyncError(error.message || 'Portfolio summary sync failed.'))
    }, 1000)
    return () => clearTimeout(timer)
  }, [loading, positions.length, portfolioSummary])
  const updateCashBalance = (currency, rawValue) => {
    const amount = Number(rawValue)
    const next = cashCurrencies.map((item) => ({
      currency: item,
      amount: item === currency ? (Number.isFinite(amount) ? amount : 0) : (cashByCurrency[item] || 0),
    }))
    setCashBalances(next)
    saveCashBalances(next)
  }
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

  if (loading) return <div className="loading">{t('loadingPortfolio')}</div>
  return <section><div className="page-head"><div><p className="eyebrow">{t('portfolioEyebrow')}</p><h1>{t('portfolioTitle')}</h1><p>{t('portfolioSubtitle')}</p></div></div>
    <div className="portfolio-summary">{Object.values(totals).map((total) => <div className="panel portfolio-card" key={total.currency}><span>{total.currency} {t('portfolioTitle').toLowerCase()}</span><strong>{money(total.value, total.currency)}</strong><div><small>{t('totalCost')} {money(total.cost, total.currency)}</small><small className={valueClass(total.pl)}>{t('pl')} {money(total.pl, total.currency)} · {percent(total.cost ? total.pl / total.cost * 100 : 0)}</small></div></div>)}
      <div className="panel portfolio-card cash-card"><span>{t('availableCash')}</span><strong>{cashCurrencies.map((currency) => `${currency} ${money(cashByCurrency[currency] || 0, currency)}`).join(' · ')}</strong><p>{t('availableCashHint')}</p>{portfolioSyncError ? <small className="cash-sync-error">{portfolioSyncError}</small> : null}<div className="cash-input-grid">{cashCurrencies.map((currency) => <label key={currency}><small>{currency}</small><input type="number" step="0.01" value={cashByCurrency[currency] ?? ''} placeholder="0.00" onChange={(event) => updateCashBalance(currency, event.target.value)} /></label>)}</div></div>
    </div>
    <div className="panel trading-stats"><h2>{t('tradingStatistics')}</h2><div className="stats-grid">
      <span>{t('totalUnrealizedPL')}<strong className={valueClass(singleCurrency ? tradingStats.totalUnrealizedPL : 0)}>{singleCurrency ? moneyOrNA(tradingStats.totalUnrealizedPL) : currencyLines(tradingStats.unrealizedByCurrency)}</strong></span>
      <span>{t('totalRealizedPL')}<strong className={valueClass(singleCurrency ? tradingStats.totalRealizedPL : 0)}>{singleCurrency ? moneyOrNA(tradingStats.totalRealizedPL) : currencyLines(tradingStats.realizedByCurrency)}</strong></span>
      <span>{t('openPositions')}<strong>{tradingStats.openPositions}</strong></span>
      <span>{t('closedTrades')}<strong>{tradingStats.closedTrades || 'N/A'}</strong></span>
      <span>{t('bestRealizedTrade')}<strong>{tradingStats.bestRealizedTrade ? <><SymbolLink symbol={tradingStats.bestRealizedTrade.symbol} /> {money(tradingStats.bestRealizedTrade.realizedPL, tradingStats.bestRealizedTrade.currency || singleCurrency || 'USD')}</> : 'N/A'}</strong></span>
      <span>{t('worstRealizedTrade')}<strong>{tradingStats.worstRealizedTrade ? <><SymbolLink symbol={tradingStats.worstRealizedTrade.symbol} /> {money(tradingStats.worstRealizedTrade.realizedPL, tradingStats.worstRealizedTrade.currency || singleCurrency || 'USD')}</> : 'N/A'}</strong></span>
      <span>{t('averageRealizedPL')}<strong>{singleCurrency ? moneyOrNA(tradingStats.averageRealizedPL) : currencyLines(tradingStats.averageRealizedByCurrency)}</strong></span>
      <span>{t('winRate')}<strong>{tradingStats.winRate == null ? 'N/A' : `${tradingStats.winRate.toFixed(2)}%`}</strong></span>
      <span>{t('largestPosition')}<strong>{tradingStats.largestPosition ? <><SymbolLink symbol={tradingStats.largestPosition.symbol} /> {money(tradingStats.largestPosition.marketValue, tradingStats.largestPosition.quote.currency)}</> : 'N/A'}</strong></span>
      <span>{t('currencyExposure')}<strong>{Object.entries(tradingStats.currencyExposure).map(([currency, value]) => `${currency} ${money(value, currency)}`).join(' · ') || 'N/A'}</strong></span>
    </div><p className="portfolio-note">{t('mixedCurrencyNote')}</p></div>
    <div className="portfolio-grid">
      <div className="panel"><h2>{t('currentPositions')}</h2>{positions.length ? <div className="table-wrap"><table className="portfolio-table"><thead><tr><th><button onClick={() => toggleSort('symbol')}>{t('symbol')}{sortArrow('symbol')}</button></th><th><button onClick={() => toggleSort('currency')}>{t('currency')}{sortArrow('currency')}</button></th><th><button onClick={() => toggleSort('shares')}>{t('shares')}{sortArrow('shares')}</button></th><th><button onClick={() => toggleSort('averageCost')}>{t('avgCost')}{sortArrow('averageCost')}</button></th><th><button onClick={() => toggleSort('costBasis')}>{t('totalCost')}{sortArrow('costBasis')}</button></th><th><button onClick={() => toggleSort('marketValue')}>{t('marketValue')}{sortArrow('marketValue')}</button></th><th><button onClick={() => toggleSort('unrealizedPL')}>{t('pl')}{sortArrow('unrealizedPL')}</button></th></tr></thead><tbody>{sortedPositions.map((position) => <tr key={position.symbol}><td><strong><SymbolLink symbol={position.symbol} /></strong></td><td>{position.quote.currency}</td><td>{number(position.shares, 4)}</td><td>{money(position.averageCost, position.quote.currency)}</td><td>{money(position.costBasis, position.quote.currency)}</td><td>{money(position.marketValue, position.quote.currency)}</td><td className={valueClass(position.unrealizedPL)}>{money(position.unrealizedPL, position.quote.currency)} · {percent(position.unrealizedPLPercent)}</td></tr>)}</tbody></table></div> : <div className="empty-inline">{t('noOpenPositions')}</div>}</div>
      <div className="panel"><h2>{t('currencyDistribution')}</h2><div className="currency-list">{Object.values(totals).map((total) => { const all = Object.values(totals).reduce((sum, item) => sum + item.value, 0); const share = all ? total.value / all * 100 : 0; return <div key={total.currency}><span><strong>{total.currency}</strong>{percent(share)}</span><div><i style={{ width: `${share}%` }} /></div><small>{money(total.value, total.currency)}</small></div> })}</div><p className="portfolio-note">{t('currencyDistributionNote')}</p></div>
    </div>
  </section>
}
