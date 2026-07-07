const STORAGE_KEY = 'trademarker.aiSnapshotSummary.v1'

const round = (value, digits = 4) => {
  const number = Number(value)
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null
}

const tradeKey = (trade) => [
  trade.id,
  trade.symbol,
  trade.side,
  trade.price,
  trade.shares,
  trade.date,
].filter(Boolean).join('|')

export function summarizeSnapshotForDiff(snapshot) {
  return {
    generatedAt: snapshot.generatedAt,
    mode: snapshot.snapshotMode,
    cash: Object.fromEntries((snapshot.account?.cash || []).map((row) => [row.currency, round(row.available, 2)])),
    positions: Object.fromEntries((snapshot.positions || []).map((position) => [position.symbol, {
      shares: round(position.shares, 6),
      latestPrice: round(position.latestPrice, 4),
      marketValue: round(position.marketValue, 2),
      unrealizedPL: round(position.unrealizedPL, 2),
    }])),
    trades: (snapshot.recentTrades || []).map((trade) => ({
      key: tradeKey(trade),
      symbol: trade.symbol,
      side: trade.side,
      price: trade.price,
      shares: trade.shares,
      date: trade.date,
      currency: trade.currency,
    })),
    groups: Object.fromEntries((snapshot.watchlistGroups || []).map((group) => [group.name || group.id, group.symbols?.length || 0])),
    orderPlan: {
      generatedAt: snapshot.currentOrderPlanSummary?.generatedAt || null,
      actionableCount: snapshot.currentOrderPlanSummary?.actionableOrders?.length || 0,
      planTypes: snapshot.currentOrderPlanSummary?.planTypes || {},
    },
  }
}

export function createSnapshotDiff(previous, current) {
  if (!previous) {
    return {
      previousSnapshotAt: null,
      cashChanges: [],
      newTrades: current.trades || [],
      positionChanges: [],
      newPositions: Object.entries(current.positions || {}).map(([symbol, position]) => ({ symbol, ...position })),
      closedPositions: [],
      largePriceMoves: [],
      watchlistGroupChanges: [],
      orderPlanChanges: [],
    }
  }

  const cashChanges = Object.entries(current.cash || {}).flatMap(([currency, after]) => {
    const before = previous.cash?.[currency] ?? 0
    const change = round(after - before, 2)
    return change ? [{ currency, before, after, change }] : []
  })
  const previousTrades = new Set((previous.trades || []).map((trade) => trade.key))
  const newTrades = (current.trades || []).filter((trade) => !previousTrades.has(trade.key))
  const previousPositions = previous.positions || {}
  const currentPositions = current.positions || {}
  const positionChanges = Object.entries(currentPositions).flatMap(([symbol, position]) => {
    const before = previousPositions[symbol]
    if (!before) return []
    const sharesChange = round(position.shares - before.shares, 6)
    const marketValueChange = round(position.marketValue - before.marketValue, 2)
    const priceChange = round(position.latestPrice - before.latestPrice, 4)
    if (!sharesChange && !marketValueChange && !priceChange) return []
    return [{ symbol, sharesBefore: before.shares, sharesAfter: position.shares, sharesChange, latestPriceBefore: before.latestPrice, latestPriceAfter: position.latestPrice, priceChange, marketValueChange }]
  })
  const newPositions = Object.entries(currentPositions)
    .filter(([symbol]) => !previousPositions[symbol])
    .map(([symbol, position]) => ({ symbol, ...position }))
  const closedPositions = Object.entries(previousPositions)
    .filter(([symbol]) => !currentPositions[symbol])
    .map(([symbol, position]) => ({ symbol, ...position }))
  const largePriceMoves = Object.entries(currentPositions).flatMap(([symbol, position]) => {
    const before = previousPositions[symbol]
    if (!before?.latestPrice) return []
    const changePercent = round(((position.latestPrice - before.latestPrice) / before.latestPrice) * 100, 4)
    return Math.abs(changePercent || 0) >= 5 ? [{ symbol, before: before.latestPrice, after: position.latestPrice, changePercent }] : []
  })
  const watchlistGroupChanges = Object.entries(current.groups || {}).flatMap(([name, after]) => {
    const before = previous.groups?.[name] ?? 0
    return before === after ? [] : [{ name, before, after, change: after - before }]
  })
  const orderPlanChanges = []
  if (JSON.stringify(previous.orderPlan || {}) !== JSON.stringify(current.orderPlan || {})) {
    orderPlanChanges.push({ before: previous.orderPlan || null, after: current.orderPlan || null })
  }
  return {
    previousSnapshotAt: previous.generatedAt || null,
    cashChanges,
    newTrades,
    positionChanges,
    newPositions,
    closedPositions,
    largePriceMoves,
    watchlistGroupChanges,
    orderPlanChanges,
  }
}

export function loadPreviousSnapshotSummary() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

export function saveSnapshotSummary(summary) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(summary))
}
