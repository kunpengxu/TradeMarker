export function calculatePosition(trades, latestPrice = 0) {
  let shares = 0
  let costBasis = 0

  const sortedTrades = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date))
  sortedTrades.forEach((trade) => {
    const quantity = Number(trade.shares)
    const price = Number(trade.price)
    if (trade.side === 'BUY') {
      costBasis += quantity * price
      shares += quantity
    } else {
      const averageCost = shares > 0 ? costBasis / shares : 0
      costBasis = Math.max(0, costBasis - quantity * averageCost)
      shares -= quantity
    }
  })

  const averageCost = shares > 0 ? costBasis / shares : 0
  const marketValue = shares * latestPrice
  const unrealizedPL = shares * (latestPrice - averageCost)
  const unrealizedPLPercent = averageCost > 0 ? ((latestPrice - averageCost) / averageCost) * 100 : 0
  return { shares, averageCost, marketValue, unrealizedPL, unrealizedPLPercent }
}
