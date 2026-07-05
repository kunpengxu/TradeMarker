import { buildDataDiagnostics } from './dataDiagnostics'
import { buildPortfolioSummary } from './portfolioSummary'
import { exportData, getCashBalances, getOrderCommitments, getTrades, getWatchlistGroups, normalizeSymbol } from './storage'

const groupLabel = (group) => group.name || group.id

export async function buildAIAnalysisContext({ recentTradeLimit = 40, symbol = 'all', groupId = 'all', days = 0 } = {}) {
  const data = exportData()
  const portfolio = await buildPortfolioSummary()
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
      orderCommitments: getOrderCommitments(),
    },
    watchlistGroups: groups,
    portfolio,
    diagnostics: buildDataDiagnostics(),
    recentTrades,
  }
}

export const buildAIAnalysisPrompt = (context) => `Please analyze this TradeMarker investing journal context.

Focus on:
1. Position/risk concentration and cash pressure.
2. Recent trade quality and realized/unrealized P/L.
3. Placed orders and whether they still fit the portfolio.
4. Data-quality issues that could distort the analysis.
5. A concise next-action checklist.

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
