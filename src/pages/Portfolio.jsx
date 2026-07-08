import { useEffect, useMemo, useState } from 'react'
import SymbolLink from '../components/SymbolLink'
import { savePortfolioSummaryToGitHub } from '../services/githubSync'
import { getMarketSnapshot } from '../services/marketData'
import { createPortfolioSummary } from '../services/portfolioSummary'
import { calculatePosition } from '../services/positionCalculator'
import { calculateReservedCashByCurrency, getCashBalances, getOrderCommitments, getTrades, getWatchlist, getWatchlistGroups, saveCashBalances } from '../services/storage'
import { calculateTradingStatistics } from '../services/tradeAnalytics'
import { money, number, percent, valueClass } from '../utils/formatters'
import { useI18n } from '../i18n'

export default function Portfolio() {
  const { t } = useI18n()
  const [positions, setPositions] = useState([])
  const [sort, setSort] = useState({ key: 'symbol', direction: 'asc' })
  const [cashBalances, setCashBalances] = useState(() => getCashBalances())
  const [orderCommitments, setOrderCommitments] = useState(() => getOrderCommitments())
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const syncCashContext = () => {
      setCashBalances(getCashBalances())
      setOrderCommitments(getOrderCommitments())
    }
    window.addEventListener('trademarker:data-changed', syncCashContext)
    window.addEventListener('trademarker:data-imported', syncCashContext)
    return () => {
      window.removeEventListener('trademarker:data-changed', syncCashContext)
      window.removeEventListener('trademarker:data-imported', syncCashContext)
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
  const allTrades = useMemo(() => getTrades(), [])
  const tradingStats = useMemo(() => calculateTradingStatistics(positions, allTrades), [positions, allTrades])
  const totals = useMemo(() => {
    const result = positions.reduce((rows, position) => {
      const currency = position.quote.currency || 'USD'
      const current = rows[currency] || { currency, cost: 0, value: 0, pl: 0, realizedPL: 0, realizedCostBasis: 0, totalPL: 0, totalReturnPercent: 0 }
      current.cost += position.costBasis
      current.value += position.marketValue
      current.pl += position.unrealizedPL
      rows[currency] = current
      return rows
    }, {})
    const realizedCurrencies = new Set([
      ...Object.keys(tradingStats.realizedByCurrency || {}),
      ...Object.keys(tradingStats.realizedCostBasisByCurrency || {}),
    ])
    realizedCurrencies.forEach((currency) => {
      result[currency] ||= { currency, cost: 0, value: 0, pl: 0, realizedPL: 0, realizedCostBasis: 0, totalPL: 0, totalReturnPercent: 0 }
    })
    Object.values(result).forEach((total) => {
      total.realizedPL = tradingStats.realizedByCurrency?.[total.currency] || 0
      total.realizedCostBasis = tradingStats.realizedCostBasisByCurrency?.[total.currency] || 0
      total.totalPL = total.pl + total.realizedPL
      const totalCostBase = total.cost + total.realizedCostBasis
      total.totalReturnPercent = totalCostBase ? total.totalPL / totalCostBase * 100 : 0
    })
    return result
  }, [positions, tradingStats])
  const currencies = Object.keys(totals)
  const cashByCurrency = useMemo(() => Object.fromEntries(cashBalances.map((balance) => [balance.currency, balance.amount])), [cashBalances])
  const reservedCashByCurrency = useMemo(() => calculateReservedCashByCurrency(orderCommitments), [orderCommitments])
  const cashCurrencies = useMemo(() => [...new Set(['USD', 'CAD', ...currencies, ...cashBalances.map((balance) => balance.currency), ...Object.keys(reservedCashByCurrency)])].sort(), [cashBalances, currencies, reservedCashByCurrency])
  const cashAfterOrdersByCurrency = useMemo(() => Object.fromEntries(cashCurrencies.map((currency) => [currency, (cashByCurrency[currency] || 0) - (reservedCashByCurrency[currency] || 0)])), [cashByCurrency, cashCurrencies, reservedCashByCurrency])
  const singleCurrency = currencies.length === 1 ? currencies[0] : null
  const moneyOrNA = (value) => value == null || !singleCurrency ? 'N/A' : money(value, singleCurrency)
  const currencyLines = (values) => {
    const entries = Object.entries(values || {})
    return entries.length ? entries.map(([currency, value]) => <em className={valueClass(value)} key={currency}>{currency} {money(value, currency)}</em>) : 'N/A'
  }
  const portfolioSummary = useMemo(() => createPortfolioSummary(positions), [positions, cashBalances, orderCommitments])
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
  const groupDisplayName = (group) => {
    const key = group.id === 'long-core' ? 'groupLongCore'
      : group.id === 'long-satellite' ? 'groupLongSatellite'
        : group.id === 'swing' ? 'groupSwing'
          : group.id === 'leveraged-swing' ? 'groupLeveragedSwing'
            : null
    return key ? t(key) : group.name
  }
  const nominalPortfolioValue = Object.values(totals).reduce((sum, item) => sum + item.value, 0)
  const positionBySymbol = useMemo(() => new Map(positions.map((position) => [position.symbol, position])), [positions])
  const groupSummaries = useMemo(() => getWatchlistGroups().map((group) => {
    const groupPositions = group.symbols.map((symbol) => positionBySymbol.get(symbol)).filter(Boolean)
    const marketValue = groupPositions.reduce((sum, position) => sum + position.marketValue, 0)
    const costBasis = groupPositions.reduce((sum, position) => sum + position.costBasis, 0)
    const unrealizedPL = groupPositions.reduce((sum, position) => sum + position.unrealizedPL, 0)
    const currencies = [...new Set(groupPositions.map((position) => position.quote.currency || 'USD'))]
    return {
      ...group,
      openPositions: groupPositions.length,
      marketValue,
      costBasis,
      unrealizedPL,
      unrealizedPLPercent: costBasis ? unrealizedPL / costBasis * 100 : 0,
      currency: currencies.length === 1 ? currencies[0] : null,
    }
  }).filter((group) => group.symbols.length || group.openPositions), [positionBySymbol])
  const concentrationStats = useMemo(() => {
    const sortedByValue = [...positions].sort((a, b) => b.marketValue - a.marketValue)
    const topFiveValue = sortedByValue.slice(0, 5).reduce((sum, position) => sum + position.marketValue, 0)
    const leveragedGroup = groupSummaries.find((group) => group.id === 'leveraged-swing')
    const bestPosition = positions.reduce((best, position) => !best || position.unrealizedPL > best.unrealizedPL ? position : best, null)
    const worstPosition = positions.reduce((worst, position) => !worst || position.unrealizedPL < worst.unrealizedPL ? position : worst, null)
    return {
      topFiveShare: nominalPortfolioValue ? topFiveValue / nominalPortfolioValue * 100 : 0,
      largest: sortedByValue[0] || null,
      topPositions: sortedByValue.slice(0, 8).map((position) => ({
        ...position,
        share: nominalPortfolioValue ? position.marketValue / nominalPortfolioValue * 100 : 0,
      })),
      leveragedShare: nominalPortfolioValue && leveragedGroup ? leveragedGroup.marketValue / nominalPortfolioValue * 100 : 0,
      bestPosition,
      worstPosition,
    }
  }, [groupSummaries, nominalPortfolioValue, positions])
  const cashDisplay = cashCurrencies.map((currency) => `${currency} ${money(cashByCurrency[currency] || 0, currency)}`).join(' · ')
  const cashAfterOrdersDisplay = cashCurrencies.map((currency) => `${currency} ${money(cashAfterOrdersByCurrency[currency] || 0, currency)}`).join(' · ')
  const reservedCashDisplay = cashCurrencies.map((currency) => `${currency} ${money(reservedCashByCurrency[currency] || 0, currency)}`).join(' · ')
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
    <div className="portfolio-summary">{Object.values(totals).map((total) => <div className={`panel portfolio-card portfolio-overview-card ${valueClass(total.totalPL || total.pl)}`} key={total.currency}>
      <span>{total.currency} {t('portfolioOverview')}</span>
      <strong>{money(total.value, total.currency)}</strong>
      <div className="portfolio-overview-metrics">
        <small>{t('totalCost')} <b>{money(total.cost, total.currency)}</b></small>
        <small className={valueClass(total.pl)}>{t('unrealizedPL')} <b>{money(total.pl, total.currency)} · {percent(total.cost ? total.pl / total.cost * 100 : 0)}</b></small>
        <small className={valueClass(total.realizedPL)}>{t('soldPL')} <b>{money(total.realizedPL, total.currency)}</b></small>
        <small className={valueClass(total.totalPL)}>{t('totalPL')} <b>{money(total.totalPL, total.currency)} · {percent(total.totalReturnPercent)}</b></small>
      </div>
    </div>)}
      <details className="panel portfolio-card cash-card"><summary><span>{t('availableCash')}</span><strong>{cashDisplay}</strong><small className="cash-after-orders"><span>{t('cashAfterOrders')}</span><b>{cashAfterOrdersDisplay}</b></small></summary><p>{t('availableCashHint')}</p><p className="portfolio-note">{t('reservedByOrders')}: {reservedCashDisplay}</p><div className="cash-input-grid">{cashCurrencies.map((currency) => <label key={currency}><small>{currency}</small><input type="number" step="0.01" value={cashByCurrency[currency] ?? ''} placeholder="0.00" onChange={(event) => updateCashBalance(currency, event.target.value)} /></label>)}</div></details>
    </div>
    <div className="panel trading-stats"><h2>{t('tradingStatistics')}</h2><div className="stats-grid grouped-stats">{statGroups.map(([group, rows]) => <section className="stat-group" key={group}><h3>{group}</h3>{rows.map(([label, value]) => <span key={label}>{label}{value}</span>)}</section>)}</div><p className="portfolio-note">{t('mixedCurrencyNote')}</p></div>
    <div className="panel portfolio-risk-panel"><h2>{t('riskConcentration')}</h2><div className="risk-card-grid">
      <span>{t('topFiveExposure')}<strong>{number(concentrationStats.topFiveShare)}%</strong></span>
      <span>{t('largestPosition')}{concentrationStats.largest ? <strong><SymbolLink symbol={concentrationStats.largest.symbol} /> {money(concentrationStats.largest.marketValue, concentrationStats.largest.quote.currency)}</strong> : <strong>N/A</strong>}</span>
      <span>{t('leveragedExposure')}<strong>{number(concentrationStats.leveragedShare)}%</strong></span>
      <span>{t('bestOpenPosition')}{concentrationStats.bestPosition ? <strong className={valueClass(concentrationStats.bestPosition.unrealizedPL)}><SymbolLink symbol={concentrationStats.bestPosition.symbol} /> {money(concentrationStats.bestPosition.unrealizedPL, concentrationStats.bestPosition.quote.currency)}</strong> : <strong>N/A</strong>}</span>
      <span>{t('worstOpenPosition')}{concentrationStats.worstPosition ? <strong className={valueClass(concentrationStats.worstPosition.unrealizedPL)}><SymbolLink symbol={concentrationStats.worstPosition.symbol} /> {money(concentrationStats.worstPosition.unrealizedPL, concentrationStats.worstPosition.quote.currency)}</strong> : <strong>N/A</strong>}</span>
    </div>{concentrationStats.topPositions.length ? <div className="risk-bar-list">{concentrationStats.topPositions.map((position) => <div key={position.symbol}><span><SymbolLink symbol={position.symbol} /><b>{percent(position.share)}</b></span><i style={{ width: `${Math.min(100, position.share)}%` }} /></div>)}</div> : null}</div>
    <div className="panel portfolio-group-panel"><h2>{t('groupExposure')}</h2><div className="portfolio-group-grid">{groupSummaries.map((group) => <article className={valueClass(group.unrealizedPL)} key={group.id}>
      <span>{groupDisplayName(group)}</span>
      <strong>{group.currency ? money(group.marketValue, group.currency) : `${number(group.openPositions)} ${t('openPositions')}`}</strong>
      <small>{t('openPositions')} {group.openPositions} · {t('pl')} <b className={valueClass(group.unrealizedPL)}>{group.currency ? `${money(group.unrealizedPL, group.currency)} · ${percent(group.unrealizedPLPercent)}` : 'Mixed'}</b></small>
    </article>)}</div></div>
    <div className="portfolio-grid">
      <div className="panel positions-panel"><h2>{t('currentPositions')}</h2>{positions.length ? <div className="table-wrap"><table className="portfolio-table"><thead><tr><th><button className={sort.key === 'symbol' ? 'active' : ''} onClick={() => toggleSort('symbol')}>{t('symbol')}{sortArrow('symbol')}</button></th><th><button className={sort.key === 'currency' ? 'active' : ''} onClick={() => toggleSort('currency')}>{t('currency')}{sortArrow('currency')}</button></th><th><button className={sort.key === 'shares' ? 'active' : ''} onClick={() => toggleSort('shares')}>{t('shares')}{sortArrow('shares')}</button></th><th><button className={sort.key === 'averageCost' ? 'active' : ''} onClick={() => toggleSort('averageCost')}>{t('avgCost')}{sortArrow('averageCost')}</button></th><th><button className={sort.key === 'costBasis' ? 'active' : ''} onClick={() => toggleSort('costBasis')}>{t('totalCost')}{sortArrow('costBasis')}</button></th><th><button className={sort.key === 'marketValue' ? 'active' : ''} onClick={() => toggleSort('marketValue')}>{t('marketValue')}{sortArrow('marketValue')}</button></th><th><button className={sort.key === 'unrealizedPL' ? 'active' : ''} onClick={() => toggleSort('unrealizedPL')}>{t('pl')}{sortArrow('unrealizedPL')}</button></th></tr></thead><tbody>{sortedPositions.map((position) => <tr className={`position-row ${valueClass(position.unrealizedPL)}`} key={position.symbol}><td><strong><SymbolLink symbol={position.symbol} /></strong></td><td>{position.quote.currency}</td><td>{number(position.shares, 4)}</td><td>{money(position.averageCost, position.quote.currency)}</td><td>{money(position.costBasis, position.quote.currency)}</td><td>{money(position.marketValue, position.quote.currency)}</td><td className={valueClass(position.unrealizedPL)}><strong>{money(position.unrealizedPL, position.quote.currency)}</strong><small>{percent(position.unrealizedPLPercent)}</small></td></tr>)}</tbody></table></div> : <div className="empty-inline">{t('noOpenPositions')}</div>}</div>
      <div className="panel exposure-panel"><h2>{t('currencyDistribution')}</h2><div className="currency-list">{Object.values(totals).map((total) => { const share = nominalPortfolioValue ? total.value / nominalPortfolioValue * 100 : 0; return <div className="currency-exposure-row" key={total.currency}><span><strong>{total.currency}</strong><b>{percent(share)}</b></span><div><i className={`currency-${total.currency.toLowerCase()}`} style={{ width: `${share}%` }} /></div><small>{money(total.value, total.currency)}</small></div> })}</div><p className="portfolio-note">{t('currencyDistributionNote')}</p></div>
    </div>
  </section>
}
