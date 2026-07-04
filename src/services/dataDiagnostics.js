import { calculatePosition } from './positionCalculator'
import { getOrderCommitments, getTrades, getWatchlist, getWatchlistGroups } from './storage'

const issue = (severity, title, detail, count = 1) => ({ severity, title, detail, count })

export function buildDataDiagnostics() {
  const trades = getTrades()
  const watchlist = getWatchlist()
  const groups = getWatchlistGroups()
  const commitments = getOrderCommitments()
  const issues = []
  const watchlistSet = new Set(watchlist)
  const tradeSymbols = [...new Set(trades.map((trade) => trade.symbol).filter(Boolean))]

  const duplicateTradeKeys = trades.reduce((keys, trade) => {
    if (trade.side === 'ORDER') return keys
    const key = [trade.symbol, trade.side, trade.price, trade.shares, trade.date].join('|')
    keys.set(key, (keys.get(key) || 0) + 1)
    return keys
  }, new Map())
  const duplicateCount = [...duplicateTradeKeys.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0)
  if (duplicateCount) issues.push(issue('warning', 'Duplicate-like trades', `${duplicateCount} executed trade record(s) share the same symbol, side, price, shares, and date.`, duplicateCount))

  const negativePositions = tradeSymbols
    .map((symbol) => ({ symbol, position: calculatePosition(getTrades(symbol), 0) }))
    .filter((item) => item.position.shares < -0.000001)
  if (negativePositions.length) issues.push(issue('error', 'Negative positions', negativePositions.map((item) => `${item.symbol}: ${item.position.shares}`).join(', '), negativePositions.length))

  const missingCurrency = trades.filter((trade) => trade.side !== 'ORDER' && !trade.currency)
  if (missingCurrency.length) issues.push(issue('warning', 'Missing trade currency', `${missingCurrency.length} executed trade record(s) do not have currency set.`, missingCurrency.length))

  const orderTradeIds = new Set(trades.filter((trade) => trade.orderCommitmentId).map((trade) => trade.orderCommitmentId))
  const missingOrderTrades = commitments.filter((order) => !orderTradeIds.has(order.id))
  if (missingOrderTrades.length) issues.push(issue('warning', 'Committed order not in trade log', missingOrderTrades.map((order) => order.symbol).join(', '), missingOrderTrades.length))

  const tradesOutsideWatchlist = tradeSymbols.filter((symbol) => !watchlistSet.has(symbol))
  if (tradesOutsideWatchlist.length) issues.push(issue('info', 'Trades outside watchlist', tradesOutsideWatchlist.join(', '), tradesOutsideWatchlist.length))

  const grouped = new Set(groups.flatMap((group) => group.symbols))
  const ungrouped = watchlist.filter((symbol) => !grouped.has(symbol))
  if (ungrouped.length) issues.push(issue('info', 'Watchlist symbols outside groups', ungrouped.join(', '), ungrouped.length))

  return {
    generatedAt: new Date().toISOString(),
    status: issues.some((item) => item.severity === 'error') ? 'error' : issues.length ? 'warning' : 'ok',
    counts: {
      watchlist: watchlist.length,
      trades: trades.length,
      executedTrades: trades.filter((trade) => trade.side === 'BUY' || trade.side === 'SELL').length,
      orderTrades: trades.filter((trade) => trade.side === 'ORDER').length,
      orderCommitments: commitments.length,
      groups: groups.length,
    },
    issues,
  }
}
