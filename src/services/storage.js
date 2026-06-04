const KEYS = {
  watchlist: 'trademarker.watchlist',
  trades: 'trademarker.trades',
  plannedOrders: 'trademarker.plannedOrders',
  settings: 'trademarker.settings',
}

const read = (key, fallback) => {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

const write = (key, value) => localStorage.setItem(key, JSON.stringify(value))
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
export const normalizeSymbol = (symbol) => {
  const clean = symbol.trim().toUpperCase()
  return clean.endsWith(':US') ? clean.slice(0, -3) : clean
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
  return next
}

export const getTrades = (symbol) => {
  const trades = read(KEYS.trades, [])
  return symbol ? trades.filter((trade) => trade.symbol === symbol) : trades
}
export const saveTrade = (trade) => {
  const next = [...getTrades(), { ...trade, id: trade.id || uid(), symbol: trade.symbol.toUpperCase() }]
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
  trades: getTrades(),
  plannedOrders: getOrders(),
  settings: { ...getSettings(), twelveDataApiKey: undefined, fmpApiKey: undefined },
  exportedAt: new Date().toISOString(),
})

export const importData = (data) => {
  if (!data || !Array.isArray(data.watchlist) || !Array.isArray(data.trades) || !Array.isArray(data.plannedOrders)) {
    throw new Error('Invalid TradeMarker data file.')
  }
  saveWatchlist(data.watchlist)
  write(KEYS.trades, data.trades)
  write(KEYS.plannedOrders, data.plannedOrders)
  saveSettings(data.settings || {})
}

export const clearData = () => Object.values(KEYS).forEach((key) => localStorage.removeItem(key))
