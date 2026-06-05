const KEYS = {
  watchlist: 'trademarker.watchlist',
  trades: 'trademarker.trades',
  plannedOrders: 'trademarker.plannedOrders',
  settings: 'trademarker.settings',
  watchlistGroups: 'trademarker.watchlistGroups',
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
export const REASON_TYPES = ['Earnings', 'Swing Trade', 'Long-term', 'Dip Buy', 'Technical Breakout', 'AI Suggestion', 'Rebalance', 'Other']
export const TRADE_DEFAULTS = {
  reasonType: '',
  confidence: '',
  targetPrice: null,
  stopLoss: null,
  takeProfit: null,
  thesis: '',
  invalidation: '',
  riskNote: '',
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
  confidence: trade.confidence === '' || trade.confidence == null ? '' : Number(trade.confidence),
  targetPrice: trade.targetPrice == null || trade.targetPrice === '' ? null : Number(trade.targetPrice),
  stopLoss: trade.stopLoss == null || trade.stopLoss === '' ? null : Number(trade.stopLoss),
  takeProfit: trade.takeProfit == null || trade.takeProfit === '' ? null : Number(trade.takeProfit),
  thesis: trade.thesis || '',
  invalidation: trade.invalidation || '',
  riskNote: trade.riskNote || '',
})

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
  const next = [...getTrades(), normalizeTrade({ ...trade, id: trade.id || uid() })]
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
  const next = getTrades().map((trade) => trade.id === updated.id ? normalizeTrade({ ...trade, ...updated }) : trade)
  write(KEYS.trades, next)
  return next
}
export const deleteTrade = (id) => write(KEYS.trades, getTrades().filter((trade) => trade.id !== id))

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
  settings: { ...getSettings(), twelveDataApiKey: undefined, fmpApiKey: undefined, githubToken: undefined },
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
  write(KEYS.settings, { ...getSettings(), ...(data.settings || {}) }, false)
  write(KEYS.updatedAt, data.updatedAt || new Date().toISOString(), false)
  window.dispatchEvent(new CustomEvent('trademarker:data-imported'))
}

export const clearData = () => Object.values(KEYS).forEach((key) => localStorage.removeItem(key))
export const getDataUpdatedAt = () => read(KEYS.updatedAt, null)
