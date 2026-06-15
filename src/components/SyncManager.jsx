import { useEffect } from 'react'
import { saveGeneratedDataFilesToGitHub } from '../services/exportBundle'
import { isGitHubSyncConfigured, loadFromGitHub, saveToGitHub } from '../services/githubSync'
import { getAuthToken, hasGitHubDataSettings, loadSettingsFromAccount, saveSettingsToAccount } from '../services/authSync'

export default function SyncManager() {
  useEffect(() => {
    let timer
    let cancelled = false
    let isSyncing = false
    let pendingSync = false
    const saveAll = async (options = {}) => {
      const dataResult = await saveToGitHub(options)
      const generatedResult = await saveGeneratedDataFilesToGitHub()
      return { ...dataResult, generated: generatedResult }
    }
    const save = () => {
      if (isSyncing) return
      clearTimeout(timer)
      timer = setTimeout(() => saveAll()
        .then((result) => window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: result })))
        .catch((error) => window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: { status: 'error', error: error.message } }))), 1200)
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
            const saveResult = await saveAll({ skipIfRemoteCurrent: true })
            window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: saveResult }))
          } else {
            window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: result }))
          }
        } while (pendingSync && !cancelled)
      } finally {
        isSyncing = false
      }
    }
    syncNow().catch((error) => {
      window.dispatchEvent(new CustomEvent('trademarker:auto-sync-status', { detail: { status: 'error', error: error.message } }))
    })
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
