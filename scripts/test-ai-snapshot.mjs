import assert from 'node:assert/strict'
import { buildChatGptPrompt, uniquePromptSymbols } from '../src/services/aiPromptBuilder.js'
import { analysisPackageFilenames, formatTorontoFileStamp } from '../src/services/fileDownload.js'
import { createSnapshotDiff } from '../src/services/snapshotDiff.js'
import { buildRiskValidation } from '../src/services/riskValidation.js'

const fixedDate = new Date('2026-07-07T14:17:00Z')
assert.equal(formatTorontoFileStamp(fixedDate), '2026-07-07-1017')
assert.equal(analysisPackageFilenames('QUICK', fixedDate).snapshot, 'trademarker-ai-quick-2026-07-07-1017.json')

assert.deepEqual(uniquePromptSymbols(['tsll', 'TSLL', ' rklx ', '', 'ASTX']), ['TSLL', 'RKLX', 'ASTX'])

const previous = {
  generatedAt: '2026-07-07T13:00:00Z',
  cash: { USD: 3017.36 },
  positions: {},
  trades: [],
  groups: {},
  orderPlan: {},
}
const current = {
  generatedAt: '2026-07-07T14:00:00Z',
  cash: { USD: 2717.36 },
  positions: { RKLX: { shares: 10, latestPrice: 30, marketValue: 300, unrealizedPL: 0 } },
  trades: [{ key: 'rklx-buy-10', symbol: 'RKLX', side: 'BUY', price: 30, shares: 10, date: '2026-07-07T14:00:00Z' }],
  groups: {},
  orderPlan: {},
}
const diff = createSnapshotDiff(previous, current)
assert.equal(diff.cashChanges[0].currency, 'USD')
assert.equal(diff.cashChanges[0].change, -300)
assert.equal(diff.newTrades[0].symbol, 'RKLX')
assert.equal(diff.newPositions[0].symbol, 'RKLX')

const prompt = buildChatGptPrompt({ snapshotMode: 'QUICK', request: { focusSymbols: ['TSLL', 'RKLX'] } })
assert.match(prompt, /TSLL, RKLX/)
assert.match(prompt, /SELL_FIRST/)

const risk = buildRiskValidation({
  cashRows: [{ currency: 'USD', amount: 100 }],
  positions: [{ symbol: 'TSLL', shares: 5, marketValue: 60, unrealizedPLPercent: 2 }],
  orderCommitments: [],
  orderPlanSummary: {
    actionableOrders: [
      { symbol: 'TSLL', side: 'SELL', legs: [{ side: 'SELL', price: 14, shares: 10 }] },
      { symbol: 'RKLX', side: 'BUY', legs: [{ side: 'BUY', price: 30, shares: 10 }] },
    ],
  },
})
assert.ok(risk.warnings.some((warning) => warning.type === 'SELL_EXCEEDS_POSITION'))
assert.ok(risk.warnings.some((warning) => warning.type === 'BUY_CASH_PRESSURE'))

JSON.stringify({ ok: true, diff, risk })
console.log('AI snapshot helper tests passed.')
