import { useEffect } from 'react'
import { isGitHubSyncConfigured, loadFromGitHub, savePortfolioSummaryToGitHub, saveToGitHub } from '../services/githubSync'
import { getAuthToken, hasGitHubDataSettings, loadSettingsFromAccount, saveSettingsToAccount } from '../services/authSync'
import { loadPortfolioSummaryExport } from '../services/portfolioSummaryExport'

export default function SyncManager() {
  useEffect(() => {
    let timer
    let cancelled = false
    let isSyncing = false
    let pendingSync = false
    const savePortfolioSummary = async () => {
      if (!isGitHubSyncConfigured()) return
      const summary = await loadPortfolioSummaryExport()
      await savePortfolioSummaryToGitHub(summary)
    }
    const saveLocalData = async () => {
      await saveToGitHub()
      await savePortfolioSummary()
    }
    const save = () => {
      if (isSyncing) return
      clearTimeout(timer)
      timer = setTimeout(() => saveLocalData().catch(() => {}), 1200)
    }
    const syncNow = async () => {
      if (isSyncing) {
        pendingSync = true
        return
      }
      isSyncing = true
      try {
        do {
          pendingSync = false
          if (getAuthToken()) {
            try {
              const accountResult = await loadSettingsFromAccount()
              if (accountResult.status === 'empty' && hasGitHubDataSettings()) {
                await saveSettingsToAccount()
                window.dispatchEvent(new CustomEvent('trademarker:account-settings-synced', { detail: { status: 'saved-local-settings' } }))
              } else {
                window.dispatchEvent(new CustomEvent('trademarker:account-settings-synced', { detail: accountResult }))
              }
            } catch {
              // Account settings sync is optional; local GitHub sync can still run.
            }
          }
          if (!isGitHubSyncConfigured()) {
            window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: { status: 'missing-github-settings' } }))
            return
          }
          const result = await loadFromGitHub()
          if (cancelled) return
          if (result.status === 'loaded') {
            window.location.reload()
            return
          }
          if (['current', 'empty', 'skipped-empty-remote'].includes(result.status)) {
            const saveResult = await saveToGitHub({ skipIfRemoteCurrent: true })
            await savePortfolioSummary().catch(() => {})
            window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: saveResult }))
          } else {
            window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: result }))
          }
        } while (pendingSync && !cancelled)
      } finally {
        isSyncing = false
      }
    }
    syncNow().catch(() => {})
    window.addEventListener('trademarker:data-changed', save)
    window.addEventListener('trademarker:auth-changed', syncNow)
    return () => {
      cancelled = true
      clearTimeout(timer)
      window.removeEventListener('trademarker:data-changed', save)
      window.removeEventListener('trademarker:auth-changed', syncNow)
    }
  }, [])
  return null
}
