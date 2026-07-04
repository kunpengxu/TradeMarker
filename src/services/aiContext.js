import { buildDataDiagnostics } from './dataDiagnostics'
import { buildPortfolioSummary } from './portfolioSummary'
import { exportData, getCashBalances, getOrderCommitments, getTrades, getWatchlistGroups } from './storage'

export async function buildAIAnalysisContext({ recentTradeLimit = 40 } = {}) {
  const data = exportData()
  const portfolio = await buildPortfolioSummary()
  const trades = getTrades()
  const recentTrades = [...trades]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, recentTradeLimit)
  return {
    generatedAt: new Date().toISOString(),
    purpose: 'TradeMarker AI analysis context. Data is for personal review and is not brokerage execution data.',
    dataUpdatedAt: data.updatedAt,
    account: {
      cashBalances: getCashBalances(),
      orderCommitments: getOrderCommitments(),
    },
    watchlistGroups: getWatchlistGroups(),
    portfolio,
    diagnostics: buildDataDiagnostics(),
    recentTrades,
  }
}

export async function copyAIAnalysisContext(options) {
  const context = await buildAIAnalysisContext(options)
  const text = JSON.stringify(context, null, 2)
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
