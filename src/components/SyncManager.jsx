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
    const emitStatus = (detail) => {
      window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail }))
    }
    const savePortfolioSummary = async () => {
      if (!isGitHubSyncConfigured()) return
      const summary = await loadPortfolioSummaryExport()
      await savePortfolioSummaryToGitHub(summary)
    }
    const saveLocalData = async () => {
      const result = await saveToGitHub()
      await savePortfolioSummary()
      return { ...result, generated: 'saved' }
    }
    const save = () => {
      if (isSyncing) {
        pendingSync = true
        return
      }
      clearTimeout(timer)
      timer = setTimeout(() => {
        saveLocalData()
          .then((result) => emitStatus(result))
          .catch((error) => emitStatus({ status: 'error', error: error.message || 'GitHub sync failed.' }))
      }, 1200)
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
            emitStatus({ status: 'missing-github-settings' })
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
            try {
              await savePortfolioSummary()
              emitStatus({ ...saveResult, generated: 'saved' })
            } catch (error) {
              emitStatus({ status: 'generated-sync-error', error: error.message || 'Generated summary sync failed.' })
            }
          } else {
            emitStatus(result)
          }
        } while (pendingSync && !cancelled)
      } finally {
        isSyncing = false
      }
    }
    syncNow().catch((error) => emitStatus({ status: 'error', error: error.message || 'GitHub sync failed.' }))
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
