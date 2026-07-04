const KEYS = {
  watchlist: 'trademarker.watchlist',
  trades: 'trademarker.trades',
  plannedOrders: 'trademarker.plannedOrders',
  orderCommitments: 'trademarker.orderCommitments',
  orderPlanSignature: 'trademarker.orderPlanSignature',
  settings: 'trademarker.settings',
  watchlistGroups: 'trademarker.watchlistGroups',
  watchlistGroupPreset: 'trademarker.watchlistGroupPreset.v1',
  cdrSymbolMigration: 'trademarker.cdrSymbolMigration.ne-to-to.v1',
  account: 'trademarker.account',
  updatedAt: 'trademarker.updatedAt',
}
const SELECTED_SYMBOL_KEY = 'trademarker.selectedSymbol'

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
    window.dispatchEvent(new CustomEvent('trademarker:data-changed', { detail: { key } }))
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
  if (clean.endsWith(':US')) return clean.slice(0, -3)
  if (clean.endsWith(':CA')) return `${clean.slice(0, -3)}.TO`
  return clean.replace(/\.NE$/i, '.TO')
}
export const normalizeTrade = (trade) => ({
  ...TRADE_DEFAULTS,
  ...trade,
  symbol: normalizeSymbol(trade.symbol || ''),
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
const isExecutedTrade = (trade) => ['BUY', 'SELL'].includes(trade.side) && trade.status !== 'PLACED' && !trade.orderCommitmentId

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
  if (!isExecutedTrade(trade)) return account
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

const normalizeTradeWithCashImpact = (trade) => normalizeTrade({
  ...trade,
  id: trade.id || uid(),
  currency: trade.currency || inferTradeCurrency(trade.symbol),
  cashImpactApplied: true,
})

const applyNewTradeCashImpacts = (account, trades) => trades.reduce(
  (nextAccount, trade) => applyTradeCashImpact(nextAccount, trade, 1),
  account,
)

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
  const clean = normalizeSymbol(symbol)
  const next = getWatchlist().filter((item) => item !== clean)
  saveWatchlist(next)
  saveWatchlistGroups(getWatchlistGroups().map((group) => ({ ...group, symbols: group.symbols.filter((item) => item !== clean) })))
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

const PRESET_WATCHLIST_GROUPS = [
  {
    id: 'long-core',
    name: '长期持仓',
    symbols: ['ASML.TO', 'NVDA.TO', 'AMD', 'AMD.TO', 'AVGO.TO', 'MSFT.TO', 'GOOG.TO', 'GOOGL', 'AMZN.TO', 'META.TO', 'AAPL.TO', 'ORCL', 'TSLA', 'TSLA.TO', 'UNH.TO', 'VFV.TO', 'QQQ', 'XEQT.TO', 'VDY.TO'],
  },
  {
    id: 'long-satellite',
    name: '长期卫星仓',
    symbols: ['RKLB', 'RDW', 'ASTS', 'PLTR.TO', 'INTC.TO', 'RBLX', 'IONQ', 'QBTS', 'XE', 'SPCX', 'SMCI.TO', 'AAOI', 'LULU.TO', 'IBM.TO', 'NFLX.TO', 'NOK', 'KULR'],
  },
  {
    id: 'swing',
    name: '波段仓',
    symbols: ['QMCO', 'OSCR', 'CLSK', 'DVLT', 'LAES', 'ABTC', 'NIVF', 'FIG', 'GEMI'],
  },
  {
    id: 'leveraged-swing',
    name: '杠杆波段仓',
    symbols: ['TSLL', 'TSLU.TO', 'SMCL', 'AMZU', 'ORCX', 'OKLL', 'ETHU', 'MSTU.TO', 'MSTP', 'IONL', 'KBAB', 'METU', 'TEMT', 'GLDU.TO', 'NVDY'],
  },
]

const migrateSymbol = (symbol) => normalizeSymbol(String(symbol || ''))
const migrateSymbolList = (symbols = []) => [...new Set(symbols.map(migrateSymbol).filter(Boolean))]
const migrateGroup = (group) => ({ ...group, symbols: migrateSymbolList(group.symbols || []) })
const migrateOrder = (order) => ({ ...order, symbol: migrateSymbol(order.symbol || '') })
const orderLegKey = (order) => (order.legs || []).map((leg) => [
  Number(leg.price || 0).toFixed(4),
  Number(leg.shares || 0).toFixed(6),
  Number(leg.amount || 0).toFixed(2),
].join(':')).join(',')
export const orderCommitmentKey = (order) => [
  migrateSymbol(order.symbol || ''),
  String(order.side || 'WATCH').toUpperCase(),
  orderLegKey(order) || [
    Number(order.targetPrice || 0).toFixed(4),
    Number(order.totalShares || 0).toFixed(6),
    String(order.plannedOrder || '').trim(),
  ].join(':'),
].join('|')
const inferOrderCurrency = (order) => String(order.currency || inferTradeCurrency(order.symbol)).toUpperCase()
const ORDER_LIFECYCLE_STATUSES = new Set(['PLACED', 'FILLED', 'CANCELLED', 'EXPIRED'])
const normalizeOrderLifecycleStatus = (value) => {
  const status = String(value || '').toUpperCase()
  return ORDER_LIFECYCLE_STATUSES.has(status) ? status : 'PLACED'
}
const orderCashAmount = (order) => {
  if (order.lifecycleStatus && normalizeOrderLifecycleStatus(order.lifecycleStatus) !== 'PLACED') return 0
  if (String(order.side).toUpperCase() !== 'BUY') return 0
  const legAmount = (order.legs || []).reduce((sum, leg) => {
    const amount = Number(leg.amount)
    if (Number.isFinite(amount) && amount > 0) return sum + amount
    const price = Number(leg.price)
    const shares = Number(leg.shares)
    return Number.isFinite(price) && Number.isFinite(shares) && price > 0 && shares > 0 ? sum + price * shares : sum
  }, 0)
  if (legAmount > 0) return legAmount
  const totalAmount = Number(order.totalAmount)
  if (Number.isFinite(totalAmount) && totalAmount > 0) return totalAmount
  const totalShares = Number(order.totalShares)
  const targetPrice = Number(order.targetPrice || order.legs?.[0]?.price)
  return Number.isFinite(totalShares) && Number.isFinite(targetPrice) && totalShares > 0 && targetPrice > 0 ? totalShares * targetPrice : 0
}
const normalizeOrderCommitment = (order) => migrateOrder({
  id: orderCommitmentKey(order),
  symbol: order.symbol,
  side: order.side || 'WATCH',
  lifecycleStatus: normalizeOrderLifecycleStatus(order.lifecycleStatus || order.status),
  currency: inferOrderCurrency(order),
  totalAmount: orderCashAmount(order),
  currentSituation: order.currentSituation || order.currentSituationText?.zh || order.currentSituationText?.en || '',
  suggestion: order.suggestion || order.suggestionText?.zh || order.suggestionText?.en || '',
  plannedOrder: order.plannedOrder || order.plannedOrderText?.zh || order.plannedOrderText?.en || '',
  note: order.note || order.noteText?.zh || order.noteText?.en || '',
  legs: (order.legs || []).map((leg) => ({
    id: leg.id,
    label: leg.label,
    price: Number(leg.price || 0),
    shares: Number(leg.shares || 0),
    amount: Number(leg.amount || 0),
  })),
  updatedAt: order.updatedAt || new Date().toISOString(),
})
const orderCommitmentTradeId = (id) => `order-${id}`
const orderCommitmentPrice = (order) => {
  const prices = (order.legs || []).map((leg) => Number(leg.price)).filter((value) => Number.isFinite(value) && value > 0)
  return prices[0] || Number(order.targetPrice || 0) || 0
}
const orderCommitmentShares = (order) => {
  const shares = (order.legs || []).reduce((sum, leg) => {
    const value = Number(leg.shares)
    return Number.isFinite(value) && value > 0 ? sum + value : sum
  }, 0)
  return shares || Number(order.totalShares || 0) || 0
}
const orderCommitmentNote = (order) => {
  const parts = [
    order.plannedOrder,
    order.currentSituation,
    order.suggestion,
    order.note,
  ].filter(Boolean)
  return parts.join(' | ')
}
const orderCommitmentToTrade = (order) => normalizeTrade({
  id: orderCommitmentTradeId(order.id),
  symbol: order.symbol,
  side: 'ORDER',
  orderSide: order.side || 'WATCH',
  status: order.lifecycleStatus || 'PLACED',
  source: 'order-plan',
  orderCommitmentId: order.id,
  price: orderCommitmentPrice(order),
  shares: orderCommitmentShares(order),
  currency: inferOrderCurrency(order),
  date: order.updatedAt || new Date().toISOString(),
  note: orderCommitmentNote(order),
  cashImpactApplied: false,
})
const upsertOrderCommitmentTrade = (order) => {
  const trade = orderCommitmentToTrade(order)
  const next = [...getTrades().filter((item) => item.id !== trade.id), trade]
  write(KEYS.trades, next, false)
}
const deleteOrderCommitmentTrade = (id) => {
  write(KEYS.trades, getTrades().filter((trade) => trade.id !== orderCommitmentTradeId(id) && trade.orderCommitmentId !== id), false)
}
const isOrderCommitmentTrade = (trade) => Boolean(trade.orderCommitmentId) || trade.source === 'order-plan' || String(trade.id || '').startsWith('order-')
const syncOrderCommitmentTrades = () => {
  const commitments = read(KEYS.orderCommitments, []).map(normalizeOrderCommitment)
  const existingTrades = read(KEYS.trades, []).map(normalizeTrade)
  if (!commitments.length) {
    const next = existingTrades.filter((trade) => !isOrderCommitmentTrade(trade))
    if (next.length !== existingTrades.length) write(KEYS.trades, next, false)
    return
  }
  const generatedTrades = commitments.map(orderCommitmentToTrade)
  const generatedTradeIds = new Set(generatedTrades.map((trade) => trade.id))
  const next = [
    ...existingTrades.filter((trade) => !isOrderCommitmentTrade(trade) && !generatedTradeIds.has(trade.id)),
    ...generatedTrades,
  ]
  if (JSON.stringify(existingTrades) !== JSON.stringify(next)) write(KEYS.trades, next, false)
}
const removeOrderCommitmentTrades = () => {
  const existingTrades = read(KEYS.trades, []).map(normalizeTrade)
  const next = existingTrades.filter((trade) => !isOrderCommitmentTrade(trade))
  if (next.length !== existingTrades.length) write(KEYS.trades, next, false)
}

export const migrateCdrSymbolsToTorontoOnce = () => {
  if (read(KEYS.cdrSymbolMigration, false)) return false
  const watchlist = read(KEYS.watchlist, [])
  const groups = read(KEYS.watchlistGroups, [])
  const trades = read(KEYS.trades, [])
  const orders = read(KEYS.plannedOrders, [])
  write(KEYS.watchlist, migrateSymbolList(watchlist), false)
  if (groups.length) write(KEYS.watchlistGroups, groups.map(migrateGroup), false)
  if (trades.length) write(KEYS.trades, trades.map(normalizeTrade), false)
  if (orders.length) write(KEYS.plannedOrders, orders.map(migrateOrder), false)
  const commitments = read(KEYS.orderCommitments, [])
  if (commitments.length) write(KEYS.orderCommitments, commitments.map(normalizeOrderCommitment), false)
  try {
    const selected = localStorage.getItem(SELECTED_SYMBOL_KEY)
    if (selected) localStorage.setItem(SELECTED_SYMBOL_KEY, migrateSymbol(selected))
  } catch {}
  write(KEYS.cdrSymbolMigration, true, false)
  write(KEYS.updatedAt, new Date().toISOString(), false)
  window.dispatchEvent(new CustomEvent('trademarker:data-changed'))
  return true
}

export const applyPresetWatchlistGroupsOnce = () => {
  if (read(KEYS.watchlistGroupPreset, false)) return false
  const presetSymbols = PRESET_WATCHLIST_GROUPS.flatMap((group) => group.symbols).map(normalizeSymbol)
  const presetSymbolSet = new Set(presetSymbols)
  const nextWatchlist = [...new Set([...getWatchlist(), ...presetSymbols])]
  saveWatchlist(nextWatchlist)

  const existingGroups = getWatchlistGroups()
  const existingPresetNames = new Set(PRESET_WATCHLIST_GROUPS.map((group) => group.name))
  const remainingGroups = existingGroups
    .filter((group) => !existingPresetNames.has(group.name))
    .map((group) => ({ ...group, symbols: group.symbols.filter((symbol) => !presetSymbolSet.has(symbol)) }))
    .filter((group) => group.id === 'default' || group.symbols.length)
  const presetGroups = PRESET_WATCHLIST_GROUPS.map((group) => ({
    ...group,
    symbols: group.symbols.map(normalizeSymbol),
  }))

  saveWatchlistGroups([...presetGroups, ...remainingGroups])
  write(KEYS.watchlistGroupPreset, true, false)
  return true
}

export const getTrades = (symbol) => {
  syncOrderCommitmentTrades()
  const trades = read(KEYS.trades, []).map(normalizeTrade)
  return symbol ? trades.filter((trade) => trade.symbol === normalizeSymbol(symbol)) : trades
}
export const saveTrade = (trade) => {
  const normalized = normalizeTradeWithCashImpact(trade)
  write(KEYS.account, applyTradeCashImpact(getAccount(), normalized, 1), false)
  const next = [...getTrades(), normalized]
  write(KEYS.trades, next)
  return next
}
export const saveTrades = (trades) => {
  const normalizedTrades = trades.map(normalizeTradeWithCashImpact)
  write(KEYS.account, applyNewTradeCashImpacts(getAccount(), normalizedTrades), false)
  const next = [
    ...getTrades(),
    ...normalizedTrades,
  ]
  write(KEYS.trades, next)
  return next
}
export const updateTrade = (updated) => {
  let account = getAccount()
  const next = getTrades().map((trade) => {
    if (trade.id !== updated.id) return trade
    if (trade.orderCommitmentId) return trade
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
  if (deleted?.orderCommitmentId) {
    deleteOrderCommitment(deleted.orderCommitmentId)
    return
  }
  if (deleted?.cashImpactApplied) write(KEYS.account, applyTradeCashImpact(getAccount(), deleted, -1), false)
  write(KEYS.trades, trades.filter((trade) => trade.id !== id))
}

export const getOrders = (symbol) => {
  const orders = read(KEYS.plannedOrders, []).map(migrateOrder)
  return symbol ? orders.filter((order) => order.symbol === normalizeSymbol(symbol)) : orders
}
export const saveOrder = (order) => {
  const next = [...getOrders(), { ...order, id: order.id || uid(), symbol: migrateSymbol(order.symbol) }]
  write(KEYS.plannedOrders, next)
  return next
}
export const updateOrder = (updated) => {
  const next = getOrders().map((order) => (order.id === updated.id ? migrateOrder({ ...order, ...updated }) : order))
  write(KEYS.plannedOrders, next)
  return next
}
export const deleteOrder = (id) => write(KEYS.plannedOrders, getOrders().filter((order) => order.id !== id))

export const getOrderCommitments = () => read(KEYS.orderCommitments, []).map(normalizeOrderCommitment)
export const clearOrderCommitments = () => {
  removeOrderCommitmentTrades()
  write(KEYS.orderCommitments, [])
  return []
}
export const reconcileOrderPlanSignature = (signature) => {
  const nextSignature = String(signature || '')
  const previousSignature = read(KEYS.orderPlanSignature, '')
  if (previousSignature === nextSignature) return false
  write(KEYS.orderPlanSignature, nextSignature, false)
  clearOrderCommitments()
  return true
}
export const saveOrderCommitment = (order) => {
  const normalized = normalizeOrderCommitment(order)
  const next = [...getOrderCommitments().filter((item) => item.id !== normalized.id), normalized]
  upsertOrderCommitmentTrade(normalized)
  write(KEYS.orderCommitments, next)
  return next
}
export const deleteOrderCommitment = (id) => {
  const next = getOrderCommitments().filter((item) => item.id !== id)
  deleteOrderCommitmentTrade(id)
  write(KEYS.orderCommitments, next)
  return next
}
export const updateOrderCommitmentStatus = (id, lifecycleStatus) => {
  const status = normalizeOrderLifecycleStatus(lifecycleStatus)
  const next = getOrderCommitments().map((item) => item.id === id ? { ...item, lifecycleStatus: status, updatedAt: new Date().toISOString() } : item)
  const updated = next.find((item) => item.id === id)
  if (updated) upsertOrderCommitmentTrade(updated)
  write(KEYS.orderCommitments, next)
  return next
}
export const calculateReservedCashByCurrency = (commitments = getOrderCommitments()) => commitments.reduce((result, order) => {
  const amount = orderCashAmount(order)
  if (!Number.isFinite(amount) || amount <= 0) return result
  const currency = inferOrderCurrency(order)
  result[currency] = (result[currency] || 0) + amount
  return result
}, {})

export const getSettings = () => read(KEYS.settings, {})
export const saveSettings = (settings) => write(KEYS.settings, settings)

export const exportData = () => ({
  watchlist: getWatchlist(),
  watchlistGroups: getWatchlistGroups(),
  trades: getTrades(),
  plannedOrders: getOrders(),
  orderCommitments: getOrderCommitments(),
  account: getAccount(),
  settings: { ...getSettings(), twelveDataApiKey: undefined, fmpApiKey: undefined, marketauxApiKey: undefined, githubToken: undefined },
  updatedAt: read(KEYS.updatedAt, new Date().toISOString()),
})

export const importData = (data) => {
  if (!data || !Array.isArray(data.watchlist) || !Array.isArray(data.trades) || !Array.isArray(data.plannedOrders)) {
    throw new Error('Invalid TradeMarker data file.')
  }
  write(KEYS.watchlist, [...new Set(data.watchlist.map(normalizeSymbol))], false)
  write(KEYS.watchlistGroups, (data.watchlistGroups || [{ id: 'default', name: 'Watchlist', symbols: data.watchlist }]).map(migrateGroup), false)
  write(KEYS.trades, data.trades.map(normalizeTrade), false)
  write(KEYS.plannedOrders, data.plannedOrders.map(migrateOrder), false)
  const commitments = (data.orderCommitments || []).map(normalizeOrderCommitment)
  write(KEYS.orderCommitments, commitments, false)
  commitments.forEach(upsertOrderCommitmentTrade)
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
