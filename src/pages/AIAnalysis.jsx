import { useMemo, useState } from 'react'
import { buildAIAnalysisContext, buildAIAnalysisPrompt, copyAIAnalysisContext } from '../services/aiContext'
import { getTrades, getWatchlist, getWatchlistGroups } from '../services/storage'
import { useI18n } from '../i18n'

export default function AIAnalysis() {
  const { t } = useI18n()
  const [symbol, setSymbol] = useState('all')
  const [groupId, setGroupId] = useState('all')
  const [days, setDays] = useState(30)
  const [recentTradeLimit, setRecentTradeLimit] = useState(50)
  const [preview, setPreview] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const groups = useMemo(() => getWatchlistGroups(), [])
  const symbols = useMemo(() => [...new Set([...getWatchlist(), ...getTrades().map((trade) => trade.symbol)].filter(Boolean))].sort(), [])

  const options = { symbol, groupId, days: Number(days) || 0, recentTradeLimit: Number(recentTradeLimit) || 50 }
  const generate = async (copy = false) => {
    setLoading(true)
    setMessage('')
    try {
      const context = copy ? await copyAIAnalysisContext(options) : await buildAIAnalysisContext(options)
      const prompt = buildAIAnalysisPrompt(context)
      setPreview(prompt)
      setMessage(copy ? t('aiContextCopied') : t('aiContextReady'))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return <section><div className="page-head"><div><p className="eyebrow">{t('aiEyebrow')}</p><h1>{t('aiTitle')}</h1><p>{t('aiSubtitle')}</p></div></div>
    {message && <p className="notice">{message}</p>}
    <div className="panel ai-context-panel">
      <div className="ai-control-grid">
        <label>{t('symbol')}<select value={symbol} onChange={(event) => setSymbol(event.target.value)}><option value="all">{t('allSymbols')}</option>{symbols.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>{t('watchlist')}<select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="all">{t('allStocks')}</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label>{t('recentDays')}<input type="number" min="0" step="1" value={days} onChange={(event) => setDays(event.target.value)} /></label>
        <label>{t('recentTradeLimit')}<input type="number" min="1" step="1" value={recentTradeLimit} onChange={(event) => setRecentTradeLimit(event.target.value)} /></label>
      </div>
      <div className="sync-actions"><button type="button" className="secondary" disabled={loading} onClick={() => generate(false)}>{loading ? t('loading') : t('previewAIContext')}</button><button type="button" disabled={loading} onClick={() => generate(true)}>{t('copyAIContext')}</button></div>
    </div>
    <div className="panel ai-preview-panel"><h2>{t('aiPromptPreview')}</h2>{preview ? <pre>{preview}</pre> : <div className="empty-inline">{t('aiPromptEmpty')}</div>}</div>
  </section>
}
