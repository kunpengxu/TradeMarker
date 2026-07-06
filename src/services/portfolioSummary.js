import { getMarketSnapshot } from './marketData'
import { calculatePosition } from './positionCalculator'
import { calculateReservedCashByCurrency, getCashBalances, getOrderCommitments, getTrades, getWatchlist } from './storage'
import { calculateTradingStatistics } from './tradeAnalytics'

const round = (value, digits = 4) => {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : 0
}

const totalByCurrency = (positions) => positions.reduce((result, position) => {
  const currency = position.quote.currency || 'USD'
  const current = result[currency] || { currency, cost: 0, value: 0, pl: 0 }
  current.cost += position.costBasis
  current.value += position.marketValue
  current.pl += position.unrealizedPL
  result[currency] = current
  return result
}, {})

export function createPortfolioSummary(positions, { trades = getTrades(), orderCommitments = getOrderCommitments() } = {}) {
  const totals = totalByCurrency(positions)
  const currencies = Object.keys(totals)
  const tradingStats = calculateTradingStatistics(positions, trades)
  const cashBalances = getCashBalances()
  const cashByCurrency = Object.fromEntries(cashBalances.map((balance) => [balance.currency, balance.amount]))
  const reservedCashByCurrency = calculateReservedCashByCurrency(orderCommitments)
  const cashCurrencies = [...new Set(['USD', 'CAD', ...currencies, ...cashBalances.map((balance) => balance.currency), ...Object.keys(reservedCashByCurrency)])].sort()
  const cashAfterOrdersByCurrency = Object.fromEntries(cashCurrencies.map((currency) => [
    currency,
    (cashByCurrency[currency] || 0) - (reservedCashByCurrency[currency] || 0),
  ]))
  const totalNominalMarketValue = Object.values(totals).reduce((sum, item) => sum + item.value, 0)
  const singleCurrency = currencies.length === 1 ? currencies[0] : null

  return {
    generatedAt: new Date().toISOString(),
    source: 'TradeMarker',
    note: 'Currency totals are nominal by quote currency and are not converted through foreign exchange.',
    account: {
      cashBalances: cashCurrencies.map((currency) => ({
        currency,
        availableCash: round(cashByCurrency[currency]),
        reservedByPlacedOrders: round(reservedCashByCurrency[currency]),
        availableCashAfterPlacedOrders: round(cashAfterOrdersByCurrency[currency]),
      })),
    },
    totalsByCurrency: Object.values(totals).map((total) => ({
      currency: total.currency,
      totalCost: round(total.cost),
      marketValue: round(total.value),
      availableCash: round(cashByCurrency[total.currency]),
      reservedByPlacedOrders: round(reservedCashByCurrency[total.currency]),
      availableCashAfterPlacedOrders: round((cashByCurrency[total.currency] || 0) - (reservedCashByCurrency[total.currency] || 0)),
      marketValuePlusCash: round(total.value + (cashByCurrency[total.currency] || 0)),
      unrealizedPL: round(total.pl),
      unrealizedPLPercent: total.cost ? round((total.pl / total.cost) * 100) : 0,
      positionCount: positions.filter((position) => position.quote.currency === total.currency).length,
    })),
    currencyDistribution: Object.values(totals).map((total) => ({
      currency: total.currency,
      marketValue: round(total.value),
      nominalSharePercent: totalNominalMarketValue ? round((total.value / totalNominalMarketValue) * 100) : 0,
    })),
    tradingStatistics: {
      totalUnrealizedPL: singleCurrency ? round(tradingStats.totalUnrealizedPL) : null,
      totalUnrealizedPLByCurrency: Object.fromEntries(Object.entries(tradingStats.unrealizedByCurrency).map(([currency, value]) => [currency, round(value)])),
      totalRealizedPL: singleCurrency && tradingStats.totalRealizedPL != null ? round(tradingStats.totalRealizedPL) : null,
      totalRealizedPLByCurrency: Object.fromEntries(Object.entries(tradingStats.realizedByCurrency).map(([currency, value]) => [currency, round(value)])),
      openPositions: tradingStats.openPositions,
      closedTrades: tradingStats.closedTrades,
      bestRealizedTrade: tradingStats.bestRealizedTrade ? {
        symbol: tradingStats.bestRealizedTrade.symbol,
        side: tradingStats.bestRealizedTrade.side,
        price: tradingStats.bestRealizedTrade.price,
        shares: tradingStats.bestRealizedTrade.shares,
        date: tradingStats.bestRealizedTrade.date,
        realizedPL: round(tradingStats.bestRealizedTrade.realizedPL),
      } : null,
      worstRealizedTrade: tradingStats.worstRealizedTrade ? {
        symbol: tradingStats.worstRealizedTrade.symbol,
        side: tradingStats.worstRealizedTrade.side,
        price: tradingStats.worstRealizedTrade.price,
        shares: tradingStats.worstRealizedTrade.shares,
        date: tradingStats.worstRealizedTrade.date,
        realizedPL: round(tradingStats.worstRealizedTrade.realizedPL),
      } : null,
      averageRealizedPL: singleCurrency && tradingStats.averageRealizedPL != null ? round(tradingStats.averageRealizedPL) : null,
      averageRealizedPLByCurrency: Object.fromEntries(Object.entries(tradingStats.averageRealizedByCurrency).map(([currency, value]) => [currency, round(value)])),
      winRate: tradingStats.winRate == null ? null : round(tradingStats.winRate),
      largestPosition: tradingStats.largestPosition ? {
        symbol: tradingStats.largestPosition.symbol,
        currency: tradingStats.largestPosition.quote.currency,
        marketValue: round(tradingStats.largestPosition.marketValue),
      } : null,
      currencyExposure: Object.fromEntries(Object.entries(tradingStats.currencyExposure).map(([currency, value]) => [currency, round(value)])),
    },
    positions: positions.map((position) => ({
      symbol: position.symbol,
      currency: position.quote.currency,
      exchange: position.quote.exchange,
      source: position.quote.source,
      asOf: position.quote.asOf,
      latestPrice: position.quote.price,
      shares: round(position.shares, 6),
      averageCost: round(position.averageCost),
      totalCost: round(position.costBasis),
      marketValue: round(position.marketValue),
      unrealizedPL: round(position.unrealizedPL),
      unrealizedPLPercent: round(position.unrealizedPLPercent),
    })).sort((a, b) => a.symbol.localeCompare(b.symbol)),
  }
}

export async function buildPortfolioSummary(symbols = getWatchlist()) {
  const scope = [...new Set(symbols)]
  const scopeSet = new Set(scope)
  const scopedTrades = getTrades().filter((trade) => scopeSet.has(trade.symbol))
  const scopedOrderCommitments = getOrderCommitments().filter((order) => scopeSet.has(order.symbol))
  const rows = await Promise.all(scope.map(async (symbol) => {
    try {
      const snapshot = await getMarketSnapshot(symbol)
      const position = calculatePosition(getTrades(symbol), snapshot.quote.price)
      return position.shares > 0 ? { symbol, quote: snapshot.quote, ...position } : null
    } catch {
      return null
    }
  }))
  return createPortfolioSummary(rows.filter(Boolean), { trades: scopedTrades, orderCommitments: scopedOrderCommitments })
}
