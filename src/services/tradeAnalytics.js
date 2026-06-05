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

const realizedTrades = (trades) => {
  const realizedByTrade = calculateRealizedPLByTrade(trades)
  return trades.filter((trade) => trade.side === 'SELL' && realizedByTrade.has(trade.id)).map((trade) => ({
    ...trade,
    realizedPL: realizedByTrade.get(trade.id),
  }))
}

export const getTradesByTag = (tag) => getTrades().filter((trade) => trade.reasonTags?.includes(tag))

export const getTradesByEmotion = (emotion) => getTrades().filter((trade) => trade.emotion === emotion)

export const getAverageReturnByTag = (tag) => {
  const matching = realizedTrades(getTrades()).filter((trade) => trade.reasonTags?.includes(tag))
  return matching.length ? matching.reduce((sum, trade) => sum + trade.realizedPL, 0) / matching.length : null
}

export const getAverageReturnByEmotion = (emotion) => {
  const matching = realizedTrades(getTrades()).filter((trade) => trade.emotion === emotion)
  return matching.length ? matching.reduce((sum, trade) => sum + trade.realizedPL, 0) / matching.length : null
}

export const getSymbolMemory = (symbol, latestPrice = 0) => {
  const trades = getTrades(symbol)
  const position = calculatePosition(trades, latestPrice)
  const realizedByTrade = calculateRealizedPLByTrade(trades)
  const realizedPL = [...realizedByTrade.values()].reduce((sum, value) => sum + value, 0)
  return {
    symbol,
    reasonTags: [...new Set(trades.flatMap((trade) => trade.reasonTags || []))],
    targets: trades.map((trade) => ({ date: trade.date, side: trade.side, targets: trade.targets || [] })).filter((item) => item.targets.length),
    marketContext: trades.filter((trade) => trade.marketContext).map((trade) => ({ date: trade.date, side: trade.side, marketContext: trade.marketContext })),
    emotion: trades.filter((trade) => trade.emotion).map((trade) => ({ date: trade.date, side: trade.side, emotion: trade.emotion })),
    position,
    trades,
    thesisHistory: trades.filter((trade) => trade.thesis).map((trade) => ({ date: trade.date, side: trade.side, thesis: trade.thesis, reasonType: trade.reasonType, reasonTags: trade.reasonTags })),
    invalidationHistory: trades.filter((trade) => trade.invalidation).map((trade) => ({ date: trade.date, side: trade.side, invalidation: trade.invalidation })),
    averageCost: position.averageCost,
    realizedPL,
    unrealizedPL: position.unrealizedPL,
    currentMarketValue: position.marketValue,
    userNotes: trades.filter((trade) => trade.note).map((trade) => ({ date: trade.date, note: trade.note })),
    riskNotes: trades.filter((trade) => trade.riskNote).map((trade) => ({ date: trade.date, riskNote: trade.riskNote })),
    lastUpdated: new Date().toISOString(),
  }
}
