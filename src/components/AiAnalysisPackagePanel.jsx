import { useEffect, useMemo, useRef, useState } from 'react'
import { buildAiSnapshot } from '../services/aiSnapshotBuilder'
import { DEFAULT_QUICK_FOCUS_SYMBOLS } from '../services/aiPromptBuilder'
import { analysisPackageFilenames, byteSize, copyText, downloadJsonFile, downloadTextFile } from '../services/fileDownload'
import { saveOrderPlanToGitHub } from '../services/githubSync'
import { normalizeOrderPlan } from '../services/orderPlan'
import { getSettings } from '../services/storage'
import { useI18n } from '../i18n'

const formatBytes = (bytes) => {
  if (!bytes) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const FOCUS_SYMBOLS_KEY = 'trademarker.aiPackage.focusSymbols'

const savedFocusSymbols = () => {
  try {
    const saved = localStorage.getItem(FOCUS_SYMBOLS_KEY)
    return saved == null ? DEFAULT_QUICK_FOCUS_SYMBOLS.join(', ') : saved
  } catch {
    return DEFAULT_QUICK_FOCUS_SYMBOLS.join(', ')
  }
}

export default function AiAnalysisPackagePanel() {
  const { language, t } = useI18n()
  const orderPlanFileRef = useRef()
  const [mode, setMode] = useState('QUICK')
  const [focusInput, setFocusInput] = useState(savedFocusSymbols)
  const [moveThreshold, setMoveThreshold] = useState(5)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [snapshot, setSnapshot] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [manualPrompt, setManualPrompt] = useState('')
  const [downloadedAt, setDownloadedAt] = useState(null)
  const [showJsonPreview, setShowJsonPreview] = useState(false)

  const stats = useMemo(() => {
    if (!snapshot) return null
    const snapshotText = JSON.stringify(snapshot, null, 2)
    const snapshotBytes = byteSize(snapshotText)
    const sourceBytes = snapshot.metadata?.totalLocalBackupBytes || 0
    const shrink = sourceBytes > 0 ? Math.max(0, 100 - (snapshotBytes / sourceBytes) * 100) : null
    return {
      snapshotBytes,
      shrink,
      positions: snapshot.positions?.length || 0,
      trades: snapshot.recentTrades?.length || 0,
      symbols: snapshot.symbols?.length || 0,
      warnings: snapshot.riskValidation?.warnings?.length || 0,
      cadCash: snapshot.account?.cash?.find((row) => row.currency === 'CAD'),
      usdCash: snapshot.account?.cash?.find((row) => row.currency === 'USD'),
    }
  }, [snapshot])

  useEffect(() => {
    try {
      localStorage.setItem(FOCUS_SYMBOLS_KEY, focusInput)
    } catch {
      // Ignore storage failures; the generator can still work for this session.
    }
  }, [focusInput])

  const focusSymbols = () => focusInput.split(/[,\s，、]+/).map((item) => item.trim().toUpperCase()).filter(Boolean)

  const downloadCurrent = (currentSnapshot = snapshot, currentPrompt = prompt) => {
    if (!currentSnapshot || !currentPrompt) {
      setMessage(t('generatePackageFirst'))
      return
    }
    const names = analysisPackageFilenames(currentSnapshot.snapshotMode)
    downloadJsonFile(names.snapshot, currentSnapshot)
    downloadTextFile(names.prompt, currentPrompt)
    setDownloadedAt(new Date())
  }

  const generate = async ({ download = true } = {}) => {
    const nextMode = mode
    setLoading(true)
    setMessage(nextMode === 'QUICK' ? t('buildingQuickSnapshot') : t('buildingFullSnapshot'))
    setManualPrompt('')
    try {
      const result = await buildAiSnapshot({
        mode: nextMode,
        focusSymbols: focusSymbols(),
        moveThreshold: Number(moveThreshold) || 5,
      })
      setSnapshot(result.snapshot)
      setPrompt(result.prompt)
      setShowJsonPreview(!download)
      if (!download) {
        setMessage(t('packagePreviewReady', { mode: nextMode === 'QUICK' ? t('quickIntraday') : t('fullAnalysis') }))
      } else {
        downloadCurrent(result.snapshot, result.prompt)
        try {
          await copyText(result.prompt)
          setMessage(t('packageGeneratedCopied'))
        } catch {
          setManualPrompt(result.prompt)
          setMessage(t('packageGeneratedCopyFailed'))
        }
      }
    } catch (error) {
      setMessage(t('packageGenerateFailed', { message: error.message }))
    } finally {
      setLoading(false)
    }
  }

  const copyPrompt = async () => {
    if (!prompt) {
      setMessage(t('generatePackageFirst'))
      return
    }
    try {
      await copyText(prompt)
      setMessage(t('chatGptPromptCopied'))
    } catch {
      setManualPrompt(prompt)
      setMessage(t('chatGptPromptCopyFailed'))
    }
  }

  const openChatGptProject = () => {
    const url = getSettings().chatGptProjectUrl?.trim()
    if (!url) {
      setMessage(t('configureChatGptProjectUrl'))
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const uploadOrderPlan = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setLoading(true)
    setMessage(t('uploadingOrderPlan'))
    try {
      const data = JSON.parse(await file.text())
      const normalized = normalizeOrderPlan(data)
      if (!normalized.orders.length) throw new Error(t('uploadOrderPlanInvalid'))
      const result = await saveOrderPlanToGitHub(data)
      if (result.status === 'disabled') {
        setMessage(t('uploadOrderPlanDisabled'))
        return
      }
      setMessage(t('uploadOrderPlanSuccess', { path: result.path || 'data/order-plan.json', count: normalized.orders.length }))
    } catch (error) {
      setMessage(error.message === t('uploadOrderPlanInvalid') ? error.message : t('uploadOrderPlanFailed', { message: error.message }))
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  return <div className="panel ai-package-panel">
    <div className="panel-head">
      <div>
        <p className="eyebrow">{t('aiProWorkflow')}</p>
        <h2>{t('aiPackageTitle')}</h2>
        <p>{t('aiPackageSubtitle')}</p>
      </div>
      <div className="ai-mode-switch">
        <button type="button" className={mode === 'QUICK' ? 'active' : ''} disabled={loading} onClick={() => setMode('QUICK')}>{t('quickIntraday')}</button>
        <button type="button" className={mode === 'FULL' ? 'active' : ''} disabled={loading} onClick={() => setMode('FULL')}>{t('fullAnalysis')}</button>
      </div>
    </div>

    <div className="ai-package-grid">
      <label>{t('focusSymbols')}
        <input value={focusInput} onChange={(event) => setFocusInput(event.target.value)} placeholder="TSLL, SOXS, RKLX, ASTX" />
      </label>
      <label>{t('moveThresholdPercent')}
        <input type="number" min="0" step="0.5" value={moveThreshold} onChange={(event) => setMoveThreshold(event.target.value)} />
      </label>
      <button type="button" className="secondary" disabled={loading} onClick={() => generate({ download: false })}>{loading ? t('generating') : t('previewCurrentMode')}</button>
      <button type="button" disabled={loading} onClick={() => generate({ download: true })}>{loading ? t('generating') : mode === 'QUICK' ? t('generateQuickSnapshot') : t('generateFullSnapshot')}</button>
    </div>

    {message && <p className="notice">{message}</p>}

    {stats ? <div className="ai-package-stats">
      <span>{t('mode')}<strong>{snapshot.snapshotMode}</strong></span>
      <span>{t('symbols')}<strong>{stats.symbols}</strong></span>
      <span>{t('positions')}<strong>{stats.positions}</strong></span>
      <span>{t('recentTrades')}<strong>{stats.trades}</strong></span>
      <span>{t('cadCash')}<strong>{stats.cadCash ? `CA$${stats.cadCash.usableAfterReserved}` : '—'}</strong></span>
      <span>{t('usdCash')}<strong>{stats.usdCash ? `$${stats.usdCash.usableAfterReserved}` : '—'}</strong></span>
      <span>{t('fileSize')}<strong>{formatBytes(stats.snapshotBytes)}</strong></span>
      <span>{t('shrinkPercent')}<strong>{stats.shrink == null ? '—' : `${stats.shrink.toFixed(1)}%`}</strong></span>
      <span>{t('warnings')}<strong>{stats.warnings}</strong></span>
    </div> : <div className="empty-inline">{t('noAiPackageYet')}</div>}

    <div className="sync-actions ai-package-actions">
      <button type="button" className="secondary" disabled={loading || !prompt} onClick={copyPrompt}>{t('copyChatGptPrompt')}</button>
      <button type="button" className="secondary" disabled={loading} onClick={openChatGptProject}>{t('openChatGptProject')}</button>
      <button type="button" disabled={loading || !snapshot} onClick={() => downloadCurrent()}>{t('downloadChatGptPackage')}</button>
      <button type="button" className="secondary" disabled={loading} onClick={() => orderPlanFileRef.current?.click()}>{t('uploadGptOrderPlan')}</button>
      <input ref={orderPlanFileRef} hidden type="file" accept="application/json,.json" onChange={uploadOrderPlan} />
    </div>
    {downloadedAt ? <small className="ai-package-meta">{t('lastDownload')}: {downloadedAt.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small> : null}
    {manualPrompt ? <textarea className="manual-prompt-box" readOnly value={manualPrompt} /> : null}
    {showJsonPreview && snapshot ? <details className="ai-snapshot-preview" open>
      <summary><span>{t('jsonPreview', { mode: snapshot.snapshotMode === 'QUICK' ? t('quickIntraday') : t('fullAnalysis') })}</span><strong>{formatBytes(stats?.snapshotBytes || 0)}</strong></summary>
      <pre>{JSON.stringify(snapshot, null, 2)}</pre>
    </details> : null}
  </div>
}
