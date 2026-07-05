import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const input = process.argv[2] || 'data/trademarker.json'
const data = JSON.parse(await readFile(input, 'utf8'))
const outDir = dirname(input)

const normalizeTrades = (trades = []) => trades.map((trade) => ({
  ...trade,
  side: trade.side || 'BUY',
  price: Number(trade.price || 0),
  shares: Number(trade.shares || 0),
  currency: trade.currency || (/\.(TO|NE|V)$/i.test(trade.symbol || '') ? 'CAD' : 'USD'),
}))

const calculatePosition = (trades, latestPrice = 0) => {
  let shares = 0
  let costBasis = 0
  const sortedTrades = [...trades].filter((trade) => trade.side === 'BUY' || trade.side === 'SELL').sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
  sortedTrades.forEach((trade) => {
    const quantity = Number(trade.shares || 0)
    const price = Number(trade.price || 0)
    if (trade.side === 'BUY') {
      costBasis += quantity * price
      shares += quantity
    } else if (trade.side === 'SELL') {
      const averageCost = shares > 0 ? costBasis / shares : 0
      costBasis = Math.max(0, costBasis - quantity * averageCost)
      shares -= quantity
    }
  })
  const averageCost = shares > 0 ? costBasis / shares : 0
  return { shares, costBasis, averageCost, marketValue: shares * latestPrice }
}

const now = new Date().toISOString()
const trades = normalizeTrades(data.trades || [])
const watchlist = data.watchlist || []
const groups = data.watchlistGroups || []
const commitments = data.orderCommitments || []
const tradeSymbols = [...new Set(trades.map((trade) => trade.symbol).filter(Boolean))]
const watchlistSet = new Set(watchlist)

const duplicateKeys = trades.reduce((keys, trade) => {
  if (trade.side === 'ORDER') return keys
  const key = [trade.symbol, trade.side, trade.price, trade.shares, trade.date].join('|')
  keys.set(key, (keys.get(key) || 0) + 1)
  return keys
}, new Map())
const duplicateCount = [...duplicateKeys.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0)
const negativePositions = tradeSymbols.map((symbol) => ({ symbol, position: calculatePosition(trades.filter((trade) => trade.symbol === symbol)) })).filter((item) => item.position.shares < -0.000001)
const missingCurrency = trades.filter((trade) => trade.side !== 'ORDER' && !trade.currency)
const tradesOutsideWatchlist = tradeSymbols.filter((symbol) => !watchlistSet.has(symbol))

const diagnostics = {
  generatedAt: now,
  source: 'TradeMarker derived data workflow',
  status: negativePositions.length ? 'error' : duplicateCount || missingCurrency.length || tradesOutsideWatchlist.length ? 'warning' : 'ok',
  counts: {
    watchlist: watchlist.length,
    trades: trades.length,
    executedTrades: trades.filter((trade) => trade.side === 'BUY' || trade.side === 'SELL').length,
    orderTrades: trades.filter((trade) => trade.side === 'ORDER').length,
    orderCommitments: commitments.length,
    groups: groups.length,
  },
  issues: [
    duplicateCount ? { severity: 'warning', title: 'Duplicate-like trades', count: duplicateCount } : null,
    negativePositions.length ? { severity: 'error', title: 'Negative positions', detail: negativePositions.map((item) => `${item.symbol}: ${item.position.shares}`).join(', '), count: negativePositions.length } : null,
    missingCurrency.length ? { severity: 'warning', title: 'Missing trade currency', count: missingCurrency.length } : null,
    tradesOutsideWatchlist.length ? { severity: 'info', title: 'Trades outside watchlist', detail: tradesOutsideWatchlist.join(', '), count: tradesOutsideWatchlist.length } : null,
  ].filter(Boolean),
}

const positions = tradeSymbols.map((symbol) => {
  const position = calculatePosition(trades.filter((trade) => trade.symbol === symbol))
  return position.shares > 0 ? { symbol, ...position } : null
}).filter(Boolean)
const totalCost = positions.reduce((sum, position) => sum + position.costBasis, 0)
const riskSummary = {
  generatedAt: now,
  source: 'TradeMarker derived data workflow',
  note: 'Risk summary uses cost basis only because workflow does not fetch live prices.',
  openPositions: positions.length,
  totalCost,
  topFiveCostShare: totalCost ? positions.sort((a, b) => b.costBasis - a.costBasis).slice(0, 5).reduce((sum, item) => sum + item.costBasis, 0) / totalCost * 100 : 0,
  largestCostPositions: positions.sort((a, b) => b.costBasis - a.costBasis).slice(0, 10),
  groupCostExposure: groups.map((group) => {
    const symbols = new Set(group.symbols || [])
    const groupPositions = positions.filter((position) => symbols.has(position.symbol))
    const costBasis = groupPositions.reduce((sum, position) => sum + position.costBasis, 0)
    return { id: group.id, name: group.name, symbols: groupPositions.length, costBasis, costShare: totalCost ? costBasis / totalCost * 100 : 0 }
  }),
}

const aiContext = {
  generatedAt: now,
  source: 'TradeMarker derived data workflow',
  dataUpdatedAt: data.updatedAt,
  account: data.account || {},
  watchlist,
  watchlistGroups: groups,
  orderCommitments: commitments,
  diagnostics,
  riskSummary,
  recentTrades: [...trades].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 80),
}

await writeFile(join(outDir, 'data-diagnostics.json'), `${JSON.stringify(diagnostics, null, 2)}\n`)
await writeFile(join(outDir, 'risk-summary.json'), `${JSON.stringify(riskSummary, null, 2)}\n`)
await writeFile(join(outDir, 'ai-context.json'), `${JSON.stringify(aiContext, null, 2)}\n`)
