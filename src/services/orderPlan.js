const asArray = (value) => Array.isArray(value) ? value : value ? [value] : []
const first = (...values) => values.find((value) => value != null && value !== '') ?? null
const rowsFrom = (value) => Array.isArray(value) ? value : Array.isArray(value?.rows) ? value.rows : []
const numberOrNull = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
const localized = (item, key, ...fallbacks) => {
  const en = first(item[`${key}En`], item[`${key}EN`], item[key]?.en, item[key], ...fallbacks)
  const zh = first(item[`${key}Zh`], item[`${key}ZH`], item[`${key}Cn`], item[`${key}CN`], item[key]?.zh, item[key]?.cn, item[key], ...fallbacks)
  return en == null && zh == null ? null : { en, zh }
}
const normalizeSide = (value) => {
  const side = String(value || '').toUpperCase()
  if (['BUY', 'B', 'LONG'].includes(side)) return 'BUY'
  if (['SELL', 'S', 'TRIM', 'TAKE_PROFIT', 'STOP'].includes(side)) return 'SELL'
  return side || 'WATCH'
}
const normalizePlanSymbol = (value) => String(value || '').toUpperCase().replace(/\.NE$/i, '.TO')
const normalizePlanType = (value) => {
  const type = String(value || '').toUpperCase().replace(/[^A-Z]/g, '')
  if (type === 'INTRADAY' || type === 'DAYTRADE' || type === 'DAYTRADING' || type === 'SHORTTERM') return 'INTRADAY'
  return 'REGULAR'
}

const sourceOrders = (plan) => [
  ...asArray(plan.orders),
  ...asArray(plan.recommendations),
  ...asArray(plan.orderRecommendations),
  ...asArray(plan.plans),
  ...asArray(plan.items),
  ...asArray(plan.actionItems),
  ...asArray(plan.actions),
  ...asArray(plan.rows),
  ...rowsFrom(plan.table),
  ...rowsFrom(plan.summaryTable),
  ...rowsFrom(plan.orderSummary),
  ...rowsFrom(plan.quickSummary),
  ...rowsFrom(plan.quickOrderSummary),
  ...asArray(plan.mustAct).map((item) => ({ ...item, priority: first(item.priority, 'HIGH') })),
  ...asArray(plan.must).map((item) => ({ ...item, priority: first(item.priority, 'HIGH') })),
  ...asArray(plan.conditional).map((item) => ({ ...item, priority: first(item.priority, 'MEDIUM') })),
  ...asArray(plan.watch).map((item) => ({ ...item, side: first(item.side, 'WATCH') })),
  ...asArray(plan.buy).map((item) => ({ ...item, side: 'BUY' })),
  ...asArray(plan.buys).map((item) => ({ ...item, side: 'BUY' })),
  ...asArray(plan.sell).map((item) => ({ ...item, side: 'SELL' })),
  ...asArray(plan.sells).map((item) => ({ ...item, side: 'SELL' })),
]

const normalizeLeg = (leg, parent = {}, index = 0) => ({
  id: first(leg.id, `${parent.symbol || 'order'}-${index}`),
  side: normalizeSide(first(leg.side, leg.action, leg.recommendation, parent.side)),
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
  const symbol = normalizePlanSymbol(first(order.symbol, order.ticker, order.name, order.target, order['标的'], order['股票代码'], ''))
  const side = normalizeSide(first(order.side, order.action, order.recommendation, order.type, order['方向'], order['操作'], order['建议']))
  const rawLegs = [
    ...asArray(order.legs),
    ...asArray(order.ladder),
    ...asArray(order.batches),
    ...asArray(order.orders),
    ...asArray(order.orderLevels),
    ...asArray(order.priceLevels),
  ]
  const parentLeg = normalizeLeg(order, { symbol, side }, 0)
  const legs = rawLegs.length ? rawLegs.map((leg, legIndex) => normalizeLeg(leg, { symbol, side, orderType: order.orderType }, legIndex)) : [parentLeg]
  return {
    id: first(order.id, `${symbol || 'order'}-${side}-${index}`),
    symbol,
    planType: normalizePlanType(first(order.planType, order.plan, order.horizon, order.timeframe, order.category, order['计划类型'], order['类型'])),
    intradayMode: first(order.intradayMode, order.mode, order.strategyMode, order['日内模式']),
    startingShares: numberOrNull(first(order.startingShares, order.startShares, order.beginningShares, order['起始股数'])),
    expectedEndingShares: numberOrNull(first(order.expectedEndingShares, order.endingShares, order.finalShares, order['目标结束股数'])),
    side,
    priority: first(order.priority, order.urgency, order.rank, order['优先级']),
    status: first(order.status, order['状态'], 'PROPOSED'),
    totalShares: numberOrNull(first(order.totalShares, order.shares, order.quantity, order.qty)),
    totalAmount: numberOrNull(first(order.totalAmount, order.amount, order.value, order.notional)),
    targetPrice: numberOrNull(first(order.targetPrice, order.target)),
    stopLoss: numberOrNull(first(order.stopLoss, order.stop)),
    takeProfit: numberOrNull(first(order.takeProfit, order.takeProfitPrice)),
    reason: first(order.reason, order.rationale, order.thesis, order.summary),
    reasonText: localized(order, 'reason', order.rationale, order.thesis, order.summary),
    currentSituation: first(order.currentSituation, order.situation, order.current, order.context, order.marketContext, order['当前情况'], order['现状']),
    currentSituationText: localized(order, 'currentSituation', order.situation, order.current, order.context, order.marketContext, order['当前情况'], order['现状']),
    suggestion: first(order.suggestion, order.advice, order.actionPlan, order.recommendationText, order['建议']),
    suggestionText: localized(order, 'suggestion', order.advice, order.actionPlan, order.recommendationText, order['建议']),
    plannedOrder: first(order.plannedOrder, order.orderText, order.order, order['挂单']),
    plannedOrderText: localized(order, 'plannedOrder', order.orderText, order.order, order['挂单']),
    reEntryPlan: first(order.reEntryPlan, order.reentryPlan, order.exitPlan, order.closePlan, order['买回计划'], order['平仓计划']),
    reEntryPlanText: localized(order, 'reEntryPlan', order.reentryPlan, order.exitPlan, order.closePlan, order['买回计划'], order['平仓计划']),
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
