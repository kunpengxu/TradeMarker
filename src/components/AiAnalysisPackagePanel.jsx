import { useMemo, useState } from 'react'
import { buildAiSnapshot } from '../services/aiSnapshotBuilder'
import { DEFAULT_QUICK_FOCUS_SYMBOLS } from '../services/aiPromptBuilder'
import { analysisPackageFilenames, byteSize, copyText, downloadJsonFile, downloadTextFile } from '../services/fileDownload'
import { getSettings } from '../services/storage'

const formatBytes = (bytes) => {
  if (!bytes) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function AiAnalysisPackagePanel() {
  const [mode, setMode] = useState('QUICK')
  const [focusInput, setFocusInput] = useState(DEFAULT_QUICK_FOCUS_SYMBOLS.join(', '))
  const [moveThreshold, setMoveThreshold] = useState(5)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [snapshot, setSnapshot] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [manualPrompt, setManualPrompt] = useState('')
  const [downloadedAt, setDownloadedAt] = useState(null)

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

  const focusSymbols = () => focusInput.split(/[,\s，、]+/).map((item) => item.trim().toUpperCase()).filter(Boolean)

  const downloadCurrent = (currentSnapshot = snapshot, currentPrompt = prompt) => {
    if (!currentSnapshot || !currentPrompt) {
      setMessage('请先生成分析包。')
      return
    }
    const names = analysisPackageFilenames(currentSnapshot.snapshotMode)
    downloadJsonFile(names.snapshot, currentSnapshot)
    downloadTextFile(names.prompt, currentPrompt)
    setDownloadedAt(new Date())
  }

  const generate = async (nextMode = mode) => {
    setLoading(true)
    setMessage(nextMode === 'QUICK' ? '正在生成快速盘中快照…' : '正在生成完整分析快照…')
    setManualPrompt('')
    try {
      const result = await buildAiSnapshot({
        mode: nextMode,
        focusSymbols: focusSymbols(),
        moveThreshold: Number(moveThreshold) || 5,
      })
      setMode(nextMode)
      setSnapshot(result.snapshot)
      setPrompt(result.prompt)
      downloadCurrent(result.snapshot, result.prompt)
      try {
        await copyText(result.prompt)
        setMessage('已生成、已下载，ChatGPT 提示词已复制。')
      } catch {
        setManualPrompt(result.prompt)
        setMessage('已生成并下载。剪贴板复制失败，请手动复制下面的提示词。')
      }
    } catch (error) {
      setMessage(`生成失败：${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const copyPrompt = async () => {
    if (!prompt) {
      setMessage('请先生成分析包。')
      return
    }
    try {
      await copyText(prompt)
      setMessage('ChatGPT 提示词已复制。')
    } catch {
      setManualPrompt(prompt)
      setMessage('剪贴板复制失败，请手动复制下面的提示词。')
    }
  }

  const openChatGptProject = () => {
    const url = getSettings().chatGptProjectUrl?.trim()
    if (!url) {
      setMessage('请先在 Settings 里填写 chatGptProjectUrl。')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return <div className="panel ai-package-panel">
    <div className="panel-head">
      <div>
        <p className="eyebrow">ChatGPT Pro workflow</p>
        <h2>ChatGPT AI 分析包</h2>
        <p>不调用 OpenAI API。生成较小 JSON 后手动拖到 ChatGPT Pro 项目里分析。</p>
      </div>
      <div className="ai-mode-switch">
        <button type="button" className={mode === 'QUICK' ? 'active' : ''} disabled={loading} onClick={() => setMode('QUICK')}>快速盘中</button>
        <button type="button" className={mode === 'FULL' ? 'active' : ''} disabled={loading} onClick={() => setMode('FULL')}>完整分析</button>
      </div>
    </div>

    <div className="ai-package-grid">
      <label>重点标的
        <input value={focusInput} onChange={(event) => setFocusInput(event.target.value)} placeholder="TSLL, SOXS, RKLX, ASTX" />
      </label>
      <label>涨跌幅阈值 %
        <input type="number" min="0" step="0.5" value={moveThreshold} onChange={(event) => setMoveThreshold(event.target.value)} />
      </label>
      <button type="button" disabled={loading} onClick={() => generate('QUICK')}>{loading ? '生成中…' : '生成快速盘中快照'}</button>
      <button type="button" className="secondary" disabled={loading} onClick={() => generate('FULL')}>生成完整分析快照</button>
    </div>

    {message && <p className="notice">{message}</p>}

    {stats ? <div className="ai-package-stats">
      <span>模式<strong>{snapshot.snapshotMode}</strong></span>
      <span>标的<strong>{stats.symbols}</strong></span>
      <span>持仓<strong>{stats.positions}</strong></span>
      <span>最近成交<strong>{stats.trades}</strong></span>
      <span>CAD现金<strong>{stats.cadCash ? `CA$${stats.cadCash.usableAfterReserved}` : '—'}</strong></span>
      <span>USD现金<strong>{stats.usdCash ? `$${stats.usdCash.usableAfterReserved}` : '—'}</strong></span>
      <span>文件大小<strong>{formatBytes(stats.snapshotBytes)}</strong></span>
      <span>缩小比例<strong>{stats.shrink == null ? '—' : `${stats.shrink.toFixed(1)}%`}</strong></span>
      <span>预警<strong>{stats.warnings}</strong></span>
    </div> : <div className="empty-inline">尚未生成分析包。</div>}

    <div className="sync-actions ai-package-actions">
      <button type="button" className="secondary" disabled={loading || !prompt} onClick={copyPrompt}>复制 ChatGPT 提示词</button>
      <button type="button" className="secondary" disabled={loading} onClick={openChatGptProject}>打开 ChatGPT 项目</button>
      <button type="button" disabled={loading || !snapshot} onClick={() => downloadCurrent()}>下载 ChatGPT 分析包</button>
    </div>
    {downloadedAt ? <small className="ai-package-meta">最近下载：{downloadedAt.toLocaleString()}</small> : null}
    {manualPrompt ? <textarea className="manual-prompt-box" readOnly value={manualPrompt} /> : null}
  </div>
}
