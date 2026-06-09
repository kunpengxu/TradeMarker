const asArray = (value) => Array.isArray(value) ? value : value ? [value] : []
const first = (...values) => values.find((value) => value != null && value !== '') ?? null
const numberOrNull = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
const localized = (item, key, ...fallbacks) => ({
  en: first(item[`${key}En`], item[`${key}EN`], item[key]?.en, item[key], ...fallbacks),
  zh: first(item[`${key}Zh`], item[`${key}ZH`], item[`${key}Cn`], item[`${key}CN`], item[key]?.zh, item[key]?.cn, item[key], ...fallbacks),
})
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
  labelText: localized(leg, 'label', leg.name, leg.stage, leg.batch, `Batch ${index + 1}`),
  orderType: first(leg.orderType, leg.type, parent.orderType, 'LIMIT'),
  price: numberOrNull(first(leg.price, leg.limitPrice, leg.triggerPrice, leg.entryPrice)),
  shares: numberOrNull(first(leg.shares, leg.quantity, leg.qty)),
  amount: numberOrNull(first(leg.amount, leg.value, leg.notional)),
  percent: numberOrNull(first(leg.percent, leg.allocationPercent, leg.positionPercent)),
  condition: first(leg.condition, leg.trigger, leg.when),
  conditionText: localized(leg, 'condition', leg.trigger, leg.when),
  note: first(leg.note, leg.reason, leg.comment),
  noteText: localized(leg, 'note', leg.reason, leg.comment),
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
    reasonText: localized(order, 'reason', order.rationale, order.thesis, order.summary),
    risk: first(order.risk, order.riskNote, order.invalidation),
    riskText: localized(order, 'risk', order.riskNote, order.invalidation),
    note: first(order.note, order.comment),
    noteText: localized(order, 'note', order.comment),
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
    titleText: localized(plan, 'title', plan.name, 'Daily order plan'),
    summary: first(plan.summary, plan.overview, plan.marketView, plan.note),
    summaryText: localized(plan, 'summary', plan.overview, plan.marketView, plan.note),
    source: first(plan.source, 'GPT project'),
    assumptions: asArray(first(plan.assumptions, plan.notes)).filter(Boolean),
    assumptionsText: {
      en: asArray(first(plan.assumptionsEn, plan.assumptionsEN, plan.notesEn, plan.notesEN, plan.assumptions, plan.notes)).filter(Boolean),
      zh: asArray(first(plan.assumptionsZh, plan.assumptionsZH, plan.assumptionsCn, plan.assumptionsCN, plan.notesZh, plan.notesZH, plan.assumptions, plan.notes)).filter(Boolean),
    },
    warnings: asArray(first(plan.warnings, plan.risks)).filter(Boolean),
    warningsText: {
      en: asArray(first(plan.warningsEn, plan.warningsEN, plan.risksEn, plan.risksEN, plan.warnings, plan.risks)).filter(Boolean),
      zh: asArray(first(plan.warningsZh, plan.warningsZH, plan.warningsCn, plan.warningsCN, plan.risksZh, plan.risksZH, plan.warnings, plan.risks)).filter(Boolean),
    },
    orders,
    raw,
  }
}
