import { buildDataDiagnostics } from './dataDiagnostics'
import { loadEventsCalendarFromGitHub } from './githubSync'
import { buildPortfolioSummary } from './portfolioSummary'
import { exportData, getCashBalances, getOrderCommitments, getTrades, getWatchlistGroups, normalizeSymbol } from './storage'

const groupLabel = (group) => group.name || group.id
const cleanSymbolAlias = (symbol) => String(symbol || '').toUpperCase().replace(/(:CA|:US)$/i, '').replace(/\.(NE|TO|V)$/i, '')
const eventSymbols = (event) => [...new Set([event.symbol, ...(event.symbols || [])].filter(Boolean).map(normalizeSymbol))]
const eventTimestamp = (event) => new Date(event.date || event.publishedAt || event.datetime || 0).getTime()
const eventInScope = (event, scopeSet) => {
  if (!scopeSet?.size) return true
  const aliases = new Set([...scopeSet].flatMap((symbol) => [symbol, cleanSymbolAlias(symbol)]))
  return eventSymbols(event).some((symbol) => aliases.has(symbol) || aliases.has(cleanSymbolAlias(symbol)))
}
const compactEvent = (event) => ({
  id: event.id,
  type: event.type,
  date: event.date,
  direction: event.direction,
  symbol: event.symbol,
  symbols: event.symbols,
  title: event.title,
  description: event.description,
  source: event.source,
  site: event.site,
  url: event.url,
  impactScore: event.impactScore,
  sentiment: event.sentiment,
  impact: event.impact,
  actual: event.actual,
  estimate: event.estimate,
  previous: event.previous,
  epsEstimated: event.epsEstimated,
  epsActual: event.epsActual,
  revenueEstimated: event.revenueEstimated,
  revenueActual: event.revenueActual,
})

async function loadScopedEvents({ scopeSet, since, limit = 40 }) {
  const result = await loadEventsCalendarFromGitHub().catch((error) => ({ status: 'error', error: error.message }))
  if (result.status !== 'loaded') return { status: result.status, error: result.error, symbolEvents: [], macroEvents: [], highImpactEvents: [] }
  const inDateScope = (event) => !since || !event.date || eventTimestamp(event) >= since
  const symbolEvents = (result.data.symbolEvents || [])
    .filter((event) => eventInScope(event, scopeSet) && inDateScope(event))
    .sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0) || eventTimestamp(b) - eventTimestamp(a))
    .slice(0, limit)
    .map(compactEvent)
  const macroEvents = (result.data.macroEvents || [])
    .filter(inDateScope)
    .sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0) || eventTimestamp(b) - eventTimestamp(a))
    .slice(0, Math.min(20, limit))
    .map(compactEvent)
  const highImpactEvents = [...(result.data.events || [])]
    .filter((event) => inDateScope(event) && (eventInScope(event, scopeSet) || ['economic', 'market-news'].includes(event.type)) && Number(event.impactScore || 0) >= 60)
    .sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0) || eventTimestamp(b) - eventTimestamp(a))
    .slice(0, Math.min(20, limit))
    .map(compactEvent)
  return {
    status: result.status,
    generatedAt: result.data.generatedAt,
    range: result.data.range,
    symbolEvents,
    macroEvents,
    highImpactEvents,
  }
}

export async function buildAIAnalysisContext({ recentTradeLimit = 40, symbol = 'all', groupId = 'all', days = 0 } = {}) {
  const data = exportData()
  const trades = getTrades()
  const groups = getWatchlistGroups()
  const selectedGroup = groupId === 'all' ? null : groups.find((group) => group.id === groupId)
  const symbolSet = selectedGroup ? new Set(selectedGroup.symbols) : null
  const cleanSymbol = symbol === 'all' ? 'all' : normalizeSymbol(symbol)
  const since = Number(days) > 0 ? Date.now() - Number(days) * 24 * 60 * 60 * 1000 : null
  const inScope = (trade) => {
    if (cleanSymbol !== 'all' && trade.symbol !== cleanSymbol) return false
    if (symbolSet && !symbolSet.has(trade.symbol)) return false
    if (since && new Date(trade.date || 0).getTime() < since) return false
    return true
  }
  const recentTrades = [...trades]
    .filter(inScope)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, recentTradeLimit)
  const scopedSymbols = cleanSymbol !== 'all'
    ? [cleanSymbol]
    : selectedGroup
      ? selectedGroup.symbols
      : data.watchlist
  const scopeSet = new Set(scopedSymbols)
  const scopedPortfolio = await buildPortfolioSummary(scopedSymbols)
  const scopedOrderCommitments = getOrderCommitments().filter((order) => scopeSet.has(order.symbol))
  const events = await loadScopedEvents({ scopeSet: cleanSymbol === 'all' && !selectedGroup ? null : scopeSet, since, limit: recentTradeLimit })
  return {
    generatedAt: new Date().toISOString(),
    purpose: 'TradeMarker AI analysis context. Data is for personal review and is not brokerage execution data.',
    dataUpdatedAt: data.updatedAt,
    scope: {
      symbol: cleanSymbol,
      group: selectedGroup ? { id: selectedGroup.id, name: groupLabel(selectedGroup) } : null,
      days: Number(days) || null,
      symbols: scopedSymbols,
    },
    account: {
      cashBalances: getCashBalances(),
      orderCommitments: scopedOrderCommitments,
    },
    watchlistGroups: groups,
    portfolio: scopedPortfolio,
    events,
    diagnostics: buildDataDiagnostics(),
    recentTrades,
  }
}

export const buildAIAnalysisPrompt = (context) => `Please analyze this TradeMarker investing journal context.

Focus on:
1. Position/risk concentration and cash pressure.
2. Recent trade quality and realized/unrealized P/L.
3. Placed orders and whether they still fit the portfolio.
4. Relevant stock news, earnings, macro events, and event impact scores.
5. Data-quality issues that could distort the analysis.
6. A concise next-action checklist.

Return practical observations, not financial advice.

JSON context:
${JSON.stringify(context, null, 2)}
`

export async function copyAIAnalysisContext(options) {
  const context = await buildAIAnalysisContext(options)
  const text = buildAIAnalysisPrompt(context)
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
  } else {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
  return context
}
