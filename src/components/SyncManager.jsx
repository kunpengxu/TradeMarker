import { useEffect } from 'react'
import { isGitHubSyncConfigured, loadFromGitHub, savePortfolioSummaryToGitHub, saveToGitHub } from '../services/githubSync'
import { getAuthToken, hasGitHubDataSettings, loadSettingsFromAccount, saveSettingsToAccount } from '../services/authSync'
import { buildPortfolioSummary } from '../services/portfolioSummary'

const DATA_KEYS_THAT_SHOULD_SAVE = new Set([
  'trademarker.watchlist',
  'trademarker.trades',
  'trademarker.plannedOrders',
  'trademarker.orderCommitments',
  'trademarker.watchlistGroups',
  'trademarker.account',
])

export default function SyncManager() {
  useEffect(() => {
    let timer
    let cancelled = false
    let isSyncing = false
    let pendingSync = false
    const savePortfolioSummaryInBackground = () => {
      buildPortfolioSummary()
        .then((portfolioSummary) => savePortfolioSummaryToGitHub(portfolioSummary))
        .catch(() => {})
    }
    const save = (event) => {
      if (event?.detail?.key && !DATA_KEYS_THAT_SHOULD_SAVE.has(event.detail.key)) return
      if (isSyncing) return
      clearTimeout(timer)
      window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: { status: 'pending-save' } }))
      timer = setTimeout(async () => {
        window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: { status: 'saving' } }))
        try {
          const result = await saveToGitHub({ skipIfRemoteCurrent: true })
          window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: result }))
          if (result.status === 'saved') savePortfolioSummaryInBackground()
        } catch (error) {
          window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: { status: 'error', message: error.message } }))
        }
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
            window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: { status: 'missing-github-settings' } }))
            return
          }
          const result = await loadFromGitHub()
          if (cancelled) return
          if (result.status === 'local-newer') {
            window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: result }))
            const saveResult = await saveToGitHub({ skipIfRemoteCurrent: true })
            window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: saveResult }))
            if (saveResult.status === 'saved') savePortfolioSummaryInBackground()
            continue
          }
          window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: result }))
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
