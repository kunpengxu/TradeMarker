const asArray = (value) => Array.isArray(value) ? value : value ? [value] : []
const first = (...values) => values.find((value) => value != null && value !== '') ?? null
const numberOrNull = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
const normalizeSide = (value) => {
  const side = String(value || '').toUpperCase()
  if (['BUY', 'B', 'LONG'].includes(side)) return 'BUY'
  if (['SELL', 'S', 'TRIM', 'TAKE_PROFIT', 'STOP'].includes(side)) return 'SELL'
  return side || 'WATCH'
}

const sourceOrders = (plan) => [
  ...asArray(plan.orders),
  ...asArray(plan.recommendations),
  ...asArray(plan.orderRecommendations),
  ...asArray(plan.plans),
  ...asArray(plan.buy).map((item) => ({ ...item, side: 'BUY' })),
  ...asArray(plan.buys).map((item) => ({ ...item, side: 'BUY' })),
  ...asArray(plan.sell).map((item) => ({ ...item, side: 'SELL' })),
  ...asArray(plan.sells).map((item) => ({ ...item, side: 'SELL' })),
]

const normalizeLeg = (leg, parent = {}, index = 0) => ({
  id: first(leg.id, `${parent.symbol || 'order'}-${index}`),
  label: first(leg.label, leg.name, leg.stage, leg.batch, `Batch ${index + 1}`),
  orderType: first(leg.orderType, leg.type, parent.orderType, 'LIMIT'),
  price: numberOrNull(first(leg.price, leg.limitPrice, leg.triggerPrice, leg.entryPrice)),
  shares: numberOrNull(first(leg.shares, leg.quantity, leg.qty)),
  amount: numberOrNull(first(leg.amount, leg.value, leg.notional)),
  percent: numberOrNull(first(leg.percent, leg.allocationPercent, leg.positionPercent)),
  condition: first(leg.condition, leg.trigger, leg.when),
  note: first(leg.note, leg.reason, leg.comment),
})

const normalizeOrder = (order, index) => {
  const symbol = String(first(order.symbol, order.ticker, order.name, '')).toUpperCase()
  const side = normalizeSide(first(order.side, order.action, order.recommendation, order.type))
  const rawLegs = [
    ...asArray(order.legs),
    ...asArray(order.ladder),
    ...asArray(order.batches),
    ...asArray(order.orders),
    ...asArray(order.orderLevels),
    ...asArray(order.priceLevels),
  ]
  const parentLeg = normalizeLeg(order, { symbol }, 0)
  const legs = rawLegs.length ? rawLegs.map((leg, legIndex) => normalizeLeg(leg, { symbol, orderType: order.orderType }, legIndex)) : [parentLeg]
  return {
    id: first(order.id, `${symbol || 'order'}-${side}-${index}`),
    symbol,
    side,
    priority: first(order.priority, order.urgency, order.rank),
    status: first(order.status, 'PROPOSED'),
    totalShares: numberOrNull(first(order.totalShares, order.shares, order.quantity, order.qty)),
    totalAmount: numberOrNull(first(order.totalAmount, order.amount, order.value, order.notional)),
    targetPrice: numberOrNull(first(order.targetPrice, order.target)),
    stopLoss: numberOrNull(first(order.stopLoss, order.stop)),
    takeProfit: numberOrNull(first(order.takeProfit, order.takeProfitPrice)),
    reason: first(order.reason, order.rationale, order.thesis, order.summary),
    risk: first(order.risk, order.riskNote, order.invalidation),
    note: first(order.note, order.comment),
    legs,
  }
}

export function normalizeOrderPlan(raw) {
  const plan = raw || {}
  const orders = sourceOrders(plan).map(normalizeOrder).filter((order) => order.symbol || order.reason || order.legs.length)
  return {
    generatedAt: first(plan.generatedAt, plan.createdAt, plan.date, plan.asOf),
    tradingDate: first(plan.tradingDate, plan.date, plan.forDate),
    title: first(plan.title, plan.name, 'Daily order plan'),
    summary: first(plan.summary, plan.overview, plan.marketView, plan.note),
    source: first(plan.source, 'GPT project'),
    assumptions: asArray(first(plan.assumptions, plan.notes)).filter(Boolean),
    warnings: asArray(first(plan.warnings, plan.risks)).filter(Boolean),
    orders,
    raw,
  }
}
