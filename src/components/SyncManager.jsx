import { useEffect } from 'react'
import { isGitHubSyncConfigured, loadFromGitHub, saveToGitHub } from '../services/githubSync'
import { getAuthToken, loadSettingsFromAccount, saveSettingsToAccount } from '../services/authSync'

export default function SyncManager() {
  useEffect(() => {
    let timer
    let cancelled = false
    let isSyncing = false
    let pendingSync = false
    const save = () => {
      if (isSyncing) return
      clearTimeout(timer)
      timer = setTimeout(() => saveToGitHub().catch(() => {}), 1200)
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
              if (accountResult.status === 'empty') await saveSettingsToAccount()
              window.dispatchEvent(new CustomEvent('trademarker:account-settings-synced', { detail: accountResult }))
            } catch {
              // Account settings sync is optional; local GitHub sync can still run.
            }
          }
          if (!isGitHubSyncConfigured()) return
          const result = await loadFromGitHub()
          if (cancelled) return
          if (result.status === 'loaded') {
            window.location.reload()
            return
          }
          if (['current', 'empty', 'skipped-empty-remote'].includes(result.status)) {
            await saveToGitHub({ skipIfRemoteCurrent: true })
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
