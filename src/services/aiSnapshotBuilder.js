import { buildChatGptPrompt, DEFAULT_QUICK_FOCUS_SYMBOLS, uniquePromptSymbols } from './aiPromptBuilder'
import { loadEventsCalendarFromGitHub, loadOrderPlanFromGitHub } from './githubSync'
import { getMarketSnapshot } from './marketData'
import { normalizeOrderPlan } from './orderPlan'
import { calculatePosition } from './positionCalculator'
import { buildRiskValidation } from './riskValidation'
import { createSnapshotDiff, loadPreviousSnapshotSummary, saveSnapshotSummary, summarizeSnapshotForDiff } from './snapshotDiff'
import { calculateReservedCashByCurrency, exportData, getCashBalances, getOrderCommitments, getTrades, getWatchlist, getWatchlistGroups, normalizeSymbol } from './storage'
import { ema, macd, rsi, sma, vwap } from './technicalIndicators'

const TORONTO_TIME_ZONE = 'America/Toronto'
const PRESET_GROUP_NAMES = ['长期持仓', '长期卫星仓', '波段仓', '杠杆波段仓']
const QUICK_DAILY_CANDLES = 20
const FULL_DAILY_CANDLES = 60
const FULL_WEEKLY_CANDLES = 20

const round = (value, digits = 4) => {
  const number = Number(value)
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null
}
const compactCurrency = (value) => round(value, 2)
const compactShares = (value) => round(value, 6)
const todayToronto = () => new Intl.DateTimeFormat('en-CA', { timeZone: TORONTO_TIME_ZONE }).format(new Date())
const isTodayTrade = (trade) => {
  if (!trade.date) return false
  return new Intl.DateTimeFormat('en-CA', { timeZone: TORONTO_TIME_ZONE }).format(new Date(trade.date)) === todayToronto()
}
const asText = (value) => typeof value === 'object' ? (value?.en || value?.zh || '') : (value || '')
const normalizeUiLanguage = (language) => language === 'zh' ? 'zh' : 'en'
const outputLocale = (language) => normalizeUiLanguage(language) === 'zh' ? 'zh-CN' : 'en-US'
const compactCandle = (candle) => ({
  time: candle.time,
  open: round(candle.open),
  high: round(candle.high),
  low: round(candle.low),
  close: round(candle.close),
  volume: round(candle.volume, 0),
})
const latestIndicator = (points) => round(points.at(-1)?.value)

function buildIndicators(candles) {
  const macdValues = macd(candles)
  return {
    vwap: latestIndicator(vwap(candles)),
    sma20: latestIndicator(sma(candles, 20)),
    sma50: latestIndicator(sma(candles, 50)),
    sma200: latestIndicator(sma(candles, 200)),
    ema50: latestIndicator(ema(candles, 50)),
    rsi14: latestIndicator(rsi(candles, 14)),
    macd: {
      line: latestIndicator(macdValues.macdLine),
      signal: latestIndicator(macdValues.signalLine),
      histogram: latestIndicator(macdValues.histogram),
    },
  }
}

function resampleWeekly(candles) {
  const weeks = new Map()
  candles.forEach((candle) => {
    const date = new Date(`${candle.time}T12:00:00Z`)
    const day = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() - day + 1)
    const key = date.toISOString().slice(0, 10)
    const existing = weeks.get(key)
    if (!existing) weeks.set(key, { ...candle, time: key })
    else {
      existing.high = Math.max(existing.high, candle.high)
      existing.low = Math.min(existing.low, candle.low)
      existing.close = candle.close
      existing.volume = (existing.volume || 0) + (candle.volume || 0)
    }
  })
  return [...weeks.values()]
}

function compactTrade(trade) {
  return {
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    orderSide: trade.orderSide || null,
    status: trade.status || null,
    price: round(trade.price, 4),
    shares: compactShares(trade.shares),
    date: trade.date,
    currency: trade.currency || null,
    note: trade.note || '',
  }
}

function groupForSymbol(groups, symbol) {
  return groups.find((group) => (group.symbols || []).includes(symbol))
}

function compactOrder(order) {
  return {
    id: order.id,
    symbol: order.symbol,
    planType: order.planType,
    side: order.side,
    priority: order.priority || null,
    status: order.status || null,
    intradayMode: order.intradayMode || null,
    startingShares: order.startingShares,
    expectedEndingShares: order.expectedEndingShares,
    currentSituation: asText(order.currentSituationText) || order.currentSituation || '',
    suggestion: asText(order.suggestionText) || order.suggestion || '',
    plannedOrder: asText(order.plannedOrderText) || order.plannedOrder || '',
    reEntryPlan: asText(order.reEntryPlanText) || order.reEntryPlan || '',
    stopLoss: round(order.stopLoss),
    takeProfit: round(order.takeProfit),
    legs: (order.legs || []).map((leg) => ({
      side: leg.side || order.side,
      label: asText(leg.labelText) || leg.label,
      price: round(leg.price, 4),
      shares: compactShares(leg.shares),
      amount: compactCurrency(leg.amount),
      condition: asText(leg.conditionText) || leg.condition || '',
      note: asText(leg.noteText) || leg.note || '',
    })),
  }
}

function summarizeOrderPlan(orderPlanResult) {
  if (orderPlanResult.status !== 'loaded') return { status: orderPlanResult.status, error: orderPlanResult.error || null, actionableOrders: [], planTypes: {} }
  const plan = normalizeOrderPlan(orderPlanResult.data)
  const actionableOrders = plan.orders
    .filter((order) => order.side !== 'WATCH' || /condition|trigger|观察|止损|止盈|买|卖/i.test(`${order.suggestion || ''} ${order.plannedOrder || ''}`))
    .slice(0, 30)
    .map(compactOrder)
  const planTypes = plan.orders.reduce((result, order) => {
    result[order.planType] = (result[order.planType] || 0) + 1
    return result
  }, {})
  return {
    status: 'loaded',
    generatedAt: plan.generatedAt,
    tradingDate: plan.tradingDate,
    title: plan.title,
    summary: plan.summary,
    planTypes,
    actionableOrders,
    warnings: plan.warnings || [],
  }
}

function compactEvents(eventsResult, symbolSet) {
  if (eventsResult.status !== 'loaded') return { status: eventsResult.status, error: eventsResult.error || null, items: [] }
  const now = Date.now()
  const windowMs = 14 * 24 * 60 * 60 * 1000
  const keywords = /CPI|PPI|PCE|NFP|FOMC|FED|OPEX|QUAD|WITCH|EARNINGS|财报|通胀|就业|利率/i
  const cleanSymbol = (symbol) => normalizeSymbol(String(symbol || ''))
  const items = [...(eventsResult.data.events || []), ...(eventsResult.data.macroEvents || []), ...(eventsResult.data.symbolEvents || [])]
    .filter((event) => {
      const time = new Date(event.date || event.publishedAt || event.datetime || 0).getTime()
      const inWindow = Number.isFinite(time) && Math.abs(time - now) <= windowMs
      const symbols = [event.symbol, ...(event.symbols || [])].filter(Boolean).map(cleanSymbol)
      return inWindow && (keywords.test(`${event.type || ''} ${event.title || ''}`) || symbols.some((symbol) => symbolSet.has(symbol)))
    })
    .sort((a, b) => (new Date(a.date || a.publishedAt || 0) - new Date(b.date || b.publishedAt || 0)))
    .slice(0, 40)
    .map((event) => ({
      date: event.date || event.publishedAt || event.datetime || null,
      type: event.type || null,
      symbol: event.symbol || null,
      symbols: event.symbols || [],
      title: event.title || '',
      source: event.source || event.site || '',
      url: event.url || '',
      impactScore: event.impactScore,
      sentiment: event.sentiment,
      actual: event.actual,
      estimate: event.estimate,
      previous: event.previous,
    }))
  return { status: 'loaded', generatedAt: eventsResult.data.generatedAt, range: eventsResult.data.range, items }
}

function buildAccount(cashBalances, orderCommitments) {
  const reserved = calculateReservedCashByCurrency(orderCommitments)
  return {
    cash: cashBalances.map((row) => ({
      currency: row.currency,
      available: compactCurrency(row.amount),
      reserved: compactCurrency(reserved[row.currency] || 0),
      usableAfterReserved: compactCurrency(row.amount - (reserved[row.currency] || 0)),
    })),
    orderCommitments: orderCommitments.map((order) => ({
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      currency: order.currency,
      totalAmount: compactCurrency(order.totalAmount),
      lifecycleStatus: order.lifecycleStatus,
      updatedAt: order.updatedAt,
    })),
  }
}

function buildFocusSymbols({ mode, manualFocus, groups, trades, orderPlanSummary, snapshots, moveThreshold }) {
  const focus = mode === 'QUICK' ? [...DEFAULT_QUICK_FOCUS_SYMBOLS, ...manualFocus] : [...manualFocus]
  trades.filter(isTodayTrade).forEach((trade) => focus.push(trade.symbol))
  groups
    .filter((group) => /杠杆波段|leveraged/i.test(group.name || group.id))
    .flatMap((group) => group.symbols || [])
    .forEach((symbol) => focus.push(symbol))
  ;(orderPlanSummary.actionableOrders || []).forEach((order) => focus.push(order.symbol))
  snapshots.forEach((snapshot) => {
    if (Math.abs(Number(snapshot.quote?.changePercent || 0)) >= moveThreshold) focus.push(snapshot.quote.symbol)
  })
  return uniquePromptSymbols(focus.map(normalizeSymbol))
}

async function snapshotForSymbol(symbol, mode, groups, trades) {
  try {
    const market = await getMarketSnapshot(symbol)
    const symbolTrades = trades.filter((trade) => trade.symbol === symbol)
    const position = calculatePosition(symbolTrades, market.quote?.price || 0)
    const candles = market.candles || []
    const averageVolume = candles.slice(-30).reduce((sum, candle) => sum + Number(candle.volume || 0), 0) / Math.max(1, Math.min(30, candles.length))
    const latest = candles.at(-1) || {}
    const dailyLimit = mode === 'FULL' ? FULL_DAILY_CANDLES : QUICK_DAILY_CANDLES
    return {
      symbol,
      status: 'ok',
      group: groupForSymbol(groups, symbol)?.name || null,
      quote: {
        currentPrice: round(market.quote?.price, 4),
        change: round(market.quote?.change, 4),
        changePercent: round(market.quote?.changePercent, 4),
        open: round(latest.open, 4),
        high: round(latest.high, 4),
        low: round(latest.low, 4),
        previousClose: round(candles.at(-2)?.close, 4),
        volume: round(latest.volume, 0),
        averageVolume: round(averageVolume, 0),
        relativeVolume: averageVolume ? round(Number(latest.volume || 0) / averageVolume, 4) : null,
        currency: market.quote?.currency || null,
        exchange: market.quote?.exchange || null,
        asOf: market.quote?.asOf || latest.time || null,
        source: market.quote?.source || null,
      },
      position: {
        shares: compactShares(position.shares),
        averageCost: round(position.averageCost, 4),
        totalCost: compactCurrency(position.costBasis),
        marketValue: compactCurrency(position.marketValue),
        unrealizedPL: compactCurrency(position.unrealizedPL),
        unrealizedPLPercent: round(position.unrealizedPLPercent, 4),
      },
      indicators: buildIndicators(candles),
      dailyCandles: candles.slice(-dailyLimit).map(compactCandle),
      weeklyCandles: mode === 'FULL' ? resampleWeekly(candles).slice(-FULL_WEEKLY_CANDLES).map(compactCandle) : undefined,
      recentTrades: symbolTrades.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, mode === 'FULL' ? 8 : 4).map(compactTrade),
    }
  } catch (error) {
    return { symbol, status: 'error', error: error.message }
  }
}

export function selectRecentTrades(trades, mode) {
  const days = mode === 'FULL' ? 30 : 7
  const limit = mode === 'FULL' ? 50 : 30
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  return trades
    .filter((trade) => new Date(trade.date || 0).getTime() >= since || mode === 'FULL')
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, limit)
    .map(compactTrade)
}

export async function buildAiSnapshot({ mode = 'QUICK', focusSymbols = [], moveThreshold = 5, language = 'en' } = {}) {
  const snapshotMode = mode === 'FULL' ? 'FULL' : 'QUICK'
  const uiLanguage = normalizeUiLanguage(language)
  const trades = getTrades()
  const groups = getWatchlistGroups()
  const cashBalances = getCashBalances()
  const orderCommitments = getOrderCommitments()
  const orderPlanSummary = summarizeOrderPlan(await loadOrderPlanFromGitHub().catch((error) => ({ status: 'error', error: error.message })))
  const allSymbols = uniquePromptSymbols([...getWatchlist(), ...trades.map((trade) => trade.symbol)])
  const preliminarySymbols = snapshotMode === 'FULL'
    ? allSymbols
    : uniquePromptSymbols([...DEFAULT_QUICK_FOCUS_SYMBOLS, ...focusSymbols, ...trades.filter(isTodayTrade).map((trade) => trade.symbol), ...(orderPlanSummary.actionableOrders || []).map((order) => order.symbol)])
  const preliminarySnapshots = await Promise.all(preliminarySymbols.map((symbol) => getMarketSnapshot(symbol).catch(() => null)))
  const finalFocusSymbols = buildFocusSymbols({ mode: snapshotMode, manualFocus: focusSymbols, groups, trades, orderPlanSummary, snapshots: preliminarySnapshots.filter(Boolean), moveThreshold })
  const symbolUniverse = snapshotMode === 'FULL' ? allSymbols : uniquePromptSymbols([...preliminarySymbols, ...finalFocusSymbols])
  const symbolSnapshots = await Promise.all(symbolUniverse.map((symbol) => snapshotForSymbol(symbol, snapshotMode, groups, trades)))
  const positions = symbolSnapshots
    .filter((item) => item.status === 'ok' && Number(item.position?.shares || 0) > 0)
    .map((item) => ({
      symbol: item.symbol,
      group: item.group,
      currency: item.quote.currency,
      shares: item.position.shares,
      averageCost: item.position.averageCost,
      latestPrice: item.quote.currentPrice,
      marketValue: item.position.marketValue,
      unrealizedPL: item.position.unrealizedPL,
      unrealizedPLPercent: item.position.unrealizedPLPercent,
    }))
  const account = buildAccount(cashBalances, orderCommitments)
  const eventSymbols = new Set(symbolUniverse)
  const eventsCalendar = compactEvents(await loadEventsCalendarFromGitHub().catch((error) => ({ status: 'error', error: error.message })), eventSymbols)
  const portfolioSummary = {
    positionCount: positions.length,
    watchlistCount: allSymbols.length,
    totalMarketValue: {
      CAD: compactCurrency(positions.filter((position) => position.currency === 'CAD').reduce((sum, position) => sum + Number(position.marketValue || 0), 0)),
      USD: compactCurrency(positions.filter((position) => position.currency !== 'CAD').reduce((sum, position) => sum + Number(position.marketValue || 0), 0)),
    },
    unrealizedPL: {
      CAD: compactCurrency(positions.filter((position) => position.currency === 'CAD').reduce((sum, position) => sum + Number(position.unrealizedPL || 0), 0)),
      USD: compactCurrency(positions.filter((position) => position.currency !== 'CAD').reduce((sum, position) => sum + Number(position.unrealizedPL || 0), 0)),
    },
  }
  const snapshot = {
    schemaVersion: '1.0',
    snapshotMode,
    generatedAt: new Date().toISOString(),
    timezone: TORONTO_TIME_ZONE,
    request: {
      analysisType: snapshotMode === 'QUICK' ? 'INTRADAY_UPDATE' : 'FULL_PORTFOLIO',
      focusSymbols: finalFocusSymbols,
      requiredOutput: 'DOWNLOADABLE_ORDER_PLAN_JSON',
      language: outputLocale(uiLanguage),
      uiLanguage,
      requirements: snapshotMode === 'QUICK'
        ? ['检查当前持仓数量', '检查现金是否足够', '检查多个买单是否互斥', 'SELL_FIRST数量不得超过已有持股', '日内计划必须有止盈、止损和恢复仓位方案', '主动评估长期补仓、波段低吸和日内BUY_FIRST机会', '杠杆产品补仓必须说明是否满足企稳、强反转、成交量和仓位控制条件']
        : ['整体分析全部持仓和观察列表', '每个当前持仓必须有REGULAR计划', '波段仓和杠杆波段仓必须有INTRADAY评估', '主动评估长期补仓、波段低吸和日内BUY_FIRST机会', '杠杆产品补仓必须说明是否满足企稳、强反转、成交量和仓位控制条件', '最后生成完整可下载的order-plan.json'],
    },
    account,
    portfolioSummary,
    positions,
    recentTrades: selectRecentTrades(trades, snapshotMode),
    watchlistGroups: groups.filter((group) => PRESET_GROUP_NAMES.includes(group.name) || snapshotMode === 'FULL').map((group) => ({ id: group.id, name: group.name, symbols: group.symbols })),
    marketContext: {
      source: 'TradeMarker browser snapshot',
      dataCompression: {
        dailyCandlesPerSymbol: snapshotMode === 'FULL' ? FULL_DAILY_CANDLES : QUICK_DAILY_CANDLES,
        weeklyCandlesPerSymbol: snapshotMode === 'FULL' ? FULL_WEEKLY_CANDLES : 0,
        includesMonthlyQuarterlyYearly: false,
      },
    },
    symbols: symbolSnapshots.map((item) => {
      const { position, ...rest } = item
      return { ...rest, ...(Number(position?.shares || 0) > 0 ? { position } : {}) }
    }),
    eventsCalendar,
    currentOrderPlanSummary: orderPlanSummary,
    riskValidation: buildRiskValidation({ cashRows: cashBalances, positions, orderPlanSummary, orderCommitments }),
  }
  const currentSummary = summarizeSnapshotForDiff(snapshot)
  snapshot.changeSummary = createSnapshotDiff(loadPreviousSnapshotSummary(), currentSummary)
  saveSnapshotSummary(currentSummary)
  snapshot.metadata = {
    source: 'TradeMarker',
    generatedFor: 'ChatGPT Pro manual upload workflow',
    noOpenAiApiUsed: true,
    totalLocalBackupBytes: JSON.stringify(exportData()).length,
  }
  return { snapshot, prompt: buildChatGptPrompt(snapshot) }
}
