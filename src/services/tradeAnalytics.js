import { calculatePosition, calculateRealizedPLByTrade } from './positionCalculator'
import { getTrades } from './storage'

export const calculateTradingStatistics = (positions, trades) => {
  const realizedByTrade = calculateRealizedPLByTrade(trades)
  const realizedTrades = trades.filter((trade) => trade.side === 'SELL' && realizedByTrade.has(trade.id)).map((trade) => ({
    ...trade,
    realizedPL: realizedByTrade.get(trade.id),
  }))
  const totalRealizedPL = realizedTrades.reduce((sum, trade) => sum + trade.realizedPL, 0)
  const totalUnrealizedPL = positions.reduce((sum, position) => sum + position.unrealizedPL, 0)
  const largestPosition = positions.reduce((largest, position) => !largest || position.marketValue > largest.marketValue ? position : largest, null)
  const currencyExposure = positions.reduce((result, position) => {
    const currency = position.quote?.currency || 'USD'
    result[currency] = (result[currency] || 0) + position.marketValue
    return result
  }, {})

  return {
    totalUnrealizedPL,
    totalRealizedPL: realizedTrades.length ? totalRealizedPL : null,
    openPositions: positions.length,
    closedTrades: realizedTrades.length,
    bestRealizedTrade: realizedTrades.length ? realizedTrades.reduce((best, trade) => trade.realizedPL > best.realizedPL ? trade : best, realizedTrades[0]) : null,
    worstRealizedTrade: realizedTrades.length ? realizedTrades.reduce((worst, trade) => trade.realizedPL < worst.realizedPL ? trade : worst, realizedTrades[0]) : null,
    averageRealizedPL: realizedTrades.length ? totalRealizedPL / realizedTrades.length : null,
    winRate: realizedTrades.length ? realizedTrades.filter((trade) => trade.realizedPL > 0).length / realizedTrades.length * 100 : null,
    largestPosition,
    currencyExposure,
  }
}

export const getSymbolMemory = (symbol, latestPrice = 0) => {
  const trades = getTrades(symbol)
  const position = calculatePosition(trades, latestPrice)
  const realizedByTrade = calculateRealizedPLByTrade(trades)
  const realizedPL = [...realizedByTrade.values()].reduce((sum, value) => sum + value, 0)
  return {
    symbol,
    position,
    trades,
    thesisHistory: trades.filter((trade) => trade.thesis).map((trade) => ({ date: trade.date, side: trade.side, thesis: trade.thesis, reasonType: trade.reasonType })),
    averageCost: position.averageCost,
    realizedPL,
    unrealizedPL: position.unrealizedPL,
    currentMarketValue: position.marketValue,
    userNotes: trades.filter((trade) => trade.note).map((trade) => ({ date: trade.date, note: trade.note })),
    riskNotes: trades.filter((trade) => trade.riskNote).map((trade) => ({ date: trade.date, riskNote: trade.riskNote })),
    lastUpdated: new Date().toISOString(),
  }
}
