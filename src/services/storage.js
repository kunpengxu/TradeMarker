const KEYS = {
  watchlist: 'trademarker.watchlist',
  trades: 'trademarker.trades',
  plannedOrders: 'trademarker.plannedOrders',
  settings: 'trademarker.settings',
  watchlistGroups: 'trademarker.watchlistGroups',
  account: 'trademarker.account',
  updatedAt: 'trademarker.updatedAt',
}

const read = (key, fallback) => {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

const write = (key, value, notify = true) => {
  localStorage.setItem(key, JSON.stringify(value))
  if (notify && key !== KEYS.updatedAt) {
    localStorage.setItem(KEYS.updatedAt, JSON.stringify(new Date().toISOString()))
    window.dispatchEvent(new CustomEvent('trademarker:data-changed'))
  }
}
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
export const REASON_TYPES = ['Earnings', 'Swing Trade', 'Long-term', 'Dip Buy', 'Technical Breakout', 'AI Suggestion', 'Rebalance', 'Take Profit', 'Stop Loss', 'Macro Event', 'News Event', 'Sector Rotation', 'Other']
export const EMOTION_TYPES = ['Very confident', 'Confident', 'Neutral', 'Nervous', 'Panic', 'FOMO', 'Regret', 'Other']
export const TRADE_DEFAULTS = {
  reasonType: '',
  reasonTags: [],
  confidence: null,
  targetPrice: null,
  stopLoss: null,
  takeProfit: null,
  targets: [],
  thesis: '',
  invalidation: '',
  riskNote: '',
  marketContext: '',
  emotion: null,
  currency: null,
  cashImpactApplied: false,
}
const normalizeTargets = (trade) => {
  if (Array.isArray(trade.targets)) return [...new Set(trade.targets.map(Number).filter((value) => Number.isFinite(value) && value > 0))]
  const legacy = [trade.targetPrice, trade.takeProfit].map(Number).filter((value) => Number.isFinite(value) && value > 0)
  return [...new Set(legacy)]
}
const normalizeConfidence = (value) => {
  const confidence = Number(value)
  return Number.isInteger(confidence) && confidence >= 1 && confidence <= 5 ? confidence : null
}
export const normalizeSymbol = (symbol) => {
  const clean = symbol.trim().toUpperCase()
  return clean.endsWith(':US') ? clean.slice(0, -3) : clean
}
export const normalizeTrade = (trade) => ({
  ...TRADE_DEFAULTS,
  ...trade,
  symbol: trade.symbol?.toUpperCase() || '',
  side: trade.side || 'BUY',
  price: Number(trade.price || 0),
  shares: Number(trade.shares || 0),
  currency: trade.currency ? String(trade.currency).toUpperCase() : null,
  cashImpactApplied: Boolean(trade.cashImpactApplied),
  reasonTags: Array.isArray(trade.reasonTags) ? trade.reasonTags.filter(Boolean) : trade.reasonType ? [trade.reasonType] : [],
  confidence: normalizeConfidence(trade.confidence),
  targetPrice: trade.targetPrice == null || trade.targetPrice === '' ? null : Number(trade.targetPrice),
  stopLoss: trade.stopLoss == null || trade.stopLoss === '' ? null : Number(trade.stopLoss),
  takeProfit: trade.takeProfit == null || trade.takeProfit === '' ? null : Number(trade.takeProfit),
  targets: normalizeTargets(trade),
  thesis: trade.thesis || '',
  invalidation: trade.invalidation || '',
  riskNote: trade.riskNote || '',
  marketContext: trade.marketContext || '',
  emotion: trade.emotion || null,
})

const inferTradeCurrency = (symbol) => /\.(NE|TO|V)$/i.test(symbol || '') ? 'CAD' : 'USD'

const normalizeCashBalances = (balances) => {
  const rows = Array.isArray(balances) ? balances : Object.entries(balances || {}).map(([currency, amount]) => ({ currency, amount }))
  return rows.reduce((result, row) => {
    const currency = String(row?.currency || '').trim().toUpperCase()
    const amount = Number(row?.amount ?? row?.cash ?? 0)
    if (!currency || !Number.isFinite(amount)) return result
    const existing = result.find((item) => item.currency === currency)
    if (existing) existing.amount += amount
    else result.push({ currency, amount })
    return result
  }, []).sort((a, b) => a.currency.localeCompare(b.currency))
}

export const getAccount = () => {
  const account = read(KEYS.account, {})
  return {
    ...account,
    cashBalances: normalizeCashBalances(account.cashBalances || []),
  }
}
export const saveAccount = (account) => write(KEYS.account, {
  ...getAccount(),
  ...account,
  cashBalances: normalizeCashBalances(account?.cashBalances || []),
})
export const getCashBalances = () => getAccount().cashBalances
export const saveCashBalances = (cashBalances) => saveAccount({ cashBalances })

const applyTradeCashImpact = (account, trade, direction = 1) => {
  const value = Number(trade.price) * Number(trade.shares)
  if (!Number.isFinite(value) || value <= 0) return account
  const currency = trade.currency || inferTradeCurrency(trade.symbol)
  const sideMultiplier = trade.side === 'SELL' ? 1 : -1
  const delta = sideMultiplier * value * direction
  const balances = normalizeCashBalances(account.cashBalances)
  const existing = balances.find((balance) => balance.currency === currency)
  if (existing) existing.amount += delta
  else balances.push({ currency, amount: delta })
  return { ...account, cashBalances: normalizeCashBalances(balances) }
}

export const getWatchlist = () => read(KEYS.watchlist, [])
export const saveWatchlist = (symbols) => write(KEYS.watchlist, [...new Set(symbols.map(normalizeSymbol))])
export const addSymbol = (symbol) => {
  const clean = normalizeSymbol(symbol)
  if (!clean) return getWatchlist()
  const next = [...new Set([...getWatchlist(), clean])]
  saveWatchlist(next)
  return next
}
export const removeSymbol = (symbol) => {
  const next = getWatchlist().filter((item) => item !== symbol)
  saveWatchlist(next)
  saveWatchlistGroups(getWatchlistGroups().map((group) => ({ ...group, symbols: group.symbols.filter((item) => item !== symbol) })))
  return next
}
export const getWatchlistGroups = () => {
  const groups = read(KEYS.watchlistGroups, [])
  const watchlist = getWatchlist()
  if (!groups.length) return [{ id: 'default', name: 'Watchlist', symbols: watchlist }]
  const grouped = new Set(groups.flatMap((group) => group.symbols))
  const missing = watchlist.filter((symbol) => !grouped.has(symbol))
  return groups.map((group, index) => index === 0 ? { ...group, symbols: [...group.symbols, ...missing] } : group)
}
export const saveWatchlistGroups = (groups) => {
  const clean = groups.filter((group) => group.name.trim()).map((group) => ({
    id: group.id || uid(),
    name: group.name.trim(),
    symbols: [...new Set(group.symbols.filter((symbol) => getWatchlist().includes(symbol)))],
  }))
  write(KEYS.watchlistGroups, clean.length ? clean : [{ id: 'default', name: 'Watchlist', symbols: getWatchlist() }])
}

export const getTrades = (symbol) => {
  const trades = read(KEYS.trades, []).map(normalizeTrade)
  return symbol ? trades.filter((trade) => trade.symbol === symbol) : trades
}
export const saveTrade = (trade) => {
  const normalized = normalizeTrade({ ...trade, id: trade.id || uid(), currency: trade.currency || inferTradeCurrency(trade.symbol), cashImpactApplied: true })
  write(KEYS.account, applyTradeCashImpact(getAccount(), normalized, 1), false)
  const next = [...getTrades(), normalized]
  write(KEYS.trades, next)
  return next
}
export const saveTrades = (trades) => {
  const next = [
    ...getTrades(),
    ...trades.map((trade) => normalizeTrade({ ...trade, id: trade.id || uid() })),
  ]
  write(KEYS.trades, next)
  return next
}
export const updateTrade = (updated) => {
  let account = getAccount()
  const next = getTrades().map((trade) => {
    if (trade.id !== updated.id) return trade
    const normalized = normalizeTrade({ ...trade, ...updated, currency: updated.currency || trade.currency || inferTradeCurrency(updated.symbol || trade.symbol) })
    if (!trade.cashImpactApplied) return normalized
    account = applyTradeCashImpact(account, trade, -1)
    account = applyTradeCashImpact(account, { ...normalized, cashImpactApplied: true }, 1)
    return { ...normalized, cashImpactApplied: true }
  })
  write(KEYS.account, account, false)
  write(KEYS.trades, next)
  return next
}
export const deleteTrade = (id) => {
  const trades = getTrades()
  const deleted = trades.find((trade) => trade.id === id)
  if (deleted?.cashImpactApplied) write(KEYS.account, applyTradeCashImpact(getAccount(), deleted, -1), false)
  write(KEYS.trades, trades.filter((trade) => trade.id !== id))
}

export const getOrders = (symbol) => {
  const orders = read(KEYS.plannedOrders, [])
  return symbol ? orders.filter((order) => order.symbol === symbol) : orders
}
export const saveOrder = (order) => {
  const next = [...getOrders(), { ...order, id: order.id || uid(), symbol: order.symbol.toUpperCase() }]
  write(KEYS.plannedOrders, next)
  return next
}
export const updateOrder = (updated) => {
  const next = getOrders().map((order) => (order.id === updated.id ? { ...order, ...updated } : order))
  write(KEYS.plannedOrders, next)
  return next
}
export const deleteOrder = (id) => write(KEYS.plannedOrders, getOrders().filter((order) => order.id !== id))

export const getSettings = () => read(KEYS.settings, {})
export const saveSettings = (settings) => write(KEYS.settings, settings)

export const exportData = () => ({
  watchlist: getWatchlist(),
  watchlistGroups: getWatchlistGroups(),
  trades: getTrades(),
  plannedOrders: getOrders(),
  account: getAccount(),
  settings: { ...getSettings(), twelveDataApiKey: undefined, fmpApiKey: undefined, marketauxApiKey: undefined, githubToken: undefined },
  updatedAt: read(KEYS.updatedAt, new Date().toISOString()),
})

export const importData = (data) => {
  if (!data || !Array.isArray(data.watchlist) || !Array.isArray(data.trades) || !Array.isArray(data.plannedOrders)) {
    throw new Error('Invalid TradeMarker data file.')
  }
  saveWatchlist(data.watchlist)
  write(KEYS.watchlistGroups, data.watchlistGroups || [{ id: 'default', name: 'Watchlist', symbols: data.watchlist }], false)
  write(KEYS.trades, data.trades.map(normalizeTrade), false)
  write(KEYS.plannedOrders, data.plannedOrders, false)
  write(KEYS.account, {
    ...(data.account || {}),
    cashBalances: normalizeCashBalances(data.account?.cashBalances || data.cashBalances || []),
  }, false)
  write(KEYS.settings, { ...getSettings(), ...(data.settings || {}) }, false)
  write(KEYS.updatedAt, data.updatedAt || new Date().toISOString(), false)
  window.dispatchEvent(new CustomEvent('trademarker:data-imported'))
}

export const clearData = () => Object.values(KEYS).forEach((key) => localStorage.removeItem(key))
export const getDataUpdatedAt = () => read(KEYS.updatedAt, null)
