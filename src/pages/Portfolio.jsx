import { useEffect, useMemo, useState } from 'react'
import SymbolLink from '../components/SymbolLink'
import { savePortfolioSummaryToGitHub } from '../services/githubSync'
import { getMarketSnapshot } from '../services/marketData'
import { calculatePosition } from '../services/positionCalculator'
import { getCashBalances, getTrades, getWatchlist, saveCashBalances } from '../services/storage'
import { calculateTradingStatistics } from '../services/tradeAnalytics'
import { money, number, percent, valueClass } from '../utils/formatters'
import { useI18n } from '../i18n'

export default function Portfolio() {
  const { t } = useI18n()
  const [positions, setPositions] = useState([])
  const [sort, setSort] = useState({ key: 'symbol', direction: 'asc' })
  const [cashBalances, setCashBalances] = useState(() => getCashBalances())
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const syncCashBalances = () => setCashBalances(getCashBalances())
    window.addEventListener('trademarker:data-changed', syncCashBalances)
    window.addEventListener('trademarker:data-imported', syncCashBalances)
    return () => {
      window.removeEventListener('trademarker:data-changed', syncCashBalances)
      window.removeEventListener('trademarker:data-imported', syncCashBalances)
    }
  }, [])
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
  const portfolioSummary = useMemo(() => {
    const totalNominalMarketValue = Object.values(totals).reduce((sum, item) => sum + item.value, 0)
    return {
      generatedAt: new Date().toISOString(),
      source: 'TradeMarker',
      note: 'Currency totals are nominal by quote currency and are not converted through foreign exchange.',
      account: {
        cashBalances: cashBalances.map((balance) => ({
          currency: balance.currency,
          availableCash: Number(balance.amount.toFixed(4)),
        })),
      },
      totalsByCurrency: Object.values(totals).map((total) => ({
        currency: total.currency,
        totalCost: Number(total.cost.toFixed(4)),
        marketValue: Number(total.value.toFixed(4)),
        availableCash: Number((cashByCurrency[total.currency] || 0).toFixed(4)),
        marketValuePlusCash: Number((total.value + (cashByCurrency[total.currency] || 0)).toFixed(4)),
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
  }, [cashBalances, cashByCurrency, positions, singleCurrency, totals, tradingStats])
  useEffect(() => {
    if (!loading) savePortfolioSummaryToGitHub(portfolioSummary).catch(() => {})
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
  const nominalPortfolioValue = Object.values(totals).reduce((sum, item) => sum + item.value, 0)
  const cashDisplay = cashCurrencies.map((currency) => `${currency} ${money(cashByCurrency[currency] || 0, currency)}`).join(' · ')
  const statGroups = [
    [t('performance'), [
      [t('totalUnrealizedPL'), <strong className={valueClass(singleCurrency ? tradingStats.totalUnrealizedPL : 0)}>{singleCurrency ? moneyOrNA(tradingStats.totalUnrealizedPL) : currencyLines(tradingStats.unrealizedByCurrency)}</strong>],
      [t('totalRealizedPL'), <strong className={valueClass(singleCurrency ? tradingStats.totalRealizedPL : 0)}>{singleCurrency ? moneyOrNA(tradingStats.totalRealizedPL) : currencyLines(tradingStats.realizedByCurrency)}</strong>],
      [t('averageRealizedPL'), <strong>{singleCurrency ? moneyOrNA(tradingStats.averageRealizedPL) : currencyLines(tradingStats.averageRealizedByCurrency)}</strong>],
    ]],
    [t('activity'), [
      [t('openPositions'), <strong>{tradingStats.openPositions}</strong>],
      [t('closedTrades'), <strong>{tradingStats.closedTrades || 'N/A'}</strong>],
      [t('winRate'), <strong>{tradingStats.winRate == null ? 'N/A' : `${tradingStats.winRate.toFixed(2)}%`}</strong>],
    ]],
    [t('exposure'), [
      [t('largestPosition'), <strong>{tradingStats.largestPosition ? <><SymbolLink symbol={tradingStats.largestPosition.symbol} /> {money(tradingStats.largestPosition.marketValue, tradingStats.largestPosition.quote.currency)}</> : 'N/A'}</strong>],
      [t('bestRealizedTrade'), <strong>{tradingStats.bestRealizedTrade ? <><SymbolLink symbol={tradingStats.bestRealizedTrade.symbol} /> {money(tradingStats.bestRealizedTrade.realizedPL, tradingStats.bestRealizedTrade.currency || singleCurrency || 'USD')}</> : 'N/A'}</strong>],
      [t('worstRealizedTrade'), <strong>{tradingStats.worstRealizedTrade ? <><SymbolLink symbol={tradingStats.worstRealizedTrade.symbol} /> {money(tradingStats.worstRealizedTrade.realizedPL, tradingStats.worstRealizedTrade.currency || singleCurrency || 'USD')}</> : 'N/A'}</strong>],
      [t('currencyExposure'), <strong>{Object.entries(tradingStats.currencyExposure).map(([currency, value]) => `${currency} ${money(value, currency)}`).join(' · ') || 'N/A'}</strong>],
    ]],
  ]

  if (loading) return <div className="loading">{t('loadingPortfolio')}</div>
  return <section><div className="page-head"><div><p className="eyebrow">{t('portfolioEyebrow')}</p><h1>{t('portfolioTitle')}</h1><p>{t('portfolioSubtitle')}</p></div></div>
    <div className="portfolio-summary">{Object.values(totals).map((total) => <div className={`panel portfolio-card portfolio-overview-card ${valueClass(total.pl)}`} key={total.currency}><span>{total.currency} {t('portfolioOverview')}</span><strong>{money(total.value, total.currency)}</strong><div><small>{t('totalCost')} <b>{money(total.cost, total.currency)}</b></small><small className={valueClass(total.pl)}>{t('pl')} <b>{money(total.pl, total.currency)} · {percent(total.cost ? total.pl / total.cost * 100 : 0)}</b></small></div></div>)}
      <details className="panel portfolio-card cash-card"><summary><span>{t('availableCash')}</span><strong>{cashDisplay}</strong></summary><p>{t('availableCashHint')}</p><div className="cash-input-grid">{cashCurrencies.map((currency) => <label key={currency}><small>{currency}</small><input type="number" step="0.01" value={cashByCurrency[currency] ?? ''} placeholder="0.00" onChange={(event) => updateCashBalance(currency, event.target.value)} /></label>)}</div></details>
    </div>
    <div className="panel trading-stats"><h2>{t('tradingStatistics')}</h2><div className="stats-grid grouped-stats">{statGroups.map(([group, rows]) => <section className="stat-group" key={group}><h3>{group}</h3>{rows.map(([label, value]) => <span key={label}>{label}{value}</span>)}</section>)}</div><p className="portfolio-note">{t('mixedCurrencyNote')}</p></div>
    <div className="portfolio-grid">
      <div className="panel positions-panel"><h2>{t('currentPositions')}</h2>{positions.length ? <div className="table-wrap"><table className="portfolio-table"><thead><tr><th><button className={sort.key === 'symbol' ? 'active' : ''} onClick={() => toggleSort('symbol')}>{t('symbol')}{sortArrow('symbol')}</button></th><th><button className={sort.key === 'currency' ? 'active' : ''} onClick={() => toggleSort('currency')}>{t('currency')}{sortArrow('currency')}</button></th><th><button className={sort.key === 'shares' ? 'active' : ''} onClick={() => toggleSort('shares')}>{t('shares')}{sortArrow('shares')}</button></th><th><button className={sort.key === 'averageCost' ? 'active' : ''} onClick={() => toggleSort('averageCost')}>{t('avgCost')}{sortArrow('averageCost')}</button></th><th><button className={sort.key === 'costBasis' ? 'active' : ''} onClick={() => toggleSort('costBasis')}>{t('totalCost')}{sortArrow('costBasis')}</button></th><th><button className={sort.key === 'marketValue' ? 'active' : ''} onClick={() => toggleSort('marketValue')}>{t('marketValue')}{sortArrow('marketValue')}</button></th><th><button className={sort.key === 'unrealizedPL' ? 'active' : ''} onClick={() => toggleSort('unrealizedPL')}>{t('pl')}{sortArrow('unrealizedPL')}</button></th></tr></thead><tbody>{sortedPositions.map((position) => <tr className={`position-row ${valueClass(position.unrealizedPL)}`} key={position.symbol}><td><strong><SymbolLink symbol={position.symbol} /></strong></td><td>{position.quote.currency}</td><td>{number(position.shares, 4)}</td><td>{money(position.averageCost, position.quote.currency)}</td><td>{money(position.costBasis, position.quote.currency)}</td><td>{money(position.marketValue, position.quote.currency)}</td><td className={valueClass(position.unrealizedPL)}><strong>{money(position.unrealizedPL, position.quote.currency)}</strong><small>{percent(position.unrealizedPLPercent)}</small></td></tr>)}</tbody></table></div> : <div className="empty-inline">{t('noOpenPositions')}</div>}</div>
      <div className="panel exposure-panel"><h2>{t('currencyDistribution')}</h2><div className="currency-list">{Object.values(totals).map((total) => { const share = nominalPortfolioValue ? total.value / nominalPortfolioValue * 100 : 0; return <div className="currency-exposure-row" key={total.currency}><span><strong>{total.currency}</strong><b>{percent(share)}</b></span><div><i className={`currency-${total.currency.toLowerCase()}`} style={{ width: `${share}%` }} /></div><small>{money(total.value, total.currency)}</small></div> })}</div><p className="portfolio-note">{t('currencyDistributionNote')}</p></div>
    </div>
  </section>
}
