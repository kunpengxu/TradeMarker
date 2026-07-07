const round = (value, digits = 2) => {
  const number = Number(value)
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : 0
}

const orderLegs = (order) => order.legs?.length ? order.legs : [{
  side: order.side,
  price: order.targetPrice,
  shares: order.totalShares,
  amount: order.totalAmount,
}]

const legAmount = (leg) => {
  const amount = Number(leg.amount)
  if (Number.isFinite(amount) && amount > 0) return amount
  const price = Number(leg.price)
  const shares = Number(leg.shares)
  return Number.isFinite(price) && Number.isFinite(shares) ? price * shares : 0
}

const orderCurrency = (order) => order.currency || (/\.(TO|V)$/i.test(order.symbol || '') ? 'CAD' : 'USD')
const familyOf = (symbol) => {
  const clean = String(symbol || '').toUpperCase()
  if (['TSLA', 'TSLA.TO', 'TSLL', 'TSLU.TO', 'TSLU', 'TSLQ'].includes(clean)) return 'TSLA'
  if (['AMD', 'AMD.TO', 'NVDA', 'NVDA.TO', 'SOXS', 'SMCL', 'NVDY', 'SMCI.TO'].includes(clean)) return 'SEMICONDUCTOR'
  if (['RKLB', 'RKLX'].includes(clean)) return 'RKLB/RKLX'
  if (['ASTS', 'ASTX'].includes(clean)) return 'ASTS/ASTX'
  return null
}

export function buildRiskValidation({ cashRows = [], positions = [], orderPlanSummary = {}, orderCommitments = [] }) {
  const warnings = []
  const positionMap = Object.fromEntries(positions.map((position) => [position.symbol, position]))
  const reservedByCurrency = orderCommitments.reduce((result, order) => {
    const currency = orderCurrency(order)
    const amount = orderLegs(order).filter((leg) => String(leg.side || order.side).toUpperCase() === 'BUY').reduce((sum, leg) => sum + legAmount(leg), 0)
    result[currency] = (result[currency] || 0) + amount
    return result
  }, {})
  const cash = Object.fromEntries(cashRows.map((row) => {
    const reserved = reservedByCurrency[row.currency] || 0
    return [row.currency, { available: round(row.amount), reserved: round(reserved), usable: round(row.amount - reserved) }]
  }))

  const orders = orderPlanSummary.actionableOrders || []
  const buyByCurrency = {}
  const sellUsage = {}
  orders.forEach((order) => {
    const currency = orderCurrency(order)
    orderLegs(order).forEach((leg) => {
      const side = String(leg.side || order.side || '').toUpperCase()
      const shares = Number(leg.shares || 0)
      if (side === 'BUY') buyByCurrency[currency] = (buyByCurrency[currency] || 0) + legAmount(leg)
      if (side === 'SELL') sellUsage[order.symbol] = (sellUsage[order.symbol] || 0) + shares
    })
  })
  Object.entries(sellUsage).forEach(([symbol, shares]) => {
    const owned = Number(positionMap[symbol]?.shares || 0)
    if (shares > owned) warnings.push({ severity: 'high', type: 'SELL_EXCEEDS_POSITION', symbol, message: `${symbol} planned sell shares ${round(shares, 6)} exceed current shares ${round(owned, 6)}.` })
  })
  Object.entries(buyByCurrency).forEach(([currency, amount]) => {
    const usable = cash[currency]?.usable ?? 0
    if (amount > usable) warnings.push({ severity: 'high', type: 'BUY_CASH_PRESSURE', currency, message: `${currency} planned buys ${round(amount)} exceed usable cash ${round(usable)}.` })
    if (amount > usable * 0.75 && usable > 0) warnings.push({ severity: 'medium', type: 'BUY_CASH_CONCENTRATION', currency, message: `${currency} planned buys use more than 75% of usable cash.` })
  })
  const buyFirst = orders.filter((order) => /BUY_FIRST/i.test(`${order.intradayMode || ''} ${order.suggestion || ''} ${order.currentSituation || ''}`))
  if (buyFirst.length > 1) warnings.push({ severity: 'medium', type: 'MULTIPLE_BUY_FIRST', message: `${buyFirst.length} BUY_FIRST-style candidates may reuse the same cash.` })

  const families = positions.reduce((result, position) => {
    const family = familyOf(position.symbol)
    if (!family) return result
    result[family] = [...(result[family] || []), position.symbol]
    return result
  }, {})
  Object.entries(families).forEach(([family, symbols]) => {
    if (symbols.length > 1) warnings.push({ severity: 'medium', type: 'CORRELATED_EXPOSURE', family, symbols, message: `${family} has overlapping exposure: ${symbols.join(', ')}.` })
  })
  if (families.SEMICONDUCTOR?.includes('SOXS') && families.SEMICONDUCTOR.length > 1) {
    warnings.push({ severity: 'medium', type: 'HEDGE_CONFLICT', message: 'SOXS may hedge or conflict with semiconductor long exposure.' })
  }
  const leveragedExposure = Object.fromEntries(Object.entries(families).map(([family, symbols]) => [family, symbols]))
  return {
    cash,
    positions: Object.fromEntries(positions.map((position) => [position.symbol, { shares: position.shares, marketValue: position.marketValue, unrealizedPLPercent: position.unrealizedPLPercent }])),
    leveragedExposure,
    warnings,
  }
}
